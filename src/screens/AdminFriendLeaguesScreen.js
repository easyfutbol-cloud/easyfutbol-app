import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import { RULE_FIELDS, formatLabel } from '../utils/friendLeagueRules';

const FILTERS = [['all', 'Todas'], ['active', 'En juego'], ['draft', 'Sin empezar'], ['finished', 'Terminadas']];
const STATUS = {
  draft: { label: 'Sin empezar', color: '#ffb020' },
  active: { label: 'En juego', color: '#70c98a' },
  finished: { label: 'Terminada', color: '#F4C95D' },
};
const shortDate = (value) => (value ? new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Panel de administración: todas las ligas entre amigos y cómo van.
export default function AdminFriendLeaguesScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [details, setDetails] = useState({});

  const load = useCallback(async () => {
    try {
      const response = await api.get('/admin/friend-leagues');
      setData(response.data);
      setDetails({});
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.msg || 'No se pudieron cargar las ligas.');
    } finally {
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const items = useMemo(() => (data?.items || []).filter((item) => filter === 'all' || item.status === filter), [data, filter]);

  const toggle = async (id) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (details[id]) return;
    try {
      const response = await api.get(`/admin/friend-leagues/${id}`);
      setDetails((current) => ({ ...current, [id]: response.data }));
    } catch (e) {
      setDetails((current) => ({ ...current, [id]: { error: e?.response?.data?.msg || 'No se pudo cargar la liga.' } }));
    }
  };

  return <View style={styles.page}>
    <View style={styles.header}>
      <ScreenHeader
        eyebrow="ADMINISTRACIÓN"
        title="Ligas"
        description="Las ligas entre amigos que se están creando."
        action={<TouchableOpacity accessibilityLabel="Volver" style={styles.backButton} onPress={() => navigation.goBack()}><Ionicons name="arrow-back" color="#fff" size={20}/></TouchableOpacity>}
      />
    </View>
    {!data && !error ? <ActivityIndicator color="#ff5a00" style={styles.loader}/> : null}
    {error && !data ? <Text style={styles.error}>{error}</Text> : null}
    {data ? <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#ff5a00"/>}>
      <View style={styles.stats}>
        <Stat value={data.summary.total} label="Ligas" sub={`${data.summary.last_7_days} en 7 días`}/>
        <Stat value={data.summary.active} label="En juego"/>
        <Stat value={data.summary.draft} label="Sin empezar"/>
        <Stat value={data.summary.players} label="Jugadores"/>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map(([key, label]) => <TouchableOpacity key={key} style={[styles.filter, filter === key && styles.filterOn]} onPress={() => setFilter(key)} accessibilityRole="button" accessibilityState={{ selected: filter === key }}>
          <Text style={[styles.filterText, filter === key && styles.filterTextOn]}>{label}</Text>
        </TouchableOpacity>)}
      </ScrollView>

      {!items.length ? <Text style={styles.empty}>{data.items.length ? 'No hay ligas con este filtro.' : 'Todavía no se ha creado ninguna liga.'}</Text> : null}
      {items.map((item) => {
        const status = STATUS[item.status] || STATUS.draft;
        const open = openId === item.id;
        return <View key={item.id} style={styles.card}>
          <TouchableOpacity style={styles.cardTop} onPress={() => toggle(item.id)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
            <View style={styles.cardCopy}>
              <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
              <Text numberOfLines={1} style={styles.meta}>{item.is_public ? 'Pública · ' : ''}De {item.owner_name} · {shortDate(item.created_at)}</Text>
              <Text style={styles.meta}>{formatLabel(item.team_size)} · {item.matches_goal} partidos · {item.accepted}/{item.max_members} jugadores{item.invited ? ` · ${item.invited} sin responder` : ''}</Text>
            </View>
            <View style={styles.status}><View style={[styles.dot, { backgroundColor: status.color }]}/><Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text></View>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} color="#666" size={16}/>
          </TouchableOpacity>
          {open ? <LeagueDetail item={item} detail={details[item.id]}/> : null}
        </View>;
      })}
    </ScrollView> : null}
  </View>;
}

function Stat({ value, label, sub }) {
  return <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
    {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
  </View>;
}

function LeagueDetail({ item, detail }) {
  if (!detail) return <ActivityIndicator color="#ff5a00" style={styles.detailLoader}/>;
  if (detail.error) return <Text style={styles.error}>{detail.error}</Text>;
  const rules = RULE_FIELDS.map((field) => `${field.label} ${detail.rules[field.key]}`).join(' · ');
  return <View style={styles.detail}>
    {item.status === 'active' ? <Text style={styles.detailLine}>Termina el {shortDate(item.ends_at)} · Quedan {detail.days_left} días</Text> : null}
    {item.status === 'finished' ? <Text style={styles.detailLine}>Jugada hasta el {shortDate(item.ends_at)}</Text> : null}
    {detail.standings.length ? detail.standings.map((entry, index) => <View key={index} style={styles.row}>
      <Text style={styles.rowRank}>{entry.rank}</Text>
      <Text numberOfLines={1} style={styles.rowName}>{entry.name}</Text>
      <Text style={styles.rowMatches}>{entry.matches}/{entry.matches_target}</Text>
      <Text style={styles.rowPoints}>{entry.points}</Text>
    </View>) : detail.members.map((member) => <View key={member.id} style={styles.row}>
      <View style={[styles.dot, { backgroundColor: member.status === 'accepted' ? '#70c98a' : '#ffb020' }]}/>
      <Text numberOfLines={1} style={styles.rowName}>{member.name}</Text>
      <Text style={styles.rowMatches}>{member.status === 'accepted' ? 'Aceptó' : 'Pendiente'}</Text>
    </View>)}
    <Text style={styles.rules}>{rules}{detail.rules.double_vs_rivals ? ' · Victoria doble contra rivales' : ''}</Text>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0b0b0d' },
  header: { paddingHorizontal: 16 },
  loader: { marginTop: 60 },
  content: { padding: 16, paddingTop: 2, paddingBottom: 110 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#202024', alignItems: 'center', justifyContent: 'center' },
  error: { color: '#e5484d', fontSize: 13, fontWeight: '700', textAlign: 'center', padding: 16 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 13, paddingHorizontal: 2, borderRadius: 15, backgroundColor: '#18181b' },
  statValue: { color: '#fff', fontSize: 22, fontWeight: '900' },
  statLabel: { color: '#a5a8ae', fontSize: 10, fontWeight: '700', marginTop: 2 },
  statSub: { color: '#ff8b4b', fontSize: 9, fontWeight: '700', marginTop: 2 },
  filters: { gap: 7, paddingVertical: 14 },
  filter: { height: 34, paddingHorizontal: 13, borderRadius: 17, backgroundColor: '#17171a', borderWidth: 1, borderColor: '#26262b', alignItems: 'center', justifyContent: 'center' },
  filterOn: { backgroundColor: '#ff5a00', borderColor: '#ff5a00' },
  filterText: { color: '#a5a8ae', fontSize: 12, fontWeight: '900' },
  filterTextOn: { color: '#fff' },
  empty: { color: '#85878d', fontSize: 13, textAlign: 'center', marginTop: 30 },
  card: { backgroundColor: '#17171a', borderRadius: 17, borderWidth: 1, borderColor: '#26262b', marginBottom: 9, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 13 },
  cardCopy: { flex: 1 },
  name: { color: '#fff', fontSize: 15, fontWeight: '900' },
  meta: { color: '#85878d', fontSize: 11, fontWeight: '600', marginTop: 3 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '900' },
  detailLoader: { paddingBottom: 14 },
  detail: { paddingHorizontal: 13, paddingBottom: 13, borderTopWidth: 1, borderTopColor: '#26262b' },
  detailLine: { color: '#c9cbd0', fontSize: 12, fontWeight: '700', marginTop: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 },
  rowRank: { width: 18, color: '#ff8b4b', fontSize: 13, fontWeight: '900', textAlign: 'center' },
  rowName: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '700' },
  rowMatches: { color: '#85878d', fontSize: 11, fontWeight: '700' },
  rowPoints: { minWidth: 26, color: '#fff', fontSize: 14, fontWeight: '900', textAlign: 'right' },
  rules: { color: '#7c7e85', fontSize: 11, lineHeight: 16, marginTop: 12 },
});
