import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { SocialAvatar } from '../components/social/SocialComponents';

const PERIODS = [7, 30, 90];
const TEAMS_LABELS = { balanced: 'Igualados', so_so: 'Más o menos', unbalanced: 'Descompensados' };

const fmtAvg = (value) => (value === null || value === undefined ? '—' : String(value).replace('.', ','));
const fmtDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
};

function Rating({ label, value }) {
  if (value === null || value === undefined) return null;
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{label} {value}</Text>
      <Ionicons name="star" size={10} color="#ff7a32" />
    </View>
  );
}

function Review({ review, onOpenPlayer }) {
  const teamsLabel = TEAMS_LABELS[review.teams_balance];
  return (
    <TouchableOpacity style={styles.review} onPress={() => onOpenPlayer(review.user_id)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Ver perfil de ${review.user_name}`}>
      <SocialAvatar uri={review.avatar_url} name={review.user_name} size={36} />
      <View style={styles.reviewBody}>
        <Text style={styles.reviewName} numberOfLines={1}>{review.user_name}</Text>
        <View style={styles.pills}>
          <Rating label="Org." value={review.organizer_rating} />
          <Rating label="Campo" value={review.field_rating} />
          {teamsLabel ? (
            <View style={[styles.pill, review.teams_balance === 'unbalanced' && styles.pillBad]}>
              <Text style={[styles.pillText, review.teams_balance === 'unbalanced' && styles.pillBadText]}>{teamsLabel}</Text>
            </View>
          ) : null}
        </View>
        {review.comment ? <Text style={styles.comment}>“{review.comment}”</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

// Reseñas de cada partido y quién las ha dejado. Se abre desde el panel y
// desde Retención; al tocar a un jugador se va a su perfil.
export default function AdminMatchReviewsScreen({ navigation }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const load = useCallback(async (period, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/admin/match-reviews', { params: { days: period } });
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.msg || 'No se pudieron cargar las reseñas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(days); }, [load, days]));

  const openPlayer = (userId) => navigation.navigate('PlayerSocialProfile', { userId });
  const toggle = (matchId) => setCollapsed((current) => ({ ...current, [matchId]: !current[matchId] }));

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
        <Text style={styles.screenTitle}>Reseñas de partidos</Text>
        <Text style={styles.screenSubtitle}>Qué ha valorado cada jugador en cada partido.</Text>

        <View style={styles.periods}>
          {PERIODS.map((period) => (
            <TouchableOpacity key={period} style={[styles.period, days === period && styles.periodActive]} onPress={() => setDays(period)}>
              <Text style={[styles.periodText, days === period && styles.periodTextActive]}>{period} días</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? <ActivityIndicator size="large" color="#ff5a00" style={{ marginTop: 40 }} /> : null}
        {!loading && error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && !error && data && !data.matches.length ? <Text style={styles.empty}>No hay reseñas en este periodo.</Text> : null}

        {!loading && data ? data.matches.map((match) => {
          const open = !collapsed[match.match_id];
          return (
            <View key={match.match_id} style={styles.card}>
              <TouchableOpacity style={styles.matchHeader} onPress={() => toggle(match.match_id)} activeOpacity={0.8} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.matchTitle} numberOfLines={1}>{match.title}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{[fmtDate(match.starts_at), match.field_name].filter(Boolean).join(' · ')}</Text>
                  <Text style={styles.summary}>
                    {match.reviews.length} {match.reviews.length === 1 ? 'reseña' : 'reseñas'} · Org. {fmtAvg(match.organizer_avg)} ★ · Campo {fmtAvg(match.field_avg)} ★{match.unbalanced ? ` · ${match.unbalanced} descomp.` : ''}
                  </Text>
                </View>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#888" />
              </TouchableOpacity>
              {open ? match.reviews.map((review) => <Review key={review.user_id} review={review} onOpenPlayer={openPlayer} />) : null}
            </View>
          );
        }) : null}
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
  periods: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  period: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#141414', borderWidth: 1, borderColor: '#262626' },
  periodActive: { backgroundColor: '#ff5a00', borderColor: '#ff5a00' },
  periodText: { color: '#ccc', fontSize: 12, fontWeight: '800' },
  periodTextActive: { color: '#000' },
  error: { color: '#ff6b6b', marginTop: 20 },
  empty: { color: '#888', marginTop: 24, textAlign: 'center' },
  card: { backgroundColor: '#141414', borderRadius: 16, borderWidth: 1, borderColor: '#262626', padding: 14, marginBottom: 10 },
  matchHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  matchTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  meta: { color: '#888', fontSize: 12, marginTop: 2 },
  summary: { color: '#ff7a32', fontSize: 12, fontWeight: '800', marginTop: 6 },
  review: { flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#262626' },
  reviewBody: { flex: 1 },
  reviewName: { color: '#fff', fontSize: 13, fontWeight: '800' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#222', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  pillText: { color: '#ddd', fontSize: 11, fontWeight: '700' },
  pillBad: { backgroundColor: 'rgba(229,72,77,.18)' },
  pillBadText: { color: '#ff7b7f' },
  comment: { color: '#fff', fontSize: 13, lineHeight: 19, marginTop: 8 },
});
