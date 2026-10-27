import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
  const hour = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${hour}`;
}

// "Repetir la semana que viene": el siguiente partido del mismo hueco
// (mismo día, hora y sede) que devuelve el acta en `next_match`.
export default function RepeatMatchCard({ match, onPress, style }) {
  if (!match) return null;
  const spots = Number(match.spots_left || 0);
  const details = [match.field_name, spots ? `${spots === 1 ? 'queda 1 plaza' : `quedan ${spots} plazas`}` : null].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity
      style={[styles.card, style]}
      onPress={() => onPress?.(match)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Repetir: ${formatWhen(match.starts_at)}. ${details}`}
    >
      <View style={styles.icon}><Ionicons name="repeat" size={20} color="#050505" /></View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>¿REPITES?</Text>
        <Text style={styles.title} numberOfLines={1}>{formatWhen(match.starts_at)}</Text>
        {details ? <Text style={styles.details} numberOfLines={1}>{details}</Text> : null}
      </View>
      <View style={styles.cta}><Text style={styles.ctaText}>Apuntarme</Text></View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: '#15171c', borderWidth: 1, borderColor: 'rgba(255,90,0,.45)' },
  icon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#ff5a00', alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  eyebrow: { color: '#ff5a00', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 2 },
  details: { color: '#8d9097', fontSize: 11, marginTop: 2 },
  cta: { backgroundColor: '#ff5a00', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11 },
  ctaText: { color: '#050505', fontSize: 12, fontWeight: '900' },
});
