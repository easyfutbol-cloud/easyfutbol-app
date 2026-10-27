import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';

const TEAMS_OPTIONS = [
  { value: 'balanced', label: 'Sí' },
  { value: 'so_so', label: 'Más o menos' },
  { value: 'unbalanced', label: 'No' },
];

function Stars({ value, onChange, label }) {
  return (
    <View style={styles.row}>
      <Text style={styles.question}>{label}</Text>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity key={star} onPress={() => onChange(star)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${label}: ${star} de 5`}>
            <Ionicons name={star <= (value || 0) ? 'star' : 'star-outline'} size={24} color={star <= (value || 0) ? '#ff5a00' : '#4a4d55'} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// Valoración rápida tras jugar: equipos igualados, organizador y campo.
// Sirve para saber por qué no repiten los que no repiten.
export default function MatchFeedbackCard({ match, onDone, style }) {
  const [teams, setTeams] = useState(null);
  const [organizer, setOrganizer] = useState(null);
  const [field, setField] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (!match) return null;
  const answered = Boolean(teams || organizer || field);

  const submit = async (dismissed = false) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/matches/${match.id}/feedback`, dismissed
        ? { dismissed: true }
        : { teams_balance: teams, organizer_rating: organizer, field_rating: field });
      if (dismissed) {
        onDone?.();
      } else {
        setSent(true);
        setTimeout(() => onDone?.(), 1500);
      }
    } catch {
      // Sin red: se puede volver a intentar; no merece una alerta.
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <View style={[styles.card, styles.thanks, style]}>
        <Ionicons name="checkmark-circle" size={22} color="#ff5a00" />
        <Text style={styles.thanksText}>¡Gracias! Nos ayuda a montar mejores partidos.</Text>
      </View>
    );
  }

  const when = new Date(match.starts_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>¿QUÉ TAL EL PARTIDO?</Text>
          <Text style={styles.title} numberOfLines={1}>{match.field_name || match.title} · {when}</Text>
        </View>
        <TouchableOpacity onPress={() => submit(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Ahora no">
          <Ionicons name="close" size={20} color="#777" />
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <Text style={styles.question}>¿Equipos igualados?</Text>
        <View style={styles.chips}>
          {TEAMS_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.chip, teams === option.value && styles.chipActive]}
              onPress={() => setTeams(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: teams === option.value }}
            >
              <Text style={[styles.chipText, teams === option.value && styles.chipTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Stars label="Organizador" value={organizer} onChange={setOrganizer} />
      <Stars label="Campo" value={field} onChange={setField} />

      <TouchableOpacity style={[styles.submit, !answered && styles.submitDisabled]} disabled={!answered || busy} onPress={() => submit(false)} accessibilityRole="button">
        {busy ? <ActivityIndicator color="#050505" /> : <Text style={styles.submitText}>Enviar</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 18, backgroundColor: '#15171c', borderWidth: 1, borderColor: '#262931' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  eyebrow: { color: '#ff5a00', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 },
  question: { color: '#c9cbd0', fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: '#1f2229', borderWidth: 1, borderColor: '#30343c' },
  chipActive: { backgroundColor: '#ff5a00', borderColor: '#ff5a00' },
  chipText: { color: '#c9cbd0', fontSize: 12, fontWeight: '800' },
  chipTextActive: { color: '#050505' },
  stars: { flexDirection: 'row', gap: 4 },
  submit: { marginTop: 16, height: 44, borderRadius: 12, backgroundColor: '#ff5a00', alignItems: 'center', justifyContent: 'center' },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: '#050505', fontSize: 14, fontWeight: '900' },
  thanks: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thanksText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '700' },
});
