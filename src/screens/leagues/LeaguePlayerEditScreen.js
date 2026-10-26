import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Crest, L, LeagueScreen, pressedFx } from '../../components/leagues/LeagueUI';
import LeaguePlayerAvatar from '../../components/leagues/LeaguePlayerAvatar';
import { Field, ImageField, Pills, pickImage } from '../../components/leagues/ProfileForm';
import { getPlayer, getTeam, teamPlayers } from '../../data/leaguePreviewData';
import { fieldLabel, pendingFor, PLAYER_FIELDS, submitProfileRequest, useTeamProfiles } from '../../data/leagueTeamProfiles';
import { POSITION_NAMES } from './LeaguePlayerScreen';

const POSITIONS = Object.entries(POSITION_NAMES).map(([key, name]) => [key, name]);
const FEET = [['Diestro', 'Diestro'], ['Zurdo', 'Zurdo'], ['Ambidiestro', 'Ambidiestro']];
const LIMITS = { nickname: 20, bio: 160, instagram: 30 };

const clean = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

export default function LeaguePlayerEditScreen({ route, navigation }) {
  useTeamProfiles();
  const playerId = route.params?.playerId;
  const current = getPlayer(playerId);
  const team = getTeam(current.teamId);
  const pending = pendingFor('player', playerId);
  const [draft, setDraft] = useState(() => {
    const base = Object.fromEntries(PLAYER_FIELDS.map(({ key }) => [key, current[key] == null ? null : String(current[key])]));
    return { ...base, ...(pending?.changes || {}) };
  });
  const set = (key) => (value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const changes = useMemo(() => Object.fromEntries(
    PLAYER_FIELDS.map(({ key }) => [key, clean(draft[key])]).filter(([key, value]) => value !== clean(current[key]))
  ), [draft, current]);
  const changedKeys = Object.keys(changes);

  const takenBy = teamPlayers(current.teamId).find((player) => player.id !== playerId && String(player.number) === clean(draft.number));
  const errors = [];
  const number = Number(clean(draft.number));
  if (!clean(draft.number) || !Number.isInteger(number) || number < 1 || number > 99) errors.push('El dorsal debe ser un número del 1 al 99.');
  else if (takenBy) errors.push(`El dorsal ${number} ya lo lleva ${takenBy.name}.`);
  if (clean(draft.instagram) && !/^[A-Za-z0-9._]{1,30}$/.test(clean(draft.instagram))) errors.push('El usuario de Instagram solo admite letras, números, puntos y guiones bajos.');

  const submit = () => {
    if (errors.length) {
      Alert.alert('Revisa los datos', errors.join('\n'));
      return;
    }
    submitProfileRequest('player', playerId, current.teamId, changes, current.name);
    Alert.alert(
      'Enviado a revisión',
      'Un administrador revisará los cambios. Mientras tanto, tu perfil seguirá como está.',
      [{ text: 'Entendido', onPress: () => navigation.goBack() }]
    );
  };

  const photo = clean(draft.photoUri);

  return (
    <LeagueScreen onBack={() => navigation.goBack()} backLabel="Cancelar" scroll={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Mi perfil de liga</Text>
          <View style={styles.notice}>
            <Ionicons name="shield-checkmark-outline" size={16} color={L.gold} />
            <Text style={styles.noticeText}>Todos los cambios pasan por la aprobación de un administrador antes de publicarse.{pending ? ' Estás editando tu solicitud pendiente.' : ''}</Text>
          </View>

          <View style={[styles.preview, { borderColor: `${team.color}40` }]}>
            <Pressable onPress={async () => { const uri = await pickImage([1, 1]); if (uri) set('photoUri')(uri); }}>
              <LeaguePlayerAvatar name={current.name} photoUrl={photo} size={84} featured />
              <View style={styles.photoEdit}><Ionicons name="camera" size={13} color="#fff" /></View>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewName}>{current.name}</Text>
              {!!clean(draft.nickname) && <Text style={styles.previewNick}>“{clean(draft.nickname)}”</Text>}
              <Text style={styles.previewMeta}>#{clean(draft.number) || '–'} · {POSITION_NAMES[draft.position] || ''}</Text>
              <View style={styles.previewTeam}>
                <Crest teamId={team.id} size={18} />
                <Text style={styles.previewTeamName}>{team.name}</Text>
              </View>
            </View>
          </View>

          <View style={styles.imageRow}>
            <ImageField label="Foto de perfil" uri={photo} onPick={async () => { const uri = await pickImage([1, 1]); if (uri) set('photoUri')(uri); }} onRemove={() => set('photoUri')(null)} hint="Primer plano, cara visible y sin filtros" round />
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1.6 }}>
              <Field label="Apodo" value={draft.nickname} onChange={set('nickname')} max={LIMITS.nickname} placeholder="Cómo te llaman en el campo" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Dorsal" value={draft.number} onChange={(value) => set('number')(value.replace(/\D/g, ''))} max={2} keyboardType="number-pad" />
            </View>
          </View>
          <Pills label="Posición" options={POSITIONS} value={draft.position} onChange={set('position')} />
          <Pills label="Pie dominante" options={FEET} value={draft.foot} onChange={set('foot')} allowEmpty />
          <Field label="Presentación" value={draft.bio} onChange={set('bio')} max={LIMITS.bio} multiline placeholder="Tu estilo de juego, tu jugador favorito…" />
          <Field label="Instagram" value={draft.instagram} onChange={(value) => set('instagram')(value.replace(/^@/, '').replace(/\s/g, ''))} max={LIMITS.instagram} prefix="@" autoCapitalize="none" placeholder="usuario" />
          <Text style={styles.nameNote}>El nombre está vinculado a tu cuenta de EasyFutbol y no se cambia desde aquí.</Text>

          {!!errors.length && changedKeys.length > 0 && <Text style={styles.error}>{errors[0]}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerText} numberOfLines={1}>
            {changedKeys.length ? `${changedKeys.length} ${changedKeys.length === 1 ? 'cambio' : 'cambios'}: ${changedKeys.map((key) => fieldLabel(key, 'player')).join(', ')}` : 'Sin cambios todavía'}
          </Text>
          <Pressable disabled={!changedKeys.length} onPress={submit} style={({ pressed }) => [styles.submit, !changedKeys.length && styles.submitDisabled, pressed && pressedFx]}>
            <Text style={styles.submitText}>{pending ? 'Actualizar solicitud' : 'Enviar a revisión'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </LeagueScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 24 },
  title: { color: L.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginTop: 4 },
  notice: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 14, marginTop: 12, marginBottom: 20, backgroundColor: 'rgba(251,191,36,0.06)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)' },
  noticeText: { flex: 1, color: L.soft, fontSize: 12, lineHeight: 18 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 20, backgroundColor: L.surface, borderWidth: 1 },
  photoEdit: { position: 'absolute', right: 0, bottom: 0, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: L.accent, borderWidth: 2, borderColor: L.surface },
  previewName: { color: L.text, fontSize: 18, fontWeight: '800' },
  previewNick: { color: L.soft, fontSize: 13, fontStyle: 'italic', marginTop: 1 },
  previewMeta: { color: L.muted, fontSize: 12, fontWeight: '700', marginTop: 5 },
  previewTeam: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  previewTeamName: { color: L.soft, fontSize: 12, fontWeight: '600' },
  imageRow: { flexDirection: 'row', marginTop: 12, marginBottom: 22 },
  row: { flexDirection: 'row', gap: 10 },
  nameNote: { color: L.subtle, fontSize: 11, lineHeight: 16 },
  error: { color: L.loss, fontSize: 12, marginTop: 8 },
  footer: { paddingTop: 10, paddingBottom: 6, borderTopWidth: 1, borderTopColor: L.line, backgroundColor: L.bg },
  footerText: { color: L.muted, fontSize: 12, marginBottom: 8 },
  submit: { alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: L.accent },
  submitDisabled: { backgroundColor: L.raised },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
