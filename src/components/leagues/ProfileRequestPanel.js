import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { L, pressedFx } from './LeagueUI';
import { fieldLabel, pendingCount, pendingFor, requestsFor, STATUS_LABEL, timeAgo, useTeamProfiles, withdrawRequest } from '../../data/leagueTeamProfiles';

// Bloque "zona del capitán" / "tu perfil": estado de la solicitud y acceso al editor.
export default function ProfileRequestPanel({ kind, targetId, icon, title, subtitle, editLabel, onEdit, onReview }) {
  useTeamProfiles();
  const pending = pendingFor(kind, targetId);
  const lastReviewed = requestsFor(kind, targetId).find((request) => request.status !== 'pending');
  const toReview = pendingCount();
  const label = (key) => fieldLabel(key, kind);
  const rejected = lastReviewed?.status === 'rejected';
  const withdraw = () => Alert.alert('Retirar solicitud', 'Los cambios enviados se descartarán.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Retirar', style: 'destructive', onPress: () => withdrawRequest(pending.id) },
  ]);

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <View style={styles.badge}><Ionicons name={icon} size={15} color={L.accent} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>

      {pending ? (
        <View style={[styles.status, styles.pending]}>
          <View style={styles.statusHead}>
            <Ionicons name="time-outline" size={15} color={L.gold} />
            <Text style={[styles.statusTitle, { color: L.gold }]}>En revisión · {timeAgo(pending.submittedAt)}</Text>
          </View>
          <Text style={styles.statusText}>{Object.keys(pending.changes).map(label).join(' · ')}</Text>
          <Text style={styles.statusHint}>Los cambios se publicarán cuando un administrador los apruebe.</Text>
          <View style={styles.actions}>
            <Pressable onPress={onEdit} hitSlop={6}><Text style={styles.action}>Editar solicitud</Text></Pressable>
            <Pressable onPress={withdraw} hitSlop={6}><Text style={[styles.action, { color: L.loss }]}>Retirar</Text></Pressable>
          </View>
        </View>
      ) : lastReviewed ? (
        <View style={[styles.status, rejected ? styles.rejected : styles.approved]}>
          <View style={styles.statusHead}>
            <Ionicons name={rejected ? 'close-circle-outline' : 'checkmark-circle-outline'} size={15} color={rejected ? L.loss : L.win} />
            <Text style={[styles.statusTitle, { color: rejected ? L.loss : L.win }]}>Última solicitud: {STATUS_LABEL[lastReviewed.status].toLowerCase()}</Text>
          </View>
          {lastReviewed.status === 'partial' && (
            <Text style={styles.statusText}>No aprobado: {Object.keys(lastReviewed.changes).filter((key) => !lastReviewed.approvedKeys.includes(key)).map(label).join(' · ')}</Text>
          )}
          {!!lastReviewed.note && <Text style={styles.statusText}>Nota del administrador: {lastReviewed.note}</Text>}
        </View>
      ) : null}

      {!pending && (
        <Pressable onPress={onEdit} style={({ pressed }) => [styles.edit, pressed && pressedFx]}>
          <Ionicons name="create-outline" size={17} color="#fff" />
          <Text style={styles.editText}>{editLabel}</Text>
        </Pressable>
      )}

      <Pressable onPress={onReview} style={styles.review}>
        <Ionicons name="shield-checkmark-outline" size={14} color={L.muted} />
        <Text style={styles.reviewText}>Revisar como administrador (demo){toReview ? ` · ${toReview} pendiente${toReview > 1 ? 's' : ''}` : ''}</Text>
        <Ionicons name="chevron-forward" size={14} color={L.subtle} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 12, padding: 16, borderRadius: 22, backgroundColor: L.surface, borderWidth: 1, borderColor: 'rgba(255,90,0,0.25)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: L.accentSoft },
  title: { color: L.text, fontSize: 14, fontWeight: '800' },
  subtitle: { color: L.muted, fontSize: 12, marginTop: 1 },
  status: { marginTop: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  pending: { backgroundColor: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.22)' },
  approved: { backgroundColor: 'rgba(52,211,153,0.06)', borderColor: 'rgba(52,211,153,0.2)' },
  rejected: { backgroundColor: 'rgba(248,113,113,0.06)', borderColor: 'rgba(248,113,113,0.22)' },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusTitle: { fontSize: 13, fontWeight: '800' },
  statusText: { color: L.soft, fontSize: 12, lineHeight: 18, marginTop: 6 },
  statusHint: { color: L.muted, fontSize: 11, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 10 },
  action: { color: L.text, fontSize: 13, fontWeight: '800' },
  edit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 13, borderRadius: 14, backgroundColor: L.accent, shadowColor: L.accent, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  editText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  review: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: L.line },
  reviewText: { flex: 1, color: L.muted, fontSize: 12, fontWeight: '600' },
});
