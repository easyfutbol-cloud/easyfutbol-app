import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import SegmentedControl from '../components/SegmentedControl';
import { api } from '../api/client';
import { colors, layout, radii, shadows, spacing, typography } from '../theme';
import { goBackOrFallback } from '../utils/navigation';

const LOCATIONS = [
  { value: 'all', label: 'Global', id: null },
  { value: 'valladolid', label: 'Valladolid', id: 1 },
  { value: 'asturias', label: 'Asturias', id: 2 },
];
const PERIODS = [{ value: 'week', label: 'Esta semana' }, { value: 'month', label: 'Este mes' }];
const VIEWS = [{ value: 'summary', label: 'Resumen' }, { value: 'players', label: 'Jugadores' }, { value: 'weekdays', label: 'Días' }];

const KPI_DEFINITIONS = [
  { key: 'usuarios_unicos', label: 'Jugadores', icon: 'people-outline' },
  { key: 'partidos_jugados', label: 'Partidos', icon: 'football-outline' },
  { key: 'participaciones', label: 'Participaciones', icon: 'ticket-outline' },
  { key: 'frecuencia_media', label: 'Media/jugador', icon: 'pulse-outline', decimals: 1 },
  { key: 'repeat_rate', label: 'Repetición', icon: 'repeat-outline', percent: true },
  { key: 'goles', label: 'Goles', icon: 'radio-button-on-outline' },
  { key: 'asistencias', label: 'Asistencias', icon: 'navigate-outline' },
  { key: 'mvps', label: 'MVP', icon: 'star-outline' },
];

const formatNumber = (value, decimals = 0) => Number(value || 0).toFixed(decimals);
const formatPercent = (value) => `${(Number(value || 0) * 100).toFixed(1)}%`;

export default function AdminDashboardScreen({ navigation }) {
  const [locationKey, setLocationKey] = useState('all');
  const [period, setPeriod] = useState('week');
  const [activeView, setActiveView] = useState('summary');
  const [summary, setSummary] = useState(null);
  const [players, setPlayers] = useState([]);
  const [weekdays, setWeekdays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const location = useMemo(() => LOCATIONS.find((item) => item.value === locationKey) || LOCATIONS[0], [locationKey]);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const params = location.id ? { location_id: location.id } : {};
      const [summaryResponse, playersResponse, weekdaysResponse] = await Promise.all([
        api.get('/kpis/dashboard', { params: { ...params, period } }),
        api.get('/kpis/players', { params }),
        api.get('/kpis/weekday-repeat', { params }),
      ]);
      setSummary(summaryResponse.data || {});
      setPlayers(playersResponse.data?.players || []);
      setWeekdays(weekdaysResponse.data?.weekdays || []);
    } catch (requestError) {
      setError(requestError?.response?.data?.error || requestError?.response?.data?.msg || 'No se pudieron cargar los KPIs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [location.id, period]);

  useEffect(() => { load(); }, [load]);

  const renderPlayer = (item, index) => (
    <View key={String(item.jugador_id || index)} style={styles.rankingRow}>
      <View style={[styles.position, index < 3 && styles.positionTop]}><Text style={[styles.positionText, index < 3 && styles.positionTextTop]}>{index + 1}</Text></View>
      <View style={styles.rankingCopy}>
        <Text style={styles.playerName}>{item.name || 'Jugador'}</Text>
        <Text style={styles.playerMeta}>ID {item.jugador_id} · {item.partidos || 0} partidos</Text>
      </View>
      <View style={styles.playerStats}>
        <Text style={styles.playerStat}>{item.goles || 0}<Text style={styles.playerStatLabel}> G</Text></Text>
        <Text style={styles.playerStat}>{item.asistencias || 0}<Text style={styles.playerStatLabel}> A</Text></Text>
        <Text style={styles.playerStat}>{item.mvps || 0}<Text style={styles.playerStatLabel}> MVP</Text></Text>
      </View>
    </View>
  );

  if (loading && !summary) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.orange} /><Text style={styles.loadingText}>Calculando indicadores…</Text></View>;
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.orange} />}
      >
        <LinearGradient colors={['#261307', '#11151B']} style={styles.hero}>
          <TouchableOpacity style={styles.backButton} onPress={() => goBackOrFallback(navigation, 'AdminPanel')}>
            <Ionicons name="arrow-back" size={20} color={colors.white} /><Text style={styles.backText}>Volver</Text>
          </TouchableOpacity>
          <View style={styles.heroTopline}>
            <View style={styles.heroIcon}><Ionicons name="analytics" size={26} color={colors.orange} /></View>
            <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>DATOS REALES</Text></View>
          </View>
          <Text style={styles.eyebrow}>ADMINISTRACIÓN · RENDIMIENTO</Text>
          <Text style={styles.title}>Dashboard KPIs</Text>
          <Text style={styles.description}>Analiza actividad, repetición y rendimiento deportivo por sede.</Text>
        </LinearGradient>

        <View style={styles.filterCard}>
          <Text style={styles.filterLabel}>SEDE</Text>
          <SegmentedControl options={LOCATIONS} value={locationKey} onChange={setLocationKey} accessibilityLabel="Sede de los indicadores" />
          <Text style={styles.filterLabel}>PERIODO</Text>
          <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} accessibilityLabel="Periodo de los indicadores" />
          <View style={styles.scopeSummary}>
            <Ionicons name="location" size={18} color={colors.orange} />
            <Text style={styles.scopeText}>{location.label} · {period === 'week' ? 'Semana actual' : 'Mes actual'}</Text>
          </View>
        </View>

        {error ? <View style={styles.errorCard}><Ionicons name="alert-circle" size={20} color={colors.danger} /><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={() => load()}><Text style={styles.retry}>Reintentar</Text></TouchableOpacity></View> : null}

        <SegmentedControl options={VIEWS} value={activeView} onChange={setActiveView} accessibilityLabel="Contenido del dashboard" />

        {activeView === 'summary' ? (
          <>
            <View style={styles.sectionHeading}><View><Text style={styles.sectionEyebrow}>VISIÓN GENERAL</Text><Text style={styles.sectionTitle}>Indicadores principales</Text></View></View>
            <View style={styles.kpiGrid}>
              {KPI_DEFINITIONS.map((kpi) => (
                <View key={kpi.key} style={styles.kpiCard}>
                  <View style={styles.kpiIcon}><Ionicons name={kpi.icon} size={19} color={colors.orange} /></View>
                  <Text style={styles.kpiValue}>{kpi.percent ? formatPercent(summary?.[kpi.key]) : formatNumber(summary?.[kpi.key], kpi.decimals)}</Text>
                  <Text style={styles.kpiLabel}>{kpi.label}</Text>
                </View>
              ))}
            </View>
            <View style={styles.sectionHeading}><View><Text style={styles.sectionEyebrow}>TOP DEL PERIODO</Text><Text style={styles.sectionTitle}>Jugadores destacados</Text></View></View>
            {(summary?.top_jugadores || []).length ? summary.top_jugadores.map(renderPlayer) : <Text style={styles.empty}>Todavía no hay estadísticas en este periodo.</Text>}
          </>
        ) : null}

        {activeView === 'players' ? (
          <>
            <View style={styles.sectionHeading}><View><Text style={styles.sectionEyebrow}>HISTÓRICO DE LA SEDE</Text><Text style={styles.sectionTitle}>Jugadores con más partidos</Text></View><Text style={styles.totalBadge}>{players.length}</Text></View>
            {players.length ? players.map(renderPlayer) : <Text style={styles.empty}>Todavía no hay jugadores en esta sede.</Text>}
          </>
        ) : null}

        {activeView === 'weekdays' ? (
          <>
            <View style={styles.sectionHeading}><View><Text style={styles.sectionEyebrow}>HÁBITOS DE JUEGO</Text><Text style={styles.sectionTitle}>Repetición por día</Text></View></View>
            {weekdays.length ? weekdays.map((item) => (
              <View key={item.weekday_number} style={styles.dayCard}>
                <View style={styles.dayTopline}><Text style={styles.dayName}>{item.weekday_name}</Text><Text style={styles.dayRate}>{formatPercent(item.repeat_rate)}</Text></View>
                <View style={styles.progressTrack}><View style={[styles.progressValue, { width: `${Math.min(100, Number(item.repeat_rate || 0) * 100)}%` }]} /></View>
                <Text style={styles.dayMeta}>{item.repetidores || 0} repetidores · {item.usuarios_unicos || 0} jugadores · {item.registros || 0} participaciones</Text>
              </View>
            )) : <Text style={styles.empty}>Todavía no hay información por días.</Text>}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textMuted, ...typography.body, marginTop: spacing(1.5) },
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', padding: layout.screenPadding, paddingBottom: spacing(6) },
  hero: { borderRadius: radii.large, borderWidth: 1, borderColor: 'rgba(255,90,0,0.28)', padding: spacing(2), marginBottom: spacing(2), ...shadows.card },
  backButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing(0.75), alignSelf: 'flex-start' },
  backText: { color: colors.white, ...typography.bodyStrong },
  heroTopline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(1) },
  heroIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: 'rgba(255,90,0,0.14)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.pill, backgroundColor: 'rgba(57,217,138,0.10)', paddingHorizontal: spacing(1), paddingVertical: spacing(0.6) },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  liveText: { color: colors.success, ...typography.overline, fontSize: 9 },
  eyebrow: { color: colors.orange, ...typography.overline, marginTop: spacing(1.5) },
  title: { color: colors.white, ...typography.display, marginTop: spacing(0.75) },
  description: { color: colors.textMuted, ...typography.body, marginTop: spacing(0.75) },
  filterCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.large, padding: spacing(1.5), marginBottom: spacing(2) },
  filterLabel: { color: colors.textSubtle, ...typography.overline, marginBottom: spacing(0.75) },
  scopeSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(0.75), backgroundColor: 'rgba(255,90,0,0.08)', borderRadius: radii.medium, padding: spacing(1) },
  scopeText: { color: colors.white, ...typography.caption },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: 'rgba(255,92,92,0.10)', borderWidth: 1, borderColor: 'rgba(255,92,92,0.3)', borderRadius: radii.medium, padding: spacing(1.25), marginBottom: spacing(2) },
  errorText: { flex: 1, color: colors.danger, ...typography.caption },
  retry: { color: colors.white, ...typography.caption },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing(1), marginBottom: spacing(1.25) },
  sectionEyebrow: { color: colors.orange, ...typography.overline },
  sectionTitle: { color: colors.white, ...typography.heading, marginTop: 3 },
  totalBadge: { color: colors.orange, ...typography.bodyStrong, backgroundColor: 'rgba(255,90,0,0.12)', paddingHorizontal: spacing(1), paddingVertical: spacing(0.5), borderRadius: radii.pill },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginBottom: spacing(2) },
  kpiCard: { width: '48%', flexGrow: 1, minHeight: 126, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.large, padding: spacing(1.5) },
  kpiIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(255,90,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  kpiValue: { color: colors.white, fontSize: 26, lineHeight: 31, fontWeight: '900', marginTop: spacing(1) },
  kpiLabel: { color: colors.textSubtle, ...typography.caption, marginTop: 2 },
  rankingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), minHeight: 72, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, padding: spacing(1.25), marginBottom: spacing(1) },
  position: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  positionTop: { backgroundColor: colors.orange },
  positionText: { color: colors.textMuted, fontWeight: '900' },
  positionTextTop: { color: colors.black },
  rankingCopy: { flex: 1 },
  playerName: { color: colors.white, ...typography.bodyStrong },
  playerMeta: { color: colors.textSubtle, ...typography.caption, marginTop: 3 },
  playerStats: { alignItems: 'flex-end', gap: 2 },
  playerStat: { color: colors.white, fontSize: 12, fontWeight: '900' },
  playerStatLabel: { color: colors.textSubtle, fontSize: 9 },
  dayCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, padding: spacing(1.5), marginBottom: spacing(1) },
  dayTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayName: { color: colors.white, ...typography.bodyStrong },
  dayRate: { color: colors.orange, ...typography.heading },
  progressTrack: { height: 7, borderRadius: radii.pill, backgroundColor: colors.surfaceElevated, overflow: 'hidden', marginVertical: spacing(1) },
  progressValue: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.orange },
  dayMeta: { color: colors.textSubtle, ...typography.caption },
  empty: { color: colors.textSubtle, ...typography.body, textAlign: 'center', backgroundColor: colors.surface, borderRadius: radii.medium, padding: spacing(3) },
});
