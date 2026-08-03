import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, layout, radii, shadows, spacing, typography } from '../../theme';
import { goBackOrFallback } from '../../utils/navigation';

const API_URL = 'https://api.easyfutbol.es/api';

const parseTournamentDate = (dateValue) => {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatTournamentDate = (dateValue) => {
  const date = parseTournamentDate(dateValue);
  if (!date) return 'Fecha pendiente';

  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

const formatTournamentTime = (dateValue) => {
  const date = parseTournamentDate(dateValue);
  if (!date) return 'Horario pendiente';

  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const isUpcomingTournament = (tournament) => {
  if (tournament?.status === 'finished') return false;

  const tournamentDate = parseTournamentDate(tournament?.date);
  if (!tournamentDate) return true;

  const endOfTournamentDay = new Date(tournamentDate);
  endOfTournamentDay.setHours(23, 59, 59, 999);
  return endOfTournamentDay.getTime() >= Date.now();
};

const getStatusLabel = (status) => {
  if (status === 'open') return 'Inscripciones abiertas';
  if (status === 'full') return 'Completo';
  if (status === 'closed') return 'Inscripciones cerradas';
  return 'Próximamente';
};

const HomeTournamentScreen = ({ navigation }) => {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const upcomingTournaments = useMemo(
    () => tournaments.filter(isUpcomingTournament),
    [tournaments]
  );

  const loadTournaments = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(`${API_URL}/tournaments`, {
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'No se pudieron cargar los torneos');
      }

      setTournaments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading tournaments:', error);
      Alert.alert('Error', error.message || 'No se pudieron cargar los torneos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadTournaments();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadTournaments();
  };

  const handleOpenTournament = (tournament) => {
    navigation.navigate('TournamentDetail', { tournamentId: tournament.id });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.orange}
            colors={[colors.orange]}
          />
        }
      >
        <LinearGradient colors={['#2B1609', '#11151B']} style={styles.hero}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => goBackOrFallback(navigation)}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Ionicons name="arrow-back" size={20} color={colors.white} />
            <Text style={styles.backText}>Volver</Text>
          </TouchableOpacity>

          <View style={styles.heroIcon}>
            <Ionicons name="trophy" size={28} color={colors.orange} />
          </View>
          <Text style={styles.eyebrow}>COMPITE · DISFRUTA · COMPARTE</Text>
          <Text style={styles.title}>Torneos EasyFutbol</Text>
          <Text style={styles.subtitle}>
            Eventos especiales, ambiente deportivo y una experiencia de fútbol completa.
          </Text>
        </LinearGradient>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>PRÓXIMAS CITAS</Text>
            <Text style={styles.sectionTitle}>El siguiente desafío</Text>
          </View>
          {!loading && upcomingTournaments.length > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{upcomingTournaments.length}</Text>
            </View>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.orange} />
            <Text style={styles.loadingText}>Buscando próximos torneos...</Text>
          </View>
        ) : upcomingTournaments.length === 0 ? (
          <LinearGradient colors={['#171C23', '#101318']} style={styles.emptyBox}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="construct-outline" size={32} color={colors.orange} />
            </View>
            <Text style={styles.emptyEyebrow}>PRÓXIMAMENTE</Text>
            <Text style={styles.emptyTitle}>Estamos trabajando en el siguiente torneo</Text>
            <Text style={styles.emptyText}>
              Estamos preparando una nueva experiencia EasyFutbol. En cuanto abramos las inscripciones, la encontrarás aquí.
            </Text>
            <View style={styles.emptyHint}>
              <Ionicons name="notifications-outline" size={18} color={colors.orange} />
              <Text style={styles.emptyHintText}>Te avisaremos cuando esté listo</Text>
            </View>
          </LinearGradient>
        ) : (
          upcomingTournaments.map((tournament) => {
            const confirmedPlayers = Number(tournament.confirmed_players || 0);
            const maxPlayers = Number(tournament.max_players || 0);
            const availableSpots = Number(tournament.available_spots || 0);
            const isOpen = tournament.status === 'open' && availableSpots > 0;
            const progress = maxPlayers > 0
              ? Math.min((confirmedPlayers / maxPlayers) * 100, 100)
              : 0;

            return (
              <TouchableOpacity
                key={tournament.id}
                style={styles.card}
                activeOpacity={0.88}
                onPress={() => handleOpenTournament(tournament)}
                accessibilityRole="button"
                accessibilityLabel={`Ver torneo ${tournament.title}`}
              >
                <LinearGradient colors={['rgba(255,90,0,0.16)', 'rgba(17,21,27,0)']} style={styles.cardGlow} />

                <View style={styles.cardTopRow}>
                  <View style={styles.badge}>
                    <Ionicons name="trophy-outline" size={15} color={colors.orange} />
                    <Text style={styles.badgeText}>TORNEO</Text>
                  </View>
                  <View style={[styles.statusPill, isOpen ? styles.statusOpen : styles.statusClosed]}>
                    <View style={[styles.statusDot, isOpen && styles.statusDotOpen]} />
                    <Text style={styles.statusText}>{getStatusLabel(tournament.status)}</Text>
                  </View>
                </View>

                <Text style={styles.cardTitle}>{tournament.title}</Text>
                {tournament.description ? (
                  <Text style={styles.cardDescription} numberOfLines={2}>{tournament.description}</Text>
                ) : null}

                <View style={styles.detailsCard}>
                  <View style={styles.detailRow}>
                    <View style={styles.detailIcon}><Ionicons name="calendar-outline" size={19} color={colors.orange} /></View>
                    <View style={styles.detailCopy}>
                      <Text style={styles.detailLabel}>FECHA Y HORA</Text>
                      <Text style={styles.detailValue}>{formatTournamentDate(tournament.date)} · {formatTournamentTime(tournament.date)}</Text>
                    </View>
                  </View>
                  <View style={styles.detailDivider} />
                  <View style={styles.detailRow}>
                    <View style={styles.detailIcon}><Ionicons name="location-outline" size={20} color={colors.orange} /></View>
                    <View style={styles.detailCopy}>
                      <Text style={styles.detailLabel}>CIUDAD</Text>
                      <Text style={styles.detailValue}>{tournament.city || 'Ubicación pendiente'}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.metricsRow}>
                  <View style={styles.priceBox}>
                    <Text style={styles.metricLabel}>PRECIO</Text>
                    <Text style={styles.metricValue}>{tournament.price_easypass} EasyPass</Text>
                  </View>
                  <View style={[styles.spotsBox, availableSpots > 0 && styles.spotsBoxAvailable]}>
                    <Text style={styles.metricLabel}>PLAZAS LIBRES</Text>
                    <Text style={[styles.metricValue, availableSpots > 0 && styles.spotsValue]}>{availableSpots}</Text>
                  </View>
                </View>

                <View style={styles.progressHeader}>
                  <Text style={styles.progressText}>Jugadores confirmados</Text>
                  <Text style={styles.progressCount}>{confirmedPlayers}/{maxPlayers}</Text>
                </View>
                <View style={styles.progressBarBackground}>
                  <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                </View>

                <View style={styles.ctaButton}>
                  <Text style={styles.ctaText}>Ver torneo</Text>
                  <Ionicons name="arrow-forward" size={19} color={colors.black} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', padding: layout.screenPadding, paddingBottom: spacing(6) },
  hero: { borderRadius: radii.large, borderWidth: 1, borderColor: 'rgba(255,90,0,0.28)', padding: spacing(2), marginBottom: spacing(2.5), overflow: 'hidden', ...shadows.card },
  backButton: { minHeight: layout.minTouchTarget, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing(0.75) },
  backText: { color: colors.white, ...typography.bodyStrong },
  heroIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,90,0,0.14)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.35)', marginTop: spacing(1) },
  eyebrow: { color: colors.orange, ...typography.overline, marginTop: spacing(1.5) },
  title: { color: colors.white, ...typography.display, marginTop: spacing(0.75) },
  subtitle: { color: colors.textMuted, ...typography.body, marginTop: spacing(0.75), maxWidth: 600 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: spacing(1.5) },
  sectionEyebrow: { color: colors.orange, ...typography.overline },
  sectionTitle: { color: colors.white, ...typography.heading, marginTop: 3 },
  countBadge: { minWidth: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,90,0,0.14)' },
  countText: { color: colors.orange, fontWeight: '900' },
  loadingBox: { minHeight: 220, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: radii.large, borderWidth: 1, borderColor: colors.border },
  loadingText: { color: colors.textMuted, ...typography.body, marginTop: spacing(1.5) },
  emptyBox: { alignItems: 'center', borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing(2.5), paddingVertical: spacing(4), overflow: 'hidden', ...shadows.card },
  emptyIconWrap: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,90,0,0.12)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.30)' },
  emptyEyebrow: { color: colors.orange, ...typography.overline, marginTop: spacing(2) },
  emptyTitle: { color: colors.white, ...typography.title, textAlign: 'center', marginTop: spacing(0.75), maxWidth: 430 },
  emptyText: { color: colors.textMuted, ...typography.body, textAlign: 'center', marginTop: spacing(1), maxWidth: 500 },
  emptyHint: { minHeight: layout.minTouchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(0.75), backgroundColor: 'rgba(255,90,0,0.10)', borderRadius: radii.medium, paddingHorizontal: spacing(1.5), marginTop: spacing(2) },
  emptyHintText: { color: colors.white, ...typography.caption },
  card: { position: 'relative', backgroundColor: colors.surface, borderRadius: radii.large, padding: spacing(2), marginBottom: spacing(2), borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadows.card },
  cardGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 110 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing(1), marginBottom: spacing(1.5) },
  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing(0.5), backgroundColor: 'rgba(255,90,0,0.12)', paddingHorizontal: spacing(1), paddingVertical: spacing(0.75), borderRadius: radii.pill },
  badgeText: { color: colors.orange, ...typography.overline, fontSize: 10 },
  statusPill: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: spacing(0.6), paddingHorizontal: spacing(1), paddingVertical: spacing(0.75), borderRadius: radii.pill },
  statusOpen: { backgroundColor: 'rgba(57,217,138,0.12)' },
  statusClosed: { backgroundColor: 'rgba(139,147,158,0.16)' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textSubtle },
  statusDotOpen: { backgroundColor: colors.success },
  statusText: { flexShrink: 1, color: colors.white, ...typography.caption },
  cardTitle: { color: colors.white, ...typography.title },
  cardDescription: { color: colors.textMuted, ...typography.body, marginTop: spacing(0.75) },
  detailsCard: { backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, marginTop: spacing(2), padding: spacing(1.25) },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
  detailIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,90,0,0.10)' },
  detailCopy: { flex: 1 },
  detailLabel: { color: colors.textSubtle, ...typography.overline, fontSize: 9 },
  detailValue: { color: colors.white, ...typography.bodyStrong, textTransform: 'capitalize', marginTop: 2 },
  detailDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing(1) },
  metricsRow: { flexDirection: 'row', gap: spacing(1), marginTop: spacing(1.25) },
  priceBox: { flex: 1, minHeight: 74, justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderRadius: radii.medium, padding: spacing(1.25) },
  spotsBox: { flex: 1, minHeight: 74, justifyContent: 'center', backgroundColor: colors.surfaceElevated, borderRadius: radii.medium, padding: spacing(1.25) },
  spotsBoxAvailable: { backgroundColor: 'rgba(57,217,138,0.10)', borderWidth: 1, borderColor: 'rgba(57,217,138,0.22)' },
  metricLabel: { color: colors.textSubtle, ...typography.overline, fontSize: 9 },
  metricValue: { color: colors.white, ...typography.bodyStrong, marginTop: 3 },
  spotsValue: { color: colors.success },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(1.75), marginBottom: spacing(0.75) },
  progressText: { color: colors.textMuted, ...typography.caption },
  progressCount: { color: colors.white, ...typography.caption },
  progressBarBackground: { height: 7, borderRadius: radii.pill, backgroundColor: colors.surfaceElevated, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.orange },
  ctaButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(0.75), backgroundColor: colors.orange, borderRadius: radii.medium, marginTop: spacing(2), paddingHorizontal: spacing(1.5) },
  ctaText: { color: colors.black, ...typography.bodyStrong, fontWeight: '900' },
});

export default HomeTournamentScreen;
