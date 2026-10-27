import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';

const PERIODS = [7, 30, 90];
const TEAMS_LABELS = { balanced: 'Igualados', so_so: 'Más o menos', unbalanced: 'Descompensados' };
const NUDGE_HELP = {
  slot_alert: 'Se apuntan a ese partido',
  reactivation: 'Se apuntan a algo en 7 días',
  idle_balance: 'Gastan un EasyPass en 7 días',
  friend_joined: 'Se apuntan a ese partido',
};

const fmtPct = (value) => (value === null || value === undefined ? '—' : `${String(value).replace('.', ',')}%`);
const fmtAvg = (value) => (value === null || value === undefined ? '—' : String(value).replace('.', ','));

function Stat({ label, value, sub }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

// Panel de las ideas de retención: repetir partido, avisos automáticos y
// valoraciones de los jugadores.
export default function AdminRetentionScreen({ navigation }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (period, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/admin/retention', { params: { days: period } });
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.msg || 'No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(days); }, [load, days]));

  const feedback = data?.feedback;
  const teamsTotal = feedback ? Object.values(feedback.teams).reduce((sum, n) => sum + n, 0) : 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(days, true); }} tintColor="#ff5a00" />}
      >
        <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={18} color="#ccc" />
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Retención</Text>
        <Text style={styles.screenSubtitle}>Si los jugadores repiten, qué efecto tienen los avisos y cómo valoran los partidos.</Text>

        <View style={styles.periods}>
          {PERIODS.map((period) => (
            <TouchableOpacity key={period} style={[styles.period, days === period && styles.periodActive]} onPress={() => setDays(period)}>
              <Text style={[styles.periodText, days === period && styles.periodTextActive]}>{period} días</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? <ActivityIndicator size="large" color="#ff5a00" style={{ marginTop: 40 }} /> : null}
        {!loading && error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && data ? (
          <>
            <Text style={styles.section}>Repetir</Text>
            <View style={styles.card}>
              <View style={styles.statsRow}>
                <Stat label="Se apuntan en 24 h" value={fmtPct(data.repeat.rejoin_24h_rate)} sub="tras terminar un partido" />
                <Stat label="Participaciones" value={String(data.repeat.played)} sub="en el periodo" />
              </View>
            </View>

            <Text style={styles.section}>Avisos automáticos</Text>
            {data.nudges.map((nudge) => (
              <View key={nudge.type} style={[styles.card, styles.rowCard]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{nudge.label}</Text>
                  <Text style={styles.meta}>{nudge.sent} enviados · {NUDGE_HELP[nudge.type]}</Text>
                </View>
                <Text style={styles.big}>{fmtPct(nudge.conversion_rate)}</Text>
              </View>
            ))}

            {data.social?.length ? (
              <>
                <Text style={styles.section}>Amigos</Text>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Jugadores que repiten (2+ partidos)</Text>
                  {data.social.map((row) => (
                    <View key={row.bucket} style={styles.lineRow}>
                      <Text style={styles.lineLabel}>{row.bucket} ({row.players})</Text>
                      <Text style={styles.lineValue}>{fmtPct(row.repeat_rate)} · {fmtAvg(row.matches_avg)} partidos</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.section}>Valoraciones</Text>
            <View style={styles.card}>
              <View style={styles.statsRow}>
                <Stat label="Respuestas" value={String(feedback.responses)} sub={`${fmtPct(feedback.response_rate)} de los que jugaron`} />
                <Stat label="Organizador" value={`${fmtAvg(feedback.organizer_avg)} ★`} />
                <Stat label="Campo" value={`${fmtAvg(feedback.field_avg)} ★`} />
              </View>
              <Text style={[styles.meta, { marginTop: 14 }]}>¿Equipos igualados?</Text>
              {Object.entries(feedback.teams).map(([key, count]) => (
                <View key={key} style={styles.barRow}>
                  <Text style={styles.barLabel}>{TEAMS_LABELS[key]}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${teamsTotal ? (count / teamsTotal) * 100 : 0}%` }, key === 'unbalanced' && styles.barBad]} />
                  </View>
                  <Text style={styles.barCount}>{count}</Text>
                </View>
              ))}
            </View>

            {feedback.return_by_sentiment.length ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>¿Vuelven a jugar en 14 días?</Text>
                {feedback.return_by_sentiment.map((row) => (
                  <View key={row.bucket} style={styles.lineRow}>
                    <Text style={styles.lineLabel}>{row.bucket} ({row.players})</Text>
                    <Text style={styles.lineValue}>{fmtPct(row.return_rate)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {feedback.by_field.length ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Por campo</Text>
                {feedback.by_field.map((row) => (
                  <View key={row.field_name} style={styles.lineRow}>
                    <Text style={styles.lineLabel} numberOfLines={1}>{row.field_name} ({row.responses})</Text>
                    <Text style={styles.lineValue}>Campo {fmtAvg(row.field_avg)} · Org. {fmtAvg(row.organizer_avg)}{row.unbalanced ? ` · ${row.unbalanced} descomp.` : ''}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {feedback.comments.length ? (
              <>
                <Text style={styles.section}>Comentarios</Text>
                {feedback.comments.map((comment, index) => (
                  <View key={`${comment.created_at}-${index}`} style={styles.card}>
                    <Text style={styles.comment}>“{comment.comment}”</Text>
                    <Text style={styles.meta}>{comment.user_name} · {comment.match_title}</Text>
                  </View>
                ))}
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 16, paddingBottom: 48 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  backText: { color: '#ccc', fontSize: 13, fontWeight: '700' },
  screenTitle: { color: '#fff', fontSize: 24, fontWeight: '900' },
  screenSubtitle: { color: '#999', fontSize: 13, marginTop: 4, marginBottom: 16 },
  periods: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  period: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#141414', borderWidth: 1, borderColor: '#262626' },
  periodActive: { backgroundColor: '#ff5a00', borderColor: '#ff5a00' },
  periodText: { color: '#ccc', fontSize: 12, fontWeight: '800' },
  periodTextActive: { color: '#000' },
  error: { color: '#ff6b6b', marginTop: 20 },
  section: { color: '#fff', fontSize: 17, fontWeight: '900', marginTop: 18, marginBottom: 10 },
  card: { backgroundColor: '#141414', borderRadius: 16, borderWidth: 1, borderColor: '#262626', padding: 14, marginBottom: 10 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 2 },
  meta: { color: '#888', fontSize: 12 },
  big: { color: '#ff5a00', fontSize: 22, fontWeight: '900' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  stat: { flex: 1 },
  statValue: { color: '#fff', fontSize: 22, fontWeight: '900' },
  statLabel: { color: '#ccc', fontSize: 11, fontWeight: '700', marginTop: 2 },
  statSub: { color: '#777', fontSize: 10, marginTop: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  barLabel: { color: '#ccc', fontSize: 12, width: 104 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#222', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#ff5a00' },
  barBad: { backgroundColor: '#e5484d' },
  barCount: { color: '#fff', fontSize: 12, fontWeight: '800', width: 28, textAlign: 'right' },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  lineLabel: { color: '#ccc', fontSize: 12, flex: 1 },
  lineValue: { color: '#fff', fontSize: 12, fontWeight: '800' },
  comment: { color: '#fff', fontSize: 13, lineHeight: 19, marginBottom: 6 },
});
