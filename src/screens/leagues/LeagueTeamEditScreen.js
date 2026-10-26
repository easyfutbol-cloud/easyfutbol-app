import React, { useMemo, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Crest, L, LeagueScreen, pressedFx } from '../../components/leagues/LeagueUI';
import { Field, ImageField, pickImage } from '../../components/leagues/ProfileForm';
import { getTeam, teamPlayers } from '../../data/leaguePreviewData';
import { fieldLabel, pendingRequest, TEAM_FIELDS as PROFILE_FIELDS, submitTeamRequest, useTeamProfiles } from '../../data/leagueTeamProfiles';

export const TEAM_COLORS = [
  '#FF5A00', '#EF4444', '#EC4899', '#A855F7', '#6366F1', '#3B82F6',
  '#0EA5E9', '#14B8A6', '#22C55E', '#84CC16', '#EAB308', '#F59E0B',
  '#F8FAFC', '#94A3B8', '#1E293B', '#7C2D12',
];

const LIMITS = { name: 28, short: 4, motto: 50, bio: 280, instagram: 30 };

const clean = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

export default function LeagueTeamEditScreen({ route, navigation }) {
  useTeamProfiles();
  const teamId = route.params?.teamId;
  const current = getTeam(teamId);
  const pending = pendingRequest(teamId);
  const captain = teamPlayers(teamId).find((player) => player.captain);
  const [draft, setDraft] = useState(() => {
    const base = Object.fromEntries(PROFILE_FIELDS.map(({ key }) => [key, current[key] ?? null]));
    return { ...base, ...(pending?.changes || {}) };
  });
  const set = (key) => (value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const changes = useMemo(() => Object.fromEntries(
    PROFILE_FIELDS.map(({ key }) => [key, clean(draft[key])]).filter(([key, value]) => value !== clean(current[key]))
  ), [draft, current]);
  const changedKeys = Object.keys(changes);

  const errors = [];
  if (!clean(draft.name)) errors.push('El nombre no puede quedar vacío.');
  if (!/^[A-Z0-9]{2,4}$/.test(clean(draft.short) || '')) errors.push('La abreviatura debe tener de 2 a 4 letras o números.');
  const year = clean(draft.founded);
  if (year && (!/^\d{4}$/.test(year) || Number(year) < 1900 || Number(year) > new Date().getFullYear())) errors.push('El año de fundación no es válido.');
  if (clean(draft.instagram) && !/^[A-Za-z0-9._]{1,30}$/.test(clean(draft.instagram))) errors.push('El usuario de Instagram solo admite letras, números, puntos y guiones bajos.');

  const pick = async (key, aspect) => {
    const uri = await pickImage(aspect);
    if (uri) set(key)(uri);
  };

  const submit = () => {
    if (errors.length) {
      Alert.alert('Revisa los datos', errors.join('\n'));
      return;
    }
    submitTeamRequest(teamId, changes, captain?.name || 'Capitán');
    Alert.alert(
      'Enviado a revisión',
      'Un administrador revisará los cambios. Mientras tanto, el perfil del equipo seguirá como está.',
      [{ text: 'Entendido', onPress: () => navigation.goBack() }]
    );
  };

  const preview = { ...current, ...Object.fromEntries(PROFILE_FIELDS.map(({ key }) => [key, clean(draft[key]) ?? (key === 'name' || key === 'short' || key === 'color' ? current[key] : null)])) };

  return (
    <LeagueScreen onBack={() => navigation.goBack()} backLabel="Cancelar" scroll={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Personalizar equipo</Text>
          <View style={styles.notice}>
            <Ionicons name="shield-checkmark-outline" size={16} color={L.gold} />
            <Text style={styles.noticeText}>Todos los cambios pasan por la aprobación de un administrador antes de publicarse.{pending ? ' Estás editando tu solicitud pendiente.' : ''}</Text>
          </View>

          <Text style={styles.label}>VISTA PREVIA</Text>
          <View style={styles.preview}>
            <Pressable onPress={() => pick('bannerUri', [16, 9])} style={styles.banner}>
              {preview.bannerUri ? (
                <Image source={{ uri: preview.bannerUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <LinearGradient colors={[`${preview.color}AA`, `${preview.color}33`, L.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              )}
              <View style={styles.bannerEdit}><Ionicons name="camera-outline" size={14} color="#fff" /><Text style={styles.bannerEditText}>Banner</Text></View>
            </Pressable>
            <View style={styles.previewIdentity}>
              <Pressable onPress={() => pick('crestUri', [1, 1])} style={styles.crestRing}>
                <Crest team={preview} size={72} />
                <View style={styles.crestEdit}><Ionicons name="camera" size={12} color="#fff" /></View>
              </Pressable>
              <Text style={styles.previewName}>{preview.name}</Text>
              {!!preview.motto && <Text style={styles.previewMotto}>“{preview.motto}”</Text>}
            </View>
          </View>

          <View style={styles.imageButtons}>
            <ImageField label="Escudo" uri={draft.crestUri} onPick={() => pick('crestUri', [1, 1])} onRemove={() => set('crestUri')(null)} hint="Cuadrado, fondo limpio" />
            <ImageField label="Banner" uri={draft.bannerUri} onPick={() => pick('bannerUri', [16, 9])} onRemove={() => set('bannerUri')(null)} hint="Horizontal, foto del equipo" wide />
          </View>

          <Text style={styles.label}>COLOR DEL EQUIPO</Text>
          <View style={styles.swatches}>
            {TEAM_COLORS.map((color) => {
              const active = (draft.color || current.color) === color;
              return (
                <Pressable key={color} onPress={() => set('color')(color)} style={[styles.swatch, { backgroundColor: color }, active && styles.swatchActive]}>
                  {active && <Ionicons name="checkmark" size={16} color={color === '#F8FAFC' ? '#111' : '#fff'} />}
                </Pressable>
              );
            })}
          </View>

          <Field label="Nombre" value={draft.name} onChange={set('name')} max={LIMITS.name} />
          <Field label="Abreviatura" value={draft.short} onChange={(value) => set('short')(value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} max={LIMITS.short} hint="Se usa en el escudo provisional y en tablas" autoCapitalize="characters" />
          <Field label="Lema" value={draft.motto} onChange={set('motto')} max={LIMITS.motto} placeholder="Ej.: Hasta el último minuto" />
          <Field label="Presentación" value={draft.bio} onChange={set('bio')} max={LIMITS.bio} multiline placeholder="Cuenta quiénes sois, desde cuándo jugáis juntos…" />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field label="Fundado en" value={draft.founded} onChange={(value) => set('founded')(value.replace(/\D/g, ''))} max={4} keyboardType="number-pad" placeholder="2020" />
            </View>
            <View style={{ flex: 1.6 }}>
              <Field label="Instagram" value={draft.instagram} onChange={(value) => set('instagram')(value.replace(/^@/, '').replace(/\s/g, ''))} max={LIMITS.instagram} prefix="@" autoCapitalize="none" placeholder="usuario" />
            </View>
          </View>

          {!!errors.length && changedKeys.length > 0 && <Text style={styles.error}>{errors[0]}</Text>}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerText} numberOfLines={1}>
            {changedKeys.length ? `${changedKeys.length} ${changedKeys.length === 1 ? 'cambio' : 'cambios'}: ${changedKeys.map(fieldLabel).join(', ')}` : 'Sin cambios todavía'}
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
  label: { color: L.subtle, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },

  preview: { borderRadius: 20, overflow: 'hidden', backgroundColor: L.surface, borderWidth: 1, borderColor: L.line },
  banner: { height: 130, backgroundColor: L.raised },
  bannerEdit: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' },
  bannerEditText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  previewIdentity: { alignItems: 'center', paddingBottom: 18, marginTop: -40 },
  crestRing: { padding: 4, borderRadius: 28, backgroundColor: L.surface },
  crestEdit: { position: 'absolute', right: 0, bottom: 0, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: L.accent, borderWidth: 2, borderColor: L.surface },
  previewName: { color: L.text, fontSize: 20, fontWeight: '800', marginTop: 8, textAlign: 'center', paddingHorizontal: 16 },
  previewMotto: { color: L.soft, fontSize: 13, fontStyle: 'italic', marginTop: 3, textAlign: 'center', paddingHorizontal: 16 },

  imageButtons: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 22 },

  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  swatch: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  swatchActive: { borderWidth: 3, borderColor: L.text },

  row: { flexDirection: 'row', gap: 10 },
  error: { color: L.loss, fontSize: 12, marginTop: 4 },

  footer: { paddingTop: 10, paddingBottom: 6, borderTopWidth: 1, borderTopColor: L.line, backgroundColor: L.bg },
  footerText: { color: L.muted, fontSize: 12, marginBottom: 8 },
  submit: { alignItems: 'center', paddingVertical: 14, borderRadius: 14, backgroundColor: L.accent },
  submitDisabled: { backgroundColor: L.raised },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
