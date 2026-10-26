import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Crest, Divider, L, LeagueScreen, PageTitle, pressedFx, Segmented } from '../../components/leagues/LeagueUI';
import LeaguePlayerAvatar from '../../components/leagues/LeaguePlayerAvatar';
import { getPlayer, getTeam, teamPlayers } from '../../data/leaguePreviewData';
import {
  fieldLabel, fieldsFor, resetTeamProfilesDemo, reviewRequest, STATUS_LABEL, timeAgo, useTeamProfiles,
} from '../../data/leagueTeamProfiles';
import { POSITION_NAMES } from './LeaguePlayerScreen';

const KIND_FILTERS = [['all', 'Todo'], ['team', 'Equipos'], ['player', 'Jugadores']];

const STATUS_COLOR = { pending: L.gold, approved: L.win, partial: L.win, rejected: L.loss };

export default function LeagueTeamRequestsScreen({ navigation }) {
  const { requests } = useTeamProfiles();
  const [view, setView] = useState('pending');
  const [kind, setKind] = useState('all');
  const visible = requests.filter((request) => kind === 'all' || request.kind === kind);
  const pending = visible.filter((request) => request.status === 'pending');
  const history = visible.filter((request) => request.status !== 'pending').sort((a, b) => (b.reviewedAt || '').localeCompare(a.reviewedAt || ''));
  const list = view === 'pending' ? pending : history;

  const reset = () => Alert.alert('Restablecer demo', 'Se borran los perfiles aprobados y las solicitudes, y vuelven las solicitudes de ejemplo.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Restablecer', style: 'destructive', onPress: resetTeamProfilesDemo },
  ]);

  return (
    <LeagueScreen onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('AdminPanel'))} backLabel="Atrás">
      <PageTitle kicker="ADMINISTRACIÓN" title="Perfiles de la liga" subtitle="Capitanes y jugadores proponen cambios y nada se publica hasta que lo apruebas." />
      <Segmented options={[['pending', `Pendientes${pending.length ? ` · ${pending.length}` : ''}`], ['history', 'Historial']]} value={view} onChange={setView} style={styles.segmented} />
      <View style={styles.kinds}>
        {KIND_FILTERS.map(([key, label]) => (
          <Pressable key={key} onPress={() => setKind(key)} style={[styles.kind, kind === key && styles.kindActive]}>
            <Text style={[styles.kindText, kind === key && styles.kindTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {list.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name={view === 'pending' ? 'checkmark-done-outline' : 'time-outline'} size={28} color={L.subtle} />
          <Text style={styles.emptyTitle}>{view === 'pending' ? 'Todo revisado' : 'Sin revisiones todavía'}</Text>
          <Text style={styles.emptyText}>{view === 'pending' ? 'No hay solicitudes esperando aprobación.' : 'Las solicitudes revisadas aparecerán aquí.'}</Text>
        </View>
      ) : (
        list.map((request) => (view === 'pending'
          ? <PendingRequest key={request.id} request={request} onOpenTeam={() => navigation.navigate(request.kind === 'player' ? 'LeaguePlayer' : 'LeagueTeam', request.kind === 'player' ? { playerId: request.targetId } : { teamId: request.teamId })} />
          : <ReviewedRequest key={request.id} request={request} />))
      )}

      <Pressable onPress={reset} style={styles.reset}>
        <Ionicons name="refresh-outline" size={14} color={L.subtle} />
        <Text style={styles.resetText}>Restablecer datos de la demo</Text>
      </Pressable>
    </LeagueScreen>
  );
}

const targetOf = (request) => (request.kind === 'player' ? getPlayer(request.targetId) : getTeam(request.targetId));

function RequestHeader({ request, onOpenTeam }) {
  const team = getTeam(request.teamId);
  const player = request.kind === 'player' ? getPlayer(request.targetId) : null;
  return (
    <Pressable onPress={onOpenTeam} disabled={!onOpenTeam} style={styles.head}>
      {player ? <LeaguePlayerAvatar name={player.name} playerId={player.id} size={36} /> : <Crest teamId={request.teamId} size={36} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.team}>{player ? player.name : team.name}</Text>
        <Text style={styles.meta}>{player ? `Jugador · ${team.short}` : `Equipo · ${request.submittedBy}`} · {timeAgo(request.submittedAt)}</Text>
      </View>
      <View style={[styles.badge, { borderColor: `${STATUS_COLOR[request.status]}55` }]}>
        <Text style={[styles.badgeText, { color: STATUS_COLOR[request.status] }]}>{STATUS_LABEL[request.status]}</Text>
      </View>
    </Pressable>
  );
}

function PendingRequest({ request, onOpenTeam }) {
  const label = (key) => fieldLabel(key, request.kind);
  const keys = fieldsFor(request.kind).map(({ key }) => key).filter((key) => key in request.changes);
  const target = targetOf(request);
  const numberClash = request.kind === 'player' && request.changes.number
    ? teamPlayers(request.teamId).find((player) => player.id !== request.targetId && String(player.number) === String(request.changes.number))
    : null;
  // Un dorsal que ya lleva un compañero sale desmarcado por defecto.
  const suggested = keys.filter((key) => !(key === 'number' && numberClash));
  const [selected, setSelected] = useState(suggested);
  const [note, setNote] = useState('');
  useEffect(() => setSelected(suggested), [request.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (key) => setSelected((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  const all = selected.length === keys.length;

  const approve = () => {
    const partial = selected.length < keys.length;
    Alert.alert(
      partial ? 'Aprobar parcialmente' : 'Aprobar cambios',
      partial
        ? `Se publicarán: ${selected.map(label).join(', ')}.\nSe rechazarán: ${keys.filter((key) => !selected.includes(key)).map(label).join(', ')}.`
        : request.kind === 'player' ? 'Los cambios se publicarán en el perfil del jugador.' : 'Los cambios se publicarán en el perfil del equipo.',
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Aprobar', onPress: () => reviewRequest(request.id, selected, note) }]
    );
  };
  const reject = () => {
    if (!note.trim()) {
      Alert.alert('Añade un motivo', 'Escribe una nota para que sepa por qué se rechaza.');
      return;
    }
    reviewRequest(request.id, [], note);
  };

  return (
    <Card style={styles.card}>
      <RequestHeader request={request} onOpenTeam={onOpenTeam} />
      <Divider style={styles.divider} />
      <View style={styles.selectHead}>
        <Text style={styles.label}>{keys.length} {keys.length === 1 ? 'CAMBIO' : 'CAMBIOS'} PROPUESTOS</Text>
        <Pressable onPress={() => setSelected(all ? [] : keys)} hitSlop={6}><Text style={styles.selectAll}>{all ? 'Desmarcar todo' : 'Marcar todo'}</Text></Pressable>
      </View>
      {keys.map((key) => {
        const on = selected.includes(key);
        return (
          <Pressable key={key} onPress={() => toggle(key)} style={[styles.change, on && styles.changeOn]}>
            <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? L.accent : L.subtle} />
            <View style={{ flex: 1 }}>
              <Text style={styles.changeLabel}>{label(key)}</Text>
              <ChangeValue kind={request.kind} field={key} before={target[key]} after={request.changes[key]} />
              {key === 'number' && numberClash && (
                <Text style={styles.warning}>Ese dorsal lo lleva ahora {numberClash.name}.</Text>
              )}
            </View>
          </Pressable>
        );
      })}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Nota para quien lo solicita (obligatoria si rechazas)"
        placeholderTextColor={L.subtle}
        multiline
        maxLength={200}
        style={styles.note}
      />
      <View style={styles.actions}>
        <Pressable onPress={reject} style={({ pressed }) => [styles.rejectButton, pressed && pressedFx]}>
          <Text style={styles.rejectText}>Rechazar todo</Text>
        </Pressable>
        <Pressable disabled={!selected.length} onPress={approve} style={({ pressed }) => [styles.approveButton, !selected.length && styles.disabled, pressed && pressedFx]}>
          <Text style={styles.approveText}>{all ? 'Aprobar todo' : `Aprobar ${selected.length}`}</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function ChangeValue({ kind, field, before, after }) {
  const type = fieldsFor(kind).find((item) => item.key === field)?.type;
  const show = (value) => (field === 'position' && value ? POSITION_NAMES[value] || value : value);
  if (type === 'image') {
    const wide = field === 'bannerUri';
    const round = field === 'photoUri';
    return (
      <View style={styles.compare}>
        <ImageBox uri={before} wide={wide} round={round} />
        <Ionicons name="arrow-forward" size={14} color={L.subtle} />
        <ImageBox uri={after} wide={wide} round={round} />
      </View>
    );
  }
  if (type === 'color') {
    return (
      <View style={styles.compare}>
        <View style={[styles.colorChip, { backgroundColor: before }]} />
        <Ionicons name="arrow-forward" size={14} color={L.subtle} />
        <View style={[styles.colorChip, { backgroundColor: after }]} />
      </View>
    );
  }
  return (
    <View style={styles.textCompare}>
      {before != null && before !== '' && <Text style={styles.before} numberOfLines={2}>{show(String(before))}</Text>}
      <Text style={styles.after}>{after != null ? show(after) : 'Eliminado'}</Text>
    </View>
  );
}

function ImageBox({ uri, wide, round }) {
  return (
    <View style={[styles.imageBox, wide && styles.imageBoxWide, round && { borderRadius: 28 }]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Text style={styles.imageEmpty}>Sin imagen</Text>}
    </View>
  );
}

function ReviewedRequest({ request }) {
  const keys = Object.keys(request.changes);
  return (
    <Card style={styles.card}>
      <RequestHeader request={request} />
      <View style={styles.historyList}>
        {keys.map((key) => {
          const ok = request.approvedKeys?.includes(key);
          return (
            <View key={key} style={styles.historyItem}>
              <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={15} color={ok ? L.win : L.loss} />
              <Text style={styles.historyText}>{fieldLabel(key, request.kind)}</Text>
            </View>
          );
        })}
      </View>
      {!!request.note && <Text style={styles.historyNote}>“{request.note}”</Text>}
      {!!request.reviewedAt && <Text style={styles.historyMeta}>Revisada {timeAgo(request.reviewedAt)}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  segmented: { marginBottom: 10 },
  kinds: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  kind: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: L.line },
  kindActive: { backgroundColor: L.raised, borderColor: L.raised },
  kindText: { color: L.muted, fontSize: 12, fontWeight: '700' },
  kindTextActive: { color: L.text },
  warning: { color: L.gold, fontSize: 11, fontWeight: '700', marginTop: 6 },
  card: { marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  team: { color: L.text, fontSize: 15, fontWeight: '800' },
  meta: { color: L.muted, fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  divider: { marginVertical: 14 },
  selectHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  label: { color: L.subtle, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  selectAll: { color: L.accent, fontSize: 12, fontWeight: '700' },
  change: { flexDirection: 'row', gap: 10, padding: 10, borderRadius: 12, marginBottom: 6, borderWidth: 1, borderColor: L.line },
  changeOn: { borderColor: 'rgba(255,90,0,0.3)', backgroundColor: 'rgba(255,90,0,0.05)' },
  changeLabel: { color: L.text, fontSize: 13, fontWeight: '800', marginTop: 1 },
  compare: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  textCompare: { marginTop: 4, gap: 2 },
  before: { color: L.subtle, fontSize: 13, textDecorationLine: 'line-through' },
  after: { color: L.soft, fontSize: 13, lineHeight: 19 },
  colorChip: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  imageBox: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: L.raised },
  imageBoxWide: { width: 96, height: 54 },
  imageEmpty: { color: L.subtle, fontSize: 9, fontWeight: '700', textAlign: 'center' },
  note: { minHeight: 64, marginTop: 8, padding: 12, borderRadius: 12, color: L.text, fontSize: 13, textAlignVertical: 'top', backgroundColor: L.bg, borderWidth: 1, borderColor: L.line },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  rejectButton: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(248,113,113,0.35)' },
  rejectText: { color: L.loss, fontSize: 14, fontWeight: '800' },
  approveButton: { flex: 1.3, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: L.accent },
  approveText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  disabled: { backgroundColor: L.raised },
  historyList: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  historyItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyText: { color: L.soft, fontSize: 12, fontWeight: '600' },
  historyNote: { color: L.muted, fontSize: 12, fontStyle: 'italic', marginTop: 10 },
  historyMeta: { color: L.subtle, fontSize: 11, marginTop: 8 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { color: L.text, fontSize: 16, fontWeight: '800', marginTop: 10 },
  emptyText: { color: L.muted, fontSize: 13, marginTop: 4 },
  reset: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginTop: 6 },
  resetText: { color: L.subtle, fontSize: 12, fontWeight: '600' },
});
