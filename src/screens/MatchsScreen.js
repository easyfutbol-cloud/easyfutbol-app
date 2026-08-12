// src/screens/MatchsScreen.js
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  ImageBackground,
} from 'react-native';
import api from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { colors, layout, radii, spacing, typography } from '../theme';

const STORAGE_CITY_KEY = 'ef_selected_city';
const FALLBACK_CITIES = ['Valladolid', 'Avilés'];
const SCREEN_BACKGROUND = require('../../assets/matches/match-6.jpg');

const MATCH_CARD_IMAGES = [
  require('../../assets/matches/match-2.jpg'),
  require('../../assets/matches/match-4.jpg'),
  require('../../assets/matches/match-5.jpg'),
  require('../../assets/matches/match-8.jpg'),
  require('../../assets/matches/match-9.jpg'),
];

function getMatchCardImage(match) {
  if (!MATCH_CARD_IMAGES.length) return null;

  const rawId = Number(match?.id);
  const safeIndex = Number.isFinite(rawId)
    ? Math.abs(rawId) % MATCH_CARD_IMAGES.length
    : 0;

  return MATCH_CARD_IMAGES[safeIndex];
}

// Helper: formatea el día (sin la hora)
function formatDayLabel(dateObj) {
  if (!dateObj) return '';
  const label = dateObj.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatCalendarDay(dateObj) {
  if (!dateObj) return { weekday: '', day: '', month: '' };
  return {
    weekday: dateObj.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '').toUpperCase(),
    day: dateObj.toLocaleDateString('es-ES', { day: '2-digit' }),
    month: dateObj.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '').toUpperCase(),
  };
}

function buildCityOptions(matches) {
  const set = new Set(FALLBACK_CITIES);
  matches.forEach((m) => {
    const c = (m.city || '').trim();
    if (c) set.add(c);
  });
  return Array.from(set).sort((a, b) => {
    if (a === 'Valladolid') return -1;
    if (b === 'Valladolid') return 1;
    return a.localeCompare(b, 'es');
  });
}

// Agrupa los partidos por día
function groupMatchesByDay(matches) {
  const groups = {};

  matches.forEach((match) => {
    if (!match.starts_at) return;
    const dateObj = new Date(match.starts_at);
    if (Number.isNaN(dateObj.getTime())) return;

    const key = dateObj.toISOString().slice(0, 10); // YYYY-MM-DD
    const title = formatDayLabel(dateObj);

    if (!groups[key]) {
      groups[key] = { title, dateObj, data: [] };
    }
    groups[key].data.push(match);
  });

  // Pasamos de objeto a array y ordenamos por fecha
  return Object.keys(groups)
    .sort()
    .map((key) => groups[key]);
}

function ScreenBackdrop({ children }) {
  return (
    <ImageBackground
      source={SCREEN_BACKGROUND}
      style={styles.container}
      imageStyle={styles.screenBackgroundImage}
    >
      <LinearGradient
        colors={['rgba(8,10,14,0.82)', 'rgba(8,10,14,0.98)']}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </ImageBackground>
  );
}

export default function MatchsScreen({ navigation }) {
  const [matches, setMatches] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationsConfigured, setRecommendationsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedCity, setSelectedCity] = useState('');
  const [citySelectorOpen, setCitySelectorOpen] = useState(false);
  const [initialCityLoaded, setInitialCityLoaded] = useState(false);

  const availableCities = useMemo(() => buildCityOptions(matches), [matches]);

  const filteredMatches = useMemo(() => {
    if (!selectedCity) return matches;
    return matches.filter((m) => (m.city || '').trim() === selectedCity);
  }, [matches, selectedCity]);

  const cityRecommendations = useMemo(() => {
    const items = selectedCity
      ? recommendations.filter((match) => (match.city || '').trim() === selectedCity)
      : recommendations;
    return items.slice(0, 3);
  }, [recommendations, selectedCity]);

  const recommendationById = useMemo(
    () => new Map(recommendations.map((match) => [String(match.id), match])),
    [recommendations]
  );

  const loadMatches = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [res, recommendationRes] = await Promise.all([
        api.get('/matches', { params: { only_open: 1 } }),
        api.get('/me/match-recommendations').catch(() => null),
      ]);
      const payload = res.data;
      const data = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
        ? payload
        : [];
      const now = new Date();
      const upcoming = data.filter((m) => {
        if (!m.starts_at) return false;
        const d = new Date(m.starts_at);
        if (Number.isNaN(d.getTime())) return false;
        return d >= now;
      });

      setMatches(upcoming);
      setRecommendations(Array.isArray(recommendationRes?.data?.data) ? recommendationRes.data.data : []);
      setRecommendationsConfigured(Boolean(recommendationRes?.data?.configured));
      console.log('PARTIDOS API (futuros):', upcoming.length, upcoming.map((m) => m.id));
    } catch (e) {
      console.log('Error cargando partidos desde API:', e.message);
      setMatches([]);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_CITY_KEY);
        if (saved) setSelectedCity(saved);
      } catch (e) {
        // ignore
      } finally {
        setInitialCityLoaded(true);
        loadMatches(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!initialCityLoaded) return;
    if (selectedCity) return;
    setCitySelectorOpen(true);
  }, [selectedCity, initialCityLoaded]);

  const onRefresh = useCallback(() => {
    loadMatches(true);
  }, []);

  const changeCity = useCallback(async (city) => {
    setSelectedCity(city);
    setCitySelectorOpen(false);
    try {
      await AsyncStorage.setItem(STORAGE_CITY_KEY, city);
    } catch (e) {
      // ignore
    }
  }, []);

  const sections = useMemo(() => groupMatchesByDay(filteredMatches), [filteredMatches]);

  const renderItem = ({ item }) => {
    const startsAt = item.starts_at;
    const dateObj = startsAt ? new Date(startsAt) : null;

    const timeLabel = dateObj
      ? dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : '';

    const fieldName = item.field_name || '';
    const city = item.city || '';
    const cardImage = getMatchCardImage(item);
    const hasCapacity = item.capacity !== null && item.capacity !== undefined && item.capacity !== '';
    const hasSpotsTaken = item.spots_taken !== null && item.spots_taken !== undefined && item.spots_taken !== '';
    const hasApiRemaining = item.spots_remaining !== null && item.spots_remaining !== undefined && item.spots_remaining !== '';
    const capacity = hasCapacity ? Number(item.capacity) : null;
    const spotsTaken = hasSpotsTaken ? Number(item.spots_taken) : null;
    const apiRemaining = hasApiRemaining ? Number(item.spots_remaining) : null;
    const remainingSpots = hasApiRemaining && Number.isFinite(apiRemaining)
      ? Math.max(0, apiRemaining)
      : Number.isFinite(capacity) && Number.isFinite(spotsTaken)
      ? Math.max(0, capacity - spotsTaken)
      : null;
    const isFull = item.is_full === true || Number(item.is_full) === 1 || remainingSpots === 0;
    const recommendation = recommendationById.get(String(item.id));

    const handlePress = () => {
      navigation.navigate('Match', { matchId: item.id });
    };

    return (
      <TouchableOpacity
        style={styles.cardWrapper}
        activeOpacity={0.9}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${timeLabel}. ${fieldName}${fieldName && city ? ', ' : ''}${city}${remainingSpots != null ? `. ${remainingSpots} plazas disponibles` : ''}`}
        accessibilityHint="Abre los detalles para reservar este partido"
      >
        <ImageBackground
          source={cardImage}
          defaultSource={cardImage}
          style={styles.cardBackground}
          imageStyle={styles.cardImage}
        >
          <LinearGradient
            colors={['rgba(8,10,14,0.20)', 'rgba(8,10,14,0.96)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.cardOverlay}
          >
            <View style={styles.cardTopRow}>
              <View style={styles.cardBadges}>
                {recommendation ? (
                  <View style={styles.recommendedBadge}>
                    <Ionicons name="sparkles" color={colors.orange} size={12} />
                    <Text style={styles.recommendedBadgeText}>PARA TI · {recommendation.score}%</Text>
                  </View>
                ) : null}
                <View style={styles.timeBadge}>
                  <Text style={styles.timeBadgeText}>{timeLabel || 'HORA PENDIENTE'}</Text>
                </View>
                {remainingSpots != null ? (
                  <View style={[styles.availabilityBadge, isFull && styles.availabilityBadgeFull]}>
                    <Text style={styles.availabilityBadgeText}>
                      {isFull ? 'COMPLETO' : `${remainingSpots} PLAZA${remainingSpots === 1 ? '' : 'S'}`}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.cardArrow} accessible={false}>
                <Text style={styles.cardArrowText}>›</Text>
              </View>
            </View>

            <View>
              <Text style={styles.title}>{item.title}</Text>
              {(fieldName || city) && (
                <Text style={styles.meta}>
                  {fieldName}
                  {fieldName && city ? ' · ' : ''}
                  {city}
                </Text>
              )}
              <Text style={styles.reserveText}>RESERVAR PLAZA</Text>
            </View>
          </LinearGradient>
        </ImageBackground>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }) => {
    const calendar = formatCalendarDay(section.dateObj);
    return (
      <View style={styles.sectionHeaderContainer}>
        <View style={styles.calendarBadge}>
          <View style={styles.calendarTopStrip} />
          <Text style={styles.calendarWeekday}>{calendar.weekday}</Text>
          <Text style={styles.calendarDay}>{calendar.day}</Text>
          <Text style={styles.calendarMonth}>{calendar.month}</Text>
        </View>
        <View style={styles.sectionHeaderTextWrap}>
          <Text style={styles.sectionHeaderText}>{section.title}</Text>
          <Text style={styles.sectionHeaderSubText}>{section.data.length} partido{section.data.length === 1 ? '' : 's'} disponible{section.data.length === 1 ? '' : 's'}</Text>
        </View>
      </View>
    );
  };

  const renderRecommendations = () => (
    <View style={styles.recommendationsBlock}>
      <View style={styles.recommendationsHeading}>
        <View style={styles.recommendationsTitleWrap}>
          <View style={styles.recommendationsIcon}>
            <Ionicons name="sparkles" color={colors.orange} size={18} />
          </View>
          <View style={styles.recommendationsTitleText}>
            <Text style={styles.recommendationsEyebrow}>SELECCIÓN PERSONALIZADA</Text>
            <Text style={styles.recommendationsTitle}>Partidos para ti</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('MatchPreferences')}
          style={styles.preferencesButton}
          accessibilityRole="button"
          accessibilityLabel="Configurar disponibilidad"
        >
          <Ionicons name="options-outline" color={colors.textMuted} size={17} />
        </TouchableOpacity>
      </View>

      {!recommendationsConfigured ? (
        <TouchableOpacity
          style={styles.recommendationsSetup}
          onPress={() => navigation.navigate('MatchPreferences')}
          activeOpacity={0.86}
        >
          <View style={styles.recommendationsSetupCopy}>
            <Text style={styles.recommendationsSetupTitle}>Dinos cuándo y dónde juegas</Text>
            <Text style={styles.recommendationsSetupText}>Te mostraremos primero los partidos que mejor encajen contigo.</Text>
          </View>
          <Ionicons name="arrow-forward" color={colors.orange} size={20} />
        </TouchableOpacity>
      ) : cityRecommendations.length ? (
        cityRecommendations.map((match) => {
          const date = new Date(match.starts_at);
          const dateLabel = Number.isNaN(date.getTime())
            ? ''
            : date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
          const timeLabel = Number.isNaN(date.getTime())
            ? ''
            : date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
          return (
            <TouchableOpacity
              key={match.id}
              style={styles.recommendationRow}
              onPress={() => navigation.navigate('Match', { matchId: match.id })}
              activeOpacity={0.86}
            >
              <View style={styles.recommendationScore}>
                <Text style={styles.recommendationScoreValue}>{match.score}</Text>
                <Text style={styles.recommendationScoreLabel}>MATCH</Text>
              </View>
              <View style={styles.recommendationCopy}>
                <Text style={styles.recommendationName} numberOfLines={1}>{match.title}</Text>
                <Text style={styles.recommendationMeta}>{dateLabel} · {timeLabel}</Text>
                <Text style={styles.recommendationReasons} numberOfLines={1}>{(match.reasons || []).join(' · ')}</Text>
              </View>
              <Ionicons name="chevron-forward" color={colors.textSubtle} size={20} />
            </TouchableOpacity>
          );
        })
      ) : (
        <View style={styles.recommendationsEmpty}>
          <Text style={styles.recommendationsEmptyTitle}>Sin coincidencias en {selectedCity}</Text>
          <Text style={styles.recommendationsEmptyText}>Puedes ampliar tus días, horarios o sedes desde el botón de ajustes.</Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <ScreenBackdrop>
        <StatusBar barStyle="light-content" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.orange} />
          <Text style={styles.loadingText}>Cargando partidos…</Text>
        </View>
      </ScreenBackdrop>
    );
  }

  if (!loading && initialCityLoaded && (!selectedCity || citySelectorOpen)) {
    return (
      <ScreenBackdrop>
        <StatusBar barStyle="light-content" />
        <View style={styles.citySelectorFull}>
          <ScreenHeader
            eyebrow="EASYFUTBOL"
            title="¿Dónde quieres jugar?"
            description="Elige una ciudad para ver su calendario. La guardaremos como predeterminada y podrás cambiarla cuando quieras."
          />

          <View style={styles.citySelectorGrid}>
            {availableCities.map((c) => {
              const active = c === selectedCity;
              return (
                <TouchableOpacity
                  key={c}
                  activeOpacity={0.86}
                  onPress={() => changeCity(c)}
                  style={[styles.citySelectorCard, active && styles.citySelectorCardActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.citySelectorCardTitle, active && styles.citySelectorCardTitleActive]}>{c}</Text>
                  <Text style={[styles.citySelectorCardMeta, active && styles.citySelectorCardMetaActive]}>
                    {active ? 'Ciudad predeterminada' : 'Ver calendario'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScreenBackdrop>
    );
  }

  if (!loading && selectedCity && filteredMatches.length === 0) {
    return (
      <ScreenBackdrop>
        <StatusBar barStyle="light-content" />
        <ScreenHeader
          eyebrow="PRÓXIMOS PARTIDOS"
          title="Elige tu próximo partido"
          description="Nuevas oportunidades para jugar cada semana."
        />
        <View style={styles.topCityHeader}>
          <View style={styles.topCityAccent} />
          <View style={styles.topCityInfo}>
            <Text style={styles.topCityLabel}>Ciudad predeterminada</Text>
            <Text style={styles.topCityName}>{selectedCity}</Text>
            <Text style={styles.topCityHint}>Te avisaremos cuando haya nuevos partidos</Text>
          </View>
          <TouchableOpacity style={styles.changeCityBtn} onPress={() => setCitySelectorOpen(true)} activeOpacity={0.85}>
            <Text style={styles.changeCityText}>Cambiar ciudad</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No hay partidos disponibles</Text>
          <Text style={styles.emptyText}>No hay partidos abiertos en {selectedCity} ahora mismo.</Text>
        </View>
      </ScreenBackdrop>
    );
  }

  return (
    <ScreenBackdrop>
      <StatusBar barStyle="light-content" />
      <View style={styles.contentBoundary}>
        <ScreenHeader
          eyebrow="PRÓXIMOS PARTIDOS"
          title="Elige tu próximo partido"
          description="Reserva tu plaza y sal al campo esta semana."
        />
        <View style={styles.topCityHeader}>
          <View style={styles.topCityAccent} />
          <View style={styles.topCityInfo}>
            <Text style={styles.topCityLabel}>TU CIUDAD</Text>
            <Text style={styles.topCityName}>{selectedCity}</Text>
            <Text style={styles.topCityHint}>{filteredMatches.length} partido{filteredMatches.length === 1 ? '' : 's'} disponible{filteredMatches.length === 1 ? '' : 's'}</Text>
          </View>
          <TouchableOpacity style={styles.changeCityBtn} onPress={() => setCitySelectorOpen(true)} activeOpacity={0.85} accessibilityRole="button">
            <Text style={styles.changeCityText}>Cambiar</Text>
          </TouchableOpacity>
        </View>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={renderRecommendations}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.orange}
          />
        }
      />
    </ScreenBackdrop>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing(2),
  },
  screenBackgroundImage: {
    resizeMode: 'cover',
    opacity: 0.48,
  },
  contentBoundary: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingTop: spacing(1),
  },
  listContent: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingVertical: spacing(1),
    paddingBottom: spacing(4),
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(3),
  },
  sectionHeaderContainer: {
    marginTop: spacing(2),
    marginBottom: spacing(1),
    flexDirection: 'row',
    alignItems: 'center',
  },
  calendarBadge: {
    width: 50,
    minHeight: 58,
    borderRadius: radii.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,90,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(1.1),
    overflow: 'hidden',
  },
  calendarTopStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: colors.orange,
  },
  calendarWeekday: {
    color: colors.orange,
    fontSize: 9,
    fontWeight: '900',
    marginTop: 4,
  },
  calendarDay: {
    color: colors.white,
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 24,
  },
  calendarMonth: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '900',
  },
  sectionHeaderTextWrap: {
    flex: 1,
  },
  sectionHeaderText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  sectionHeaderSubText: {
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  citySelectorFull: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingHorizontal: spacing(1),
  },
  citySelectorGrid: {
    gap: spacing(1.2),
  },
  citySelectorCard: {
    minHeight: 84,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.large,
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(2),
  },
  citySelectorCardActive: {
    backgroundColor: 'rgba(255,90,0,0.16)',
    borderColor: colors.orange,
  },
  citySelectorCardTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '900',
  },
  citySelectorCardTitleActive: {
    color: colors.white,
  },
  citySelectorCardMeta: {
    color: '#999',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 5,
  },
  citySelectorCardMetaActive: {
    color: colors.orange,
  },
  topCityHeader: {
    marginBottom: spacing(1.5),
    backgroundColor: 'rgba(17,21,27,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radii.large,
    padding: spacing(1.5),
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.1),
  },
  topCityAccent: {
    width: 5,
    alignSelf: 'stretch',
    borderRadius: 999,
    backgroundColor: colors.orange,
  },
  topCityInfo: {
    flex: 1,
  },
  topCityLabel: {
    color: colors.orange,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  topCityName: {
    color: colors.white,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 2,
  },
  topCityHint: {
    color: '#9f9f9f',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  changeCityBtn: {
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,90,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,90,0,0.45)',
    paddingHorizontal: spacing(1.15),
    paddingVertical: spacing(0.8),
    borderRadius: 999,
  },
  changeCityText: {
    color: colors.orange,
    fontSize: 11,
    fontWeight: '900',
  },
  cardWrapper: {
    marginBottom: spacing(1.5),
    borderRadius: radii.large,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardBackground: {
    minHeight: 210,
  },
  cardImage: {
    borderRadius: radii.large,
  },
  cardOverlay: {
    flex: 1,
    minHeight: 210,
    padding: spacing(2),
    justifyContent: 'space-between',
  },
  cardTopRow: {
    minHeight: layout.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardBadges: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing(0.75),
    marginRight: spacing(1),
  },
  timeBadge: {
    paddingHorizontal: spacing(1.25),
    paddingVertical: spacing(0.65),
    borderRadius: radii.pill,
    backgroundColor: colors.orange,
  },
  timeBadgeText: {
    color: colors.black,
    ...typography.overline,
  },
  availabilityBadge: {
    paddingHorizontal: spacing(1.25),
    paddingVertical: spacing(0.65),
    borderRadius: radii.pill,
    backgroundColor: 'rgba(57,217,138,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(57,217,138,0.55)',
  },
  availabilityBadgeFull: {
    backgroundColor: 'rgba(255,92,92,0.18)',
    borderColor: 'rgba(255,92,92,0.55)',
  },
  availabilityBadgeText: {
    color: colors.white,
    ...typography.overline,
  },
  recommendedBadge: {
    paddingHorizontal: spacing(1),
    paddingVertical: spacing(0.65),
    borderRadius: radii.pill,
    backgroundColor: 'rgba(8,10,14,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,90,0,0.55)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  recommendedBadgeText: {
    color: colors.white,
    ...typography.overline,
  },
  cardArrow: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  cardArrowText: {
    color: colors.white,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '300',
    marginTop: -2,
  },
  title: {
    color: colors.white,
    ...typography.heading,
  },
  meta: {
    color: colors.textMuted,
    ...typography.body,
    marginTop: spacing(0.5),
  },
  reserveText: {
    color: colors.orange,
    ...typography.overline,
    marginTop: spacing(1.25),
  },
  loadingText: {
    color: colors.gray,
    marginTop: spacing(1),
  },
  emptyTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing(1),
  },
  emptyText: {
    color: '#aaa',
    textAlign: 'center',
    fontSize: 14,
  },
  recommendationsBlock: {
    marginTop: spacing(0.5),
    marginBottom: spacing(1.25),
    padding: spacing(1.5),
    borderRadius: radii.large,
    backgroundColor: 'rgba(17,21,27,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  recommendationsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(1.2),
  },
  recommendationsTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  recommendationsIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,90,0,0.12)',
    marginRight: spacing(1),
  },
  recommendationsTitleText: { flex: 1 },
  recommendationsEyebrow: { color: colors.orange, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  recommendationsTitle: { color: colors.white, fontSize: 18, fontWeight: '900', marginTop: 2 },
  preferencesButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  recommendationsSetup: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing(1.25),
    borderRadius: radii.medium,
    backgroundColor: 'rgba(255,90,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,90,0,0.24)',
  },
  recommendationsSetupCopy: { flex: 1, paddingRight: spacing(1) },
  recommendationsSetupTitle: { color: colors.white, fontSize: 14, fontWeight: '900' },
  recommendationsSetupText: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  recommendationRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(0.9),
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  recommendationScore: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,90,0,0.12)',
    marginRight: spacing(1),
  },
  recommendationScoreValue: { color: colors.orange, fontSize: 17, fontWeight: '900' },
  recommendationScoreLabel: { color: '#8f6955', fontSize: 7, fontWeight: '900' },
  recommendationCopy: { flex: 1, paddingRight: spacing(0.5) },
  recommendationName: { color: colors.white, fontSize: 13, fontWeight: '900' },
  recommendationMeta: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginTop: 4, textTransform: 'capitalize' },
  recommendationReasons: { color: '#c47a51', fontSize: 9, marginTop: 4 },
  recommendationsEmpty: { paddingVertical: spacing(1), paddingHorizontal: spacing(0.25) },
  recommendationsEmptyTitle: { color: colors.white, fontSize: 13, fontWeight: '800' },
  recommendationsEmptyText: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 },
});
