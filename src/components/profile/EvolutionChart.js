// Barras de partidos por mes (últimos 6 meses) y, si el jugador los enseña,
// los goles de cada mes encima de la barra.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { withAlpha } from '../../utils/profileTheme';

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const BAR_HEIGHT = 110;

export default function EvolutionChart({ months = [], accent = '#ff5a00' }) {
  if (!months.length) return null;
  const max = Math.max(1, ...months.map((m) => m.matches_played));
  const total = months.reduce((sum, m) => sum + m.matches_played, 0);
  const showGoals = months.some((m) => m.goals !== null);
  const totalGoals = showGoals ? months.reduce((sum, m) => sum + (m.goals || 0), 0) : null;
  const best = months.reduce((top, m) => (m.matches_played > (top?.matches_played || 0) ? m : top), null);

  return (
    <View>
      <View style={styles.summary}>
        <Summary value={total} label={total === 1 ? 'partido' : 'partidos'} />
        {showGoals ? <Summary value={totalGoals} label={totalGoals === 1 ? 'gol' : 'goles'} /> : null}
        {best ? <Summary value={MONTHS[Number(best.month.slice(5, 7)) - 1]} label="mejor mes" /> : null}
      </View>
      <View style={styles.chart}>
        {months.map((m) => {
          const height = m.matches_played ? Math.max(8, (m.matches_played / max) * BAR_HEIGHT) : 4;
          const current = m === months[months.length - 1];
          return (
            <View key={m.month} style={styles.column}>
              <Text style={styles.value}>{m.matches_played || ''}</Text>
              <View style={[styles.bar, { height, backgroundColor: m.matches_played ? (current ? accent : withAlpha(accent, 0.55)) : '#26262a' }]}>
                {m.goals > 0 && height >= 22 ? <Text style={styles.goals}>⚽{m.goals}</Text> : null}
              </View>
              <Text style={[styles.month, current && { color: '#fff' }]}>{MONTHS[Number(m.month.slice(5, 7)) - 1]}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Summary({ value, label }) {
  return <View style={styles.summaryItem}><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: 10, marginTop: 14 },
  summaryItem: { flex: 1, backgroundColor: '#202023', borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
  summaryValue: { color: '#fff', fontSize: 19, fontWeight: '900' },
  summaryLabel: { color: '#85858c', fontSize: 10, fontWeight: '800', marginTop: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 18, height: BAR_HEIGHT + 44 },
  column: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  value: { color: '#c9cbd0', fontSize: 11, fontWeight: '900', marginBottom: 4 },
  bar: { width: '100%', borderRadius: 8, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4 },
  goals: { color: '#fff', fontSize: 9, fontWeight: '900' },
  month: { color: '#77777e', fontSize: 9, fontWeight: '900', marginTop: 6, letterSpacing: 0.5 },
});
