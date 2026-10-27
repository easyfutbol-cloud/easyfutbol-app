import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import { colors, radii, spacing } from '../theme';

const STREAK_STEP = 4;

function formatEnds(challenge) {
  const [year, month, day] = String(challenge.ends_on || '').split('-').map(Number);
  if (!year) return '';
  const label = new Date(year, month - 1, day).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${challenge.period === 'month' ? 'Este mes' : 'Esta semana'} · hasta el ${label}`;
}

function formatHistoryDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function ChallengeRow({ challenge }) {
  const pct = Math.round((challenge.progress / challenge.target) * 100);
  return (
    <View style={[styles.challenge, challenge.completed && styles.challengeDone]}>
      <View style={[styles.challengeIcon, challenge.completed && styles.challengeIconDone]}>
        <Ionicons name={challenge.completed ? 'checkmark' : challenge.icon} size={20} color={challenge.completed ? '#050505' : colors.orange} />
      </View>
      <View style={styles.challengeCopy}>
        <Text style={styles.challengeTitle}>{challenge.title}</Text>
        <Text style={styles.challengeMeta}>{formatEnds(challenge)}</Text>
        <View style={styles.bar}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>
      </View>
      <View style={styles.reward}>
        <Text style={[styles.rewardValue, challenge.completed && styles.rewardDone]}>+{challenge.reward}</Text>
        <Text style={styles.rewardLabel}>{challenge.completed ? 'CONSEGUIDO' : `${challenge.progress}/${challenge.target}`}</Text>
      </View>
    </View>
  );
}

export default function ChallengesScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('/easypoints/me');
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.msg || 'No se pudieron cargar tus retos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const back = (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver" style={styles.back} onPress={() => navigation.goBack()}>
      <Ionicons name="chevron-back" size={22} color="#fff" />
    </TouchableOpacity>
  );

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.orange} /></View>;
  if (!data) {
    return (
      <View style={styles.loading}>
        <Text style={styles.muted}>{error}</Text>
        <TouchableOpacity style={styles.retry} onPress={() => { setLoading(true); load(); }}><Text style={styles.retryText}>Reintentar</Text></TouchableOpacity>
      </View>
    );
  }

  const { streak, balance, challenges, just_awarded: justAwarded = [], history = [] } = data;
  const stepProgress = streak.current % STREAK_STEP;
  const status = streak.at_risk
    ? 'Juega antes del domingo para no perderla'
    : streak.played_this_week
      ? '¡Esta semana ya has jugado!'
      : 'Juega un partido para empezarla';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.orange} />}>
      <ScreenHeader eyebrow="RETOS" title="Racha y retos" description="Juega, completa retos y gana EasyPoints para personalizar tu perfil." action={back} />

      {justAwarded.length ? (
        <View style={styles.awarded}>
          <Ionicons name="sparkles" size={18} color="#050505" />
          <Text style={styles.awardedText}>
            {justAwarded.length === 1 ? justAwarded[0].description.replace(/^Reto: /, '') : `${justAwarded.length} premios nuevos`} · +{justAwarded.reduce((s, a) => s + a.amount, 0)} EasyPoints
          </Text>
        </View>
      ) : null}

      <LinearGradient colors={['#2a160a', '#111318']} style={styles.streakCard}>
        <View style={styles.streakTop}>
          <Ionicons name="flame" size={46} color={streak.current ? colors.orange : '#4a4d55'} />
          <View style={{ flex: 1 }}>
            <Text style={styles.streakValue}>{streak.current}</Text>
            <Text style={styles.streakLabel}>{streak.current === 1 ? 'SEMANA SEGUIDA' : 'SEMANAS SEGUIDAS'}</Text>
          </View>
          <View style={styles.best}>
            <Text style={styles.bestValue}>{streak.best}</Text>
            <Text style={styles.bestLabel}>MEJOR</Text>
          </View>
        </View>
        <Text style={[styles.streakStatus, streak.at_risk && styles.streakRisk]}>{status}</Text>
        <View style={styles.dots}>
          {Array.from({ length: STREAK_STEP }, (_, i) => (
            <View key={i} style={[styles.dot, i < stepProgress && styles.dotOn]} />
          ))}
          <View style={styles.dotPrize}><Ionicons name="gift" size={14} color={colors.orange} /><Text style={styles.dotPrizeText}>+{streak.next_milestone_reward}</Text></View>
        </View>
        <Text style={styles.milestoneText}>Cada {STREAK_STEP} semanas seguidas ganas EasyPoints extra (próximo premio a las {streak.next_milestone}).</Text>
      </LinearGradient>

      <TouchableOpacity style={styles.balance} onPress={() => navigation.navigate('EasyPointsShop')} activeOpacity={0.85} accessibilityRole="button">
        <View>
          <Text style={styles.eyebrow}>TUS EASYPOINTS</Text>
          <Text style={styles.balanceValue}>{balance}</Text>
        </View>
        <View style={styles.shopButton}>
          <Ionicons name="color-palette" size={17} color="#050505" />
          <Text style={styles.shopButtonText}>Personalizar perfil</Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Retos</Text>
      {challenges.map((challenge) => <ChallengeRow key={challenge.code} challenge={challenge} />)}
      <Text style={styles.footnote}>Los retos son solo tuyos: no compites con nadie. Cuentan los partidos con el acta publicada.</Text>

      {history.length ? (
        <>
          <Text style={styles.sectionTitle}>Movimientos</Text>
          <View style={styles.history}>
            {history.map((item, index) => (
              <View key={`${item.created_at}-${index}`} style={[styles.historyRow, index > 0 && styles.historyBorder]}>
                <Text style={styles.historyText} numberOfLines={1}>{item.description}</Text>
                <Text style={styles.historyDate}>{formatHistoryDate(item.created_at)}</Text>
                <Text style={[styles.historyAmount, item.amount < 0 && styles.historySpent]}>{item.amount > 0 ? `+${item.amount}` : item.amount}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing(2), paddingBottom: 120 },
  loading: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  muted: { color: colors.textMuted, fontWeight: '700', textAlign: 'center' },
  retry: { backgroundColor: colors.orange, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12 },
  retryText: { color: '#080808', fontWeight: '900' },
  back: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#191c22', borderWidth: 1, borderColor: '#30343c' },
  awarded: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.orange, borderRadius: 14, padding: 12, marginBottom: 12 },
  awardedText: { flex: 1, color: '#050505', fontWeight: '900', fontSize: 13 },
  streakCard: { borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(255,106,23,.35)', marginBottom: 12 },
  streakTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  streakValue: { color: '#fff', fontSize: 44, fontWeight: '900', lineHeight: 48 },
  streakLabel: { color: colors.orange, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  best: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,.06)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  bestValue: { color: '#fff', fontSize: 18, fontWeight: '900' },
  bestLabel: { color: '#8d9097', fontSize: 8, fontWeight: '900' },
  streakStatus: { color: '#c9cbd0', fontSize: 13, fontWeight: '700', marginTop: 14 },
  streakRisk: { color: colors.orange },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  dot: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#2c2f36' },
  dotOn: { backgroundColor: colors.orange },
  dotPrize: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4 },
  dotPrizeText: { color: colors.orange, fontSize: 12, fontWeight: '900' },
  milestoneText: { color: '#7d8088', fontSize: 11, marginTop: 10, lineHeight: 15 },
  balance: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#15171c', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#252830', marginBottom: 22 },
  eyebrow: { color: colors.orange, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  balanceValue: { color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 2 },
  shopButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.orange, borderRadius: radii.medium, paddingHorizontal: 14, paddingVertical: 11 },
  shopButtonText: { color: '#050505', fontWeight: '900', fontSize: 13 },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 12 },
  challenge: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#15171c', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#252830', marginBottom: 10 },
  challengeDone: { borderColor: 'rgba(255,90,0,.5)' },
  challengeIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,90,0,.12)', alignItems: 'center', justifyContent: 'center' },
  challengeIconDone: { backgroundColor: colors.orange },
  challengeCopy: { flex: 1 },
  challengeTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  challengeMeta: { color: '#7d8088', fontSize: 10, marginTop: 3 },
  bar: { height: 6, borderRadius: 3, backgroundColor: '#2c2f36', marginTop: 8, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.orange, borderRadius: 3 },
  reward: { alignItems: 'flex-end', minWidth: 58 },
  rewardValue: { color: '#fff', fontSize: 16, fontWeight: '900' },
  rewardDone: { color: colors.orange },
  rewardLabel: { color: '#7d8088', fontSize: 8, fontWeight: '900', marginTop: 2 },
  footnote: { color: '#6d7078', fontSize: 11, lineHeight: 16, marginBottom: 22, marginTop: 2 },
  history: { backgroundColor: '#15171c', borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: '#252830' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  historyBorder: { borderTopWidth: 1, borderTopColor: '#24272e' },
  historyText: { flex: 1, color: '#d6d7db', fontSize: 12, fontWeight: '700' },
  historyDate: { color: '#6d7078', fontSize: 10 },
  historyAmount: { color: colors.orange, fontSize: 13, fontWeight: '900', minWidth: 44, textAlign: 'right' },
  historySpent: { color: '#8d9097' },
});
