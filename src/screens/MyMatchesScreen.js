import { View, Text, StyleSheet, StatusBar, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, layout, radii, spacing, typography } from '../theme';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import SegmentedControl from '../components/SegmentedControl';

const TAB_OPTIONS = [
  { value: 'future', label: 'Entradas futuras' },
  { value: 'past', label: 'Entradas anteriores' },
];

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

function ShirtIcons({ whiteCount = 0, blackCount = 0, cancelled = false }) {
  const icons = [];

  for (let i = 0; i < whiteCount; i += 1) {
    icons.push({ key: `white-${i}`, type: 'white' });
  }

  for (let i = 0; i < blackCount; i += 1) {
    icons.push({ key: `black-${i}`, type: 'black' });
  }

  if (icons.length === 0) return null;

  return (
    <View style={styles.shirtIconsRow}>
      {icons.map((icon) => (
        <View
          key={icon.key}
          style={[
            styles.shirtIcon,
            icon.type === 'white' ? styles.shirtIconWhite : styles.shirtIconBlack,
            cancelled && styles.shirtIconCancelled,
          ]}
        >
          <Text style={[styles.shirtIconText, icon.type === 'white' && styles.shirtIconTextWhite]}>👕</Text>
        </View>
      ))}
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
        goals: Number(ins.goals || 0),
        assists: Number(ins.assists || 0),
        is_mvp: Boolean(Number(ins.is_mvp || 0)),
        mvp_name: ins.mvp_name || null,
        is_plus: Boolean(Number(ins.is_plus || 0)),
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

    const activeInscriptions = group.inscriptions.filter(
      (i) => i.status === 'confirmed' || i.status === 'pending'
    );

    const whiteCount = activeInscriptions.filter((i) => i.ticket_type === 'white').length;
    const blackCount = activeInscriptions.filter((i) => i.ticket_type === 'black').length;

    return {
      ...group,
      status,
      total: activeInscriptions.length,
      activeCount: activeInscriptions.length,
      whiteCount,
      blackCount,
    };
  });

  const activeGroups = groups.filter((group) => group.activeCount > 0);

  activeGroups.sort((a, b) => {
    const da = a.starts_at ? new Date(a.starts_at).getTime() : 0;
    const db = b.starts_at ? new Date(b.starts_at).getTime() : 0;
    return da - db;
  });

  return activeGroups;
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
      Alert.alert('No se pudo cancelar', e?.response?.data?.msg || e.message || 'Inténtalo de nuevo');
    }
  };

  const handleCancelPress = (matchId, total, startsAt, isPlus = false) => {
    const title = 'Cancelar entrada';
    const hoursUntilMatch = (new Date(startsAt).getTime() - Date.now()) / 36e5;
    const deadlineHours = isPlus ? 3 : 8;
    const refundMessage = hoursUntilMatch > deadlineHours
      ? `Como quedan más de ${deadlineHours} horas, se devolverá el EasyPass utilizado.`
      : `Quedan ${deadlineHours} horas o menos. Puedes cancelar, pero el EasyPass utilizado no se devolverá.${isPlus ? ' Además, recibirás un aviso Plus.' : ''}`;
    const body = total && total > 1
      ? `Vas a cancelar tus entradas para este partido.\n\n${refundMessage}`
      : `Vas a cancelar tu entrada para este partido.\n\n${refundMessage}`;

    const confirmLabel = hoursUntilMatch > deadlineHours ? 'Sí, cancelar' : 'Cancelar sin devolución';

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
    const activeCount = item.activeCount || 0;
    const whites = item.whiteCount || 0;
    const blacks = item.blackCount || 0;
    const goals = Number(item.goals || 0);
    const assists = Number(item.assists || 0);
    const wasMvp = Boolean(item.is_mvp);

    return (
      <View style={styles.card} accessible accessibilityLabel={`${item.title}, ${item.status}`}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Badge status={item.status} />
        </View>
        <Text style={styles.cardMeta}>{item.field_name} · {item.city}</Text>
        <Text style={styles.cardMeta}>{date.toLocaleString()} · {item.duration_min} min</Text>

        {total > 0 && (
          <View style={styles.entriesSummaryWrap}>
            {activeCount > 0 ? (
              <View style={styles.entryCountBlock}>
                <Text style={styles.cardMetaStrong}>
                  Activas: {activeCount === 1 ? '1 entrada' : `${activeCount} entradas`}
                </Text>
                <View style={styles.entryShirtLine}>
                  <ShirtIcons whiteCount={whites} blackCount={blacks} />
                  <Text style={styles.entryShirtText}>{whites} blancas · {blacks} negras</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.cardMetaStrong}>
                Activas: 0 entradas
              </Text>
            )}
          </View>
        )}

        {!isFuture && (
          <View style={styles.pastStatsSection}>
            <View style={styles.statsHeadingRow}>
              <View style={styles.statsHeadingIcon}>
                <Ionicons name="stats-chart" size={18} color={colors.orange} />
              </View>
              <View style={styles.statsHeadingCopy}>
                <Text style={styles.statsEyebrow}>TU PARTIDO</Text>
                <Text style={styles.statsTitle}>Estadísticas individuales</Text>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Ionicons name="football-outline" size={19} color={colors.orange} />
                <Text style={styles.statValue}>{goals}</Text>
                <Text style={styles.statLabel}>Goles</Text>
              </View>
              <View style={styles.statBox}>
                <Ionicons name="navigate-outline" size={19} color={colors.orange} />
                <Text style={styles.statValue}>{assists}</Text>
                <Text style={styles.statLabel}>Asistencias</Text>
              </View>
              <View style={[styles.statBox, wasMvp && styles.statBoxMvp]}>
                <Ionicons name={wasMvp ? 'star' : 'star-outline'} size={19} color={wasMvp ? colors.black : colors.orange} />
                <Text style={[styles.statValue, wasMvp && styles.statValueMvp]}>{wasMvp ? 'Sí' : '—'}</Text>
                <Text style={[styles.statLabel, wasMvp && styles.statLabelMvp]}>MVP</Text>
              </View>
            </View>

            <View style={styles.matchMvpCard}>
              <View style={styles.mvpIconWrap}>
                <Ionicons name="trophy" size={21} color={colors.orange} />
              </View>
              <View style={styles.mvpCopy}>
                <Text style={styles.mvpLabel}>MVP DEL PARTIDO</Text>
                <Text style={styles.mvpName}>{item.mvp_name || 'Pendiente de publicar'}</Text>
              </View>
            </View>
          </View>
        )}

        {canCancel && (
          <TouchableOpacity
            style={styles.btnOutline}
            onPress={() => handleCancelPress(item.match_id, total, item.starts_at, item.is_plus)}
            accessibilityRole="button"
          >
            <Text style={styles.btnOutlineText}>
              {total > 1 ? 'Cancelar entradas' : 'Cancelar entrada'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScreenHeader
        eyebrow="TUS RESERVAS"
        title="Mis entradas"
        description="Gestiona tus reservas y consulta tu rendimiento en partidos anteriores."
      />
      <SegmentedControl
        options={TAB_OPTIONS}
        value={tab}
        onChange={setTab}
        accessibilityLabel="Filtrar entradas"
      />
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
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEyebrow}>SIN ENTRADAS</Text>
              <Text style={styles.emptyTitle}>
                {tab === 'future' ? 'Tu próximo partido empieza aquí' : 'Todavía no hay historial'}
              </Text>
              <Text style={styles.empty}>
                {tab === 'future'
                  ? 'Cuando reserves una plaza, encontrarás aquí todos sus detalles.'
                  : 'Tus entradas anteriores aparecerán aquí cuando finalicen los partidos.'}
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor:colors.background, padding:spacing(2) },
  listContent:{ width:'100%', maxWidth:layout.maxContentWidth, alignSelf:'center', paddingBottom:spacing(6) },
  loadingContainer:{ flex:1, justifyContent:'center', alignItems:'center' },
  loading:{ color:colors.gray, textAlign:'center', marginTop:spacing(2) },
  emptyCard:{ backgroundColor:colors.surface, borderWidth:1, borderColor:colors.border, borderRadius:radii.large, padding:spacing(3), alignItems:'center', marginTop:spacing(2) },
  emptyEyebrow:{ color:colors.orange, ...typography.overline },
  emptyTitle:{ color:colors.white, ...typography.heading, textAlign:'center', marginTop:spacing(1) },
  empty:{ color:colors.textMuted, ...typography.body, textAlign:'center', marginTop:spacing(1) },
  card:{ backgroundColor:colors.surface, borderColor:colors.border, borderWidth:1, borderRadius:radii.large, padding:spacing(2), marginBottom:spacing(2) },
  cardHeader:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:spacing(1) },
  cardTitle:{ color:colors.white, fontSize:18, fontWeight:'800' },
  cardMeta:{ color:colors.textMuted, fontSize:13, marginBottom:4 },
  entriesSummaryWrap:{ marginTop:spacing(1), marginBottom:spacing(0.5) },
  cardMetaStrong:{ color:colors.white, fontSize:13, fontWeight:'700', marginBottom:4 },
  entryCountBlock:{ marginBottom:6 },
  entryShirtLine:{ flexDirection:'row', alignItems:'center', flexWrap:'wrap', gap:8, marginTop:2 },
  shirtIconsRow:{ flexDirection:'row', alignItems:'center', flexWrap:'wrap', gap:4 },
  shirtIcon:{ width:24, height:24, borderRadius:8, alignItems:'center', justifyContent:'center', borderWidth:1 },
  shirtIconWhite:{ backgroundColor:'#f5f5f5', borderColor:'#d8d8d8' },
  shirtIconBlack:{ backgroundColor:'#050505', borderColor:'#555' },
  shirtIconCancelled:{ opacity:0.45 },
  shirtIconText:{ fontSize:13, lineHeight:16 },
  shirtIconTextWhite:{ color:'#111' },
  entryShirtText:{ color:colors.textMuted, fontSize:12, fontWeight:'700' },
  pastStatsSection:{ borderTopWidth:1, borderTopColor:colors.border, marginTop:spacing(1.5), paddingTop:spacing(1.5) },
  statsHeadingRow:{ flexDirection:'row', alignItems:'center', gap:spacing(1), marginBottom:spacing(1.25) },
  statsHeadingIcon:{ width:38, height:38, borderRadius:12, alignItems:'center', justifyContent:'center', backgroundColor:'rgba(255,90,0,0.11)' },
  statsHeadingCopy:{ flex:1 },
  statsEyebrow:{ color:colors.orange, ...typography.overline, fontSize:9 },
  statsTitle:{ color:colors.white, ...typography.bodyStrong, marginTop:2 },
  statsGrid:{ flexDirection:'row', gap:spacing(0.75) },
  statBox:{ flex:1, minHeight:92, alignItems:'center', justifyContent:'center', backgroundColor:colors.surfaceElevated, borderRadius:radii.medium, borderWidth:1, borderColor:colors.border, padding:spacing(0.75) },
  statBoxMvp:{ backgroundColor:colors.orange, borderColor:colors.orange },
  statValue:{ color:colors.white, fontSize:20, lineHeight:25, fontWeight:'900', marginTop:3 },
  statValueMvp:{ color:colors.black },
  statLabel:{ color:colors.textMuted, fontSize:10, fontWeight:'800', marginTop:1 },
  statLabelMvp:{ color:'rgba(0,0,0,0.66)' },
  matchMvpCard:{ minHeight:62, flexDirection:'row', alignItems:'center', gap:spacing(1), backgroundColor:'rgba(255,90,0,0.08)', borderWidth:1, borderColor:'rgba(255,90,0,0.22)', borderRadius:radii.medium, padding:spacing(1.25), marginTop:spacing(1) },
  mvpIconWrap:{ width:38, height:38, borderRadius:12, alignItems:'center', justifyContent:'center', backgroundColor:'rgba(255,90,0,0.12)' },
  mvpCopy:{ flex:1 },
  mvpLabel:{ color:colors.orange, ...typography.overline, fontSize:9 },
  mvpName:{ color:colors.white, ...typography.bodyStrong, marginTop:2 },
  btnOutline:{ minHeight:layout.minTouchTarget, borderWidth:1, borderColor:colors.border, paddingVertical:spacing(1.2), borderRadius:radii.medium, alignItems:'center', justifyContent:'center', marginTop:spacing(1) },
  btnOutlineText:{ color:colors.white, fontWeight:'800', fontSize:14 }
});
