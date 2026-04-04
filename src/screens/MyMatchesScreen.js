import { View, Text, StyleSheet, StatusBar, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { colors, spacing } from '../theme';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api/client';

function Badge({ status }) {
  const map = {
    pending: { label: 'Pendiente', bg: '#665200' },
    confirmed: { label: 'Confirmado', bg: '#0d4a0d' },
    cancelled: { label: 'Cancelado', bg: '#4a0d0d' }
  };
  const it = map[status] || { label: status, bg: '#333' };
  return (
    <View style={{ backgroundColor: it.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{it.label}</Text>
    </View>
  );
}

function groupInscriptionsByMatch(list) {
  const byMatch = {};

  for (const ins of list || []) {
    const mid = ins.match_id;
    if (!mid) continue;

    if (!byMatch[mid]) {
      byMatch[mid] = {
        match_id: mid,
        title: ins.title,
        city: ins.city,
        starts_at: ins.starts_at,
        duration_min: ins.duration_min,
        field_name: ins.field_name,
        inscriptions: [],
      };
    }

    byMatch[mid].inscriptions.push(ins);
  }

  const groups = Object.values(byMatch).map((group) => {
    const statuses = group.inscriptions.map((i) => i.status);
    const hasConfirmed = statuses.includes('confirmed');
    const hasPending = statuses.includes('pending');
    const hasCancelled = statuses.includes('cancelled');

    let status = 'pending';
    if (hasConfirmed) status = 'confirmed';
    else if (!hasPending && hasCancelled) status = 'cancelled';

    const whiteCount = group.inscriptions.filter((i) => i.ticket_type === 'white').length;
    const blackCount = group.inscriptions.filter((i) => i.ticket_type === 'black').length;

    return {
      ...group,
      status,
      total: group.inscriptions.length,
      whiteCount,
      blackCount,
    };
  });

  // ordenar por fecha de inicio, la más próxima primero
  groups.sort((a, b) => {
    const da = a.starts_at ? new Date(a.starts_at).getTime() : 0;
    const db = b.starts_at ? new Date(b.starts_at).getTime() : 0;
    return da - db;
  });

  return groups;
}

function isFutureMatch(startsAt) {
  if (!startsAt) return false;
  const time = new Date(startsAt).getTime();
  if (Number.isNaN(time)) return false;
  return time >= Date.now();
}

export default function MyMatchesScreen() {
  const [items, setItems] = useState([]); // inscripciones crudas
  const [groups, setGroups] = useState([]); // inscripciones agrupadas por partido
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('future');

  const load = useCallback(() => {
    setLoading(true);
    api
      .get('/me/inscriptions')
      .then((r) => {
        const payload = r.data;
        const data = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
          ? payload
          : [];

        setItems(data);

        const grouped = groupInscriptionsByMatch(data);
        setGroups(grouped);

        console.log(
          'MY MATCHES API:',
          data.length,
          'inscripciones,',
          grouped.length,
          'partidos:',
          grouped.map((g) => ({ match_id: g.match_id, total: g.total }))
        );
      })
      .catch((e) => {
        console.log('Error cargando mis partidos desde API:', e?.message);
        setItems([]);
        setGroups([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const futureGroups = useMemo(() => {
    return groups.filter((group) => isFutureMatch(group.starts_at));
  }, [groups]);

  const pastGroups = useMemo(() => {
    return groups.filter((group) => !isFutureMatch(group.starts_at));
  }, [groups]);

  const visibleGroups = tab === 'future' ? futureGroups : pastGroups;

  const cancel = async (matchId) => {
    try {
      const { data } = await api.post(`/matches/${matchId}/cancel`);
      if (!data?.ok) throw new Error(data?.msg || 'No se pudo cancelar');
      Alert.alert('Hecho', data.msg || 'Inscripción cancelada');
      load();
    } catch (e) {
      Alert.alert('No se pudo cancelar', e.message || 'Inténtalo de nuevo');
    }
  };

  const handleCancelPress = (matchId, total) => {
    const title = 'Cancelar entrada';
    const body = total && total > 1
      ? 'Vas a cancelar 1 de tus entradas para este partido.\n\nSi cancelas con menos de 6 horas de antelación no se devolverá el dinero.'
      : 'Vas a cancelar tu entrada para este partido.\n\nSi cancelas con menos de 6 horas de antelación no se devolverá el dinero.';

    const confirmLabel = total && total > 1 ? 'Sí, cancelar 1 entrada' : 'Sí, cancelar';

    Alert.alert(
      title,
      body,
      [
        { text: 'No', style: 'cancel' },
        { text: confirmLabel, style: 'destructive', onPress: () => cancel(matchId) }
      ]
    );
  };

  const renderItem = ({ item }) => {
    const date = new Date(item.starts_at);
    const isFuture = isFutureMatch(item.starts_at);
    const canCancel = isFuture && (item.status === 'pending' || item.status === 'confirmed');
    const total = item.total || 0;
    const whites = item.whiteCount || 0;
    const blacks = item.blackCount || 0;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Badge status={item.status} />
        </View>
        <Text style={styles.cardMeta}>{item.field_name} · {item.city}</Text>
        <Text style={styles.cardMeta}>{date.toLocaleString()} · {item.duration_min} min</Text>

        {total > 0 && (
          <Text style={styles.cardMeta}>
            {total === 1 ? 'Tienes 1 entrada' : `Tienes ${total} entradas`}
            {` (${whites} blancas · ${blacks} negras)`}
          </Text>
        )}

        {canCancel && (
          <TouchableOpacity
            style={styles.btnOutline}
            onPress={() => handleCancelPress(item.match_id, total)}
          >
            <Text style={styles.btnOutlineText}>
              {total > 1 ? 'Cancelar 1 entrada' : 'Cancelar entrada'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.title}>Mis partidos</Text>
      <View style={styles.tabsWrap}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'future' && styles.tabBtnActive]}
          onPress={() => setTab('future')}
        >
          <Text style={[styles.tabText, tab === 'future' && styles.tabTextActive]}>
            Entradas futuras
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, tab === 'past' && styles.tabBtnActive]}
          onPress={() => setTab('past')}
        >
          <Text style={[styles.tabText, tab === 'past' && styles.tabTextActive]}>
            Entradas anteriores
          </Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.orange} />
          <Text style={styles.loading}>Cargando tus partidos…</Text>
        </View>
      ) : (
        <FlatList
          data={visibleGroups}
          keyExtractor={(it) => String(it.match_id)}
          renderItem={renderItem}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === 'future'
                ? 'Aún no tienes entradas futuras. Ve a la pestaña "Partidos" y reserva tu plaza ⚽️'
                : 'Aún no tienes entradas anteriores.'}
            </Text>
          }
          contentContainerStyle={{ paddingBottom: spacing(6) }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor:colors.black, padding:spacing(2) },
  title:{ color:colors.white, fontSize:22, fontWeight:'800', marginVertical:spacing(2), textAlign:'center' },
  tabsWrap:{ flexDirection:'row', backgroundColor:'#111', borderRadius:14, padding:4, marginBottom:spacing(2) },
  tabBtn:{ flex:1, paddingVertical:12, borderRadius:10, alignItems:'center' },
  tabBtnActive:{ backgroundColor:colors.orange },
  tabText:{ color:'#aaa', fontWeight:'700', fontSize:14 },
  tabTextActive:{ color:'#000', fontWeight:'800' },
  loadingContainer:{ flex:1, justifyContent:'center', alignItems:'center' },
  loading:{ color:colors.gray, textAlign:'center', marginTop:spacing(2) },
  empty:{ color:colors.gray, textAlign:'center', marginTop:spacing(4) },
  card:{ backgroundColor:'#111', borderColor:'#222', borderWidth:1, borderRadius:14, padding:spacing(2), marginBottom:spacing(2) },
  cardHeader:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:spacing(1) },
  cardTitle:{ color:colors.white, fontSize:18, fontWeight:'800' },
  cardMeta:{ color:'#aaa', fontSize:13, marginBottom:4 },
  btnOutline:{ borderWidth:1, borderColor:'#555', paddingVertical:spacing(1.2), borderRadius:12, alignItems:'center', marginTop:spacing(1) },
  btnOutlineText:{ color:'#ddd', fontWeight:'800', fontSize:14 }
});
