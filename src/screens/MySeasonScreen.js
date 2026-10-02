import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import { colors, radii, spacing } from '../theme';

const RESULT_LABEL = { win: 'Victoria', loss: 'Derrota', draw: 'Empate' };
const RESULT_COLOR = { win: '#39D98A', loss: '#ff6b6b', draw: '#999' };
const PAGE_SIZE = 20;

function parseDateOnly(value) {
  const str = String(value ?? '');
  // mysql2 devuelve DATETIME como Date, que Express serializa a ISO — ya
  // trae hora, así que no hay que volver a añadirle nada.
  return new Date(str);
}

function StatTile({ value, label }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function MatchRow({ item, onPress }) {
  const date = parseDateOnly(item.starts_at);
  const dateLabel = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const resultLabel = RESULT_LABEL[item.result];

  return (
    <TouchableOpacity style={styles.matchRow} activeOpacity={0.8} onPress={() => onPress(item)}>
      <View style={styles.matchDateBox}>
        <Text style={styles.matchDateText}>{dateLabel || '—'}</Text>
      </View>
      <View style={styles.matchBody}>
        <Text style={styles.matchTitle} numberOfLines={1}>{item.title || 'Partido'}</Text>
        <Text style={styles.matchMeta} numberOfLines={1}>
          {item.goals} G · {item.assists} A{item.saves ? ` · ${item.saves} paradas` : ''}
          {item.location ? ` · ${item.location}` : ''}
        </Text>
      </View>
      <View style={styles.matchBadges}>
        {item.is_mvp ? (
          <View style={styles.mvpBadge}><Ionicons name="star" size={11} color="#050505" /></View>
        ) : null}
        {resultLabel ? (
          <Text style={[styles.resultBadge, { color: RESULT_COLOR[item.result] }]}>{resultLabel}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function MySeasonScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [season, setSeason] = useState(null);
  const [history, setHistory] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [seasonRes, historyRes] = await Promise.all([
        api.get('/stats/me/season'),
        api.get('/stats/me/history', { params: { limit: PAGE_SIZE, offset: 0 } }),
      ]);
      setSeason(seasonRes.data?.data || null);
      setHistory(Array.isArray(historyRes.data?.data) ? historyRes.data.data : []);
      setHasMore(Boolean(historyRes.data?.has_more));
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo cargar tu temporada');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      const res = await api.get('/stats/me/history', { params: { limit: PAGE_SIZE, offset: history.length } });
      const next = Array.isArray(res.data?.data) ? res.data.data : [];
      setHistory((prev) => [...prev, ...next]);
      setHasMore(Boolean(res.data?.has_more));
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo cargar más');
    } finally {
      setLoadingMore(false);
    }
  };

  const openMatch = (item) => navigation.navigate('PostMatchSummary', { matchId: item.match_id });

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.orange} />
      </View>
    );
  }

  const decided = (season?.wins || 0) + (season?.losses || 0) + (season?.draws || 0);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.orange} />}
    >
      <ScreenHeader
        eyebrow="TU TEMPORADA"
        title="Resumen completo"
        description="Todo lo que has hecho en EasyFutbol, partido a partido."
        action={(
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver" style={styles.back} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      />

      <LinearGradient colors={['#22170f', '#111318']} style={styles.heroCard}>
        <Text style={styles.heroPlayed}>{season?.matches_played ?? 0}</Text>
        <Text style={styles.heroPlayedLabel}>partidos jugados</Text>

        <View style={styles.tileRow}>
          <StatTile value={season?.goals ?? 0} label="GOLES" />
          <StatTile value={season?.assists ?? 0} label="ASISTENCIAS" />
          <StatTile value={season?.saves ?? 0} label="PARADAS" />
          <StatTile value={season?.mvp_count ?? 0} label="MVP" />
        </View>

        {decided > 0 ? (
          <View style={styles.recordRow}>
            <Text style={styles.recordText}>
              <Text style={{ color: '#39D98A' }}>{season.wins}V</Text>
              {'  '}
              <Text style={{ color: '#ff6b6b' }}>{season.losses}D</Text>
              {'  '}
              <Text style={{ color: '#999' }}>{season.draws}E</Text>
            </Text>
            {season.win_rate != null ? <Text style={styles.winRate}>{season.win_rate}% victorias</Text> : null}
          </View>
        ) : null}
      </LinearGradient>

      <Text style={styles.sectionTitle}>Historial de partidos</Text>

      {history.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="football-outline" size={32} color="#444" />
          <Text style={styles.emptyText}>Todavía no tienes estadísticas registradas.</Text>
        </View>
      ) : (
        <>
          {history.map((item) => (
            <MatchRow key={item.match_id} item={item} onPress={openMatch} />
          ))}
          {hasMore ? (
            <TouchableOpacity style={styles.loadMoreButton} onPress={loadMore} disabled={loadingMore}>
              {loadingMore ? <ActivityIndicator color={colors.orange} /> : <Text style={styles.loadMoreText}>Cargar más</Text>}
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing(2), paddingBottom: 60 },
  back: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#191c22', borderWidth: 1, borderColor: '#30343c' },
  heroCard: { borderRadius: 26, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,106,23,.3)', marginBottom: 22 },
  heroPlayed: { color: '#fff', fontSize: 40, fontWeight: '900' },
  heroPlayedLabel: { color: '#96989e', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 2, textTransform: 'uppercase' },
  tileRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 20 },
  tile: { alignItems: 'center', flex: 1 },
  tileValue: { color: '#fff', fontSize: 22, fontWeight: '900' },
  tileLabel: { color: '#70737a', fontSize: 8, fontWeight: '900', marginTop: 3, letterSpacing: .5 },
  recordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#34302d' },
  recordText: { fontSize: 15, fontWeight: '900' },
  winRate: { color: '#ff8c4d', fontSize: 12, fontWeight: '800' },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginBottom: 12 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: '#777', fontSize: 13, textAlign: 'center' },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#15171c', borderRadius: 16, borderWidth: 1, borderColor: '#252830', padding: 12, marginBottom: 10 },
  matchDateBox: { width: 48, alignItems: 'center' },
  matchDateText: { color: '#ddd', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  matchBody: { flex: 1 },
  matchTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  matchMeta: { color: '#85888f', fontSize: 11, marginTop: 3 },
  matchBadges: { alignItems: 'flex-end', gap: 4 },
  mvpBadge: { backgroundColor: colors.orange, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  resultBadge: { fontSize: 10, fontWeight: '900' },
  loadMoreButton: { marginTop: 4, paddingVertical: 13, alignItems: 'center', borderRadius: radii.medium, borderWidth: 1, borderColor: '#2a2d35' },
  loadMoreText: { color: '#ddd', fontWeight: '800', fontSize: 13 },
});
