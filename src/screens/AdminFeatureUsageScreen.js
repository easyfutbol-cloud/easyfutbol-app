import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';

const PERIODS = [7, 30, 90];

const fmtPct = (value) => (value === null || value === undefined ? null : `${String(value).replace('.', ',')}%`);
const fmtAvg = (value) => String(value).replace('.', ',');
const fmtDay = (value) => {
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
};

function Stat({ label, value, sub }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function Bar({ label, value, max, muted }) {
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${max ? (value / max) * 100 : 0}%` }, muted && styles.barMuted]} />
      </View>
      <Text style={styles.barCount}>{value}</Text>
    </View>
  );
}

// Qué apartados usan los jugadores: quién entra (lo registra la app) y quién
// hace algo (sale de los datos que ya se guardan). No cuenta cuentas de admin.
export default function AdminFeatureUsageScreen({ navigation }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (period, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/admin/feature-usage', { params: { days: period } });
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

  const max = data ? Math.max(1, ...data.features.map((item) => Math.max(item.visit_users || 0, item.action_users))) : 1;

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
        <Text style={styles.screenTitle}>Uso de funciones</Text>
        <Text style={styles.screenSubtitle}>Cuántos jugadores usan cada apartado, de más a menos. No incluye cuentas de admin.</Text>

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
            <View style={[styles.card, { marginTop: 10 }]}>
              <View style={styles.statsRow}>
                <Stat label="Abren la app" value={data.tracking_since ? String(data.active_users) : '—'} sub="en el periodo" />
                <Stat label="Tienen amigos" value={String(data.with_friends)} sub="en total" />
                <Stat label="En una liga activa" value={String(data.in_active_league)} sub="ahora" />
              </View>
            </View>

            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={16} color="#999" />
              <Text style={styles.noteText}>
                {data.tracking_since
                  ? `«Entran» se mide desde el ${fmtDay(data.tracking_since)} y solo en quienes tienen la app actualizada. «Hacen algo» tiene todo el histórico.`
                  : '«Entran» empezará a contar cuando los jugadores tengan la app actualizada. «Hacen algo» ya tiene todo el histórico.'}
              </Text>
            </View>

            <Text style={styles.section}>Lo más usado</Text>
            {data.features.map((item) => (
              <View key={item.key} style={styles.card}>
                <View style={styles.titleRow}>
                  <Text style={styles.cardTitle}>{item.label}</Text>
                  {fmtPct(item.visit_rate) ? <Text style={styles.rate}>{fmtPct(item.visit_rate)}</Text> : null}
                </View>
                {item.visit_users !== null ? <Bar label="Entran" value={item.visit_users} max={max} /> : null}
                {item.actions.length || item.visit_users === null ? <Bar label="Hacen algo" value={item.action_users} max={max} muted /> : null}
                {item.days_per_user ? <Text style={styles.meta}>{fmtAvg(item.days_per_user)} días de uso por jugador</Text> : null}
                {item.actions.map((action) => (
                  <View key={action.action} style={styles.lineRow}>
                    <Text style={styles.lineLabel}>{action.label}</Text>
                    <Text style={styles.lineValue}>{action.events} · {action.users} {action.users === 1 ? 'jugador' : 'jugadores'}</Text>
                  </View>
                ))}
              </View>
            ))}
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
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '800', flex: 1 },
  rate: { color: '#ff5a00', fontSize: 18, fontWeight: '900' },
  meta: { color: '#888', fontSize: 12, marginTop: 8 },
  note: { flexDirection: 'row', gap: 8, paddingHorizontal: 2, marginTop: 2 },
  noteText: { color: '#999', fontSize: 12, lineHeight: 17, flex: 1 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  stat: { flex: 1 },
  statValue: { color: '#fff', fontSize: 22, fontWeight: '900' },
  statLabel: { color: '#ccc', fontSize: 11, fontWeight: '700', marginTop: 2 },
  statSub: { color: '#777', fontSize: 10, marginTop: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  barLabel: { color: '#ccc', fontSize: 12, width: 72 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#222', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#ff5a00' },
  barMuted: { backgroundColor: '#8a8f98' },
  barCount: { color: '#fff', fontSize: 12, fontWeight: '800', width: 36, textAlign: 'right' },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  lineLabel: { color: '#ccc', fontSize: 12, flex: 1 },
  lineValue: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
