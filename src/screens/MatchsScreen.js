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
  ScrollView,
} from 'react-native';
import api from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing } from '../theme';

const STORAGE_CITY_KEY = 'ef_selected_city';
const FALLBACK_CITIES = ['Valladolid', 'Avilés'];

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

export default function MatchsScreen({ navigation }) {
  const [matches, setMatches] = useState([]);
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

  const loadMatches = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await api.get('/matches', { params: { only_open: 1 } });
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

    const handlePress = () => {
      navigation.navigate('Match', { matchId: item.id });
    };

    return (
      <TouchableOpacity style={styles.cardWrapper} activeOpacity={0.9} onPress={handlePress}>
        <ImageBackground
          source={cardImage}
          defaultSource={cardImage}
          style={styles.cardBackground}
          imageStyle={styles.cardImage}
        >
          <View style={styles.cardOverlay}>
            <Text style={styles.title}>{item.title}</Text>

            {!!timeLabel && <Text style={styles.meta}>{timeLabel}</Text>}

            {(fieldName || city) && (
              <Text style={styles.meta}>
                {fieldName}
                {fieldName && city ? ' · ' : ''}
                {city}
              </Text>
            )}

            <View style={styles.ctaRow}>
              <TouchableOpacity style={styles.ctaButton} onPress={handlePress}>
                <Text style={styles.ctaText}>Reservar ahora</Text>
              </TouchableOpacity>
            </View>
          </View>
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

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.orange} />
          <Text style={styles.loadingText}>Cargando partidos…</Text>
        </View>
      </View>
    );
  }

  if (!loading && initialCityLoaded && (!selectedCity || citySelectorOpen)) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.citySelectorFull}>
          <Text style={styles.citySelectorEyebrow}>EasyFutbol</Text>
          <Text style={styles.citySelectorTitle}>¿Dónde quieres jugar?</Text>
          <Text style={styles.citySelectorText}>
            Elige una ciudad para ver su calendario de partidos. La guardaremos como predeterminada y podrás cambiarla cuando quieras.
          </Text>

          <View style={styles.citySelectorGrid}>
            {availableCities.map((c) => {
              const active = c === selectedCity;
              return (
                <TouchableOpacity
                  key={c}
                  activeOpacity={0.86}
                  onPress={() => changeCity(c)}
                  style={[styles.citySelectorCard, active && styles.citySelectorCardActive]}
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
      </View>
    );
  }

  if (!loading && selectedCity && filteredMatches.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topCityHeader}>
        <View style={styles.topCityAccent} />
        <View style={styles.topCityInfo}>
          <Text style={styles.topCityLabel}>Calendario de partidos</Text>
          <Text style={styles.topCityName}>{selectedCity}</Text>
          <Text style={styles.topCityHint}>Partidos disponibles por fecha</Text>
        </View>
        <TouchableOpacity style={styles.changeCityBtn} onPress={() => setCitySelectorOpen(true)} activeOpacity={0.85}>
          <Text style={styles.changeCityText}>Cambiar ciudad</Text>
        </TouchableOpacity>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingVertical: spacing(1) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.orange}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
    paddingHorizontal: spacing(2),
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
    borderRadius: 14,
    backgroundColor: '#121212',
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
    color: '#bdbdbd',
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
    color: '#999',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  citySelectorFull: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing(1),
  },
  citySelectorEyebrow: {
    color: colors.orange,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing(0.75),
  },
  citySelectorTitle: {
    color: colors.white,
    fontSize: 31,
    fontWeight: '900',
    marginBottom: spacing(1),
  },
  citySelectorText: {
    color: '#bdbdbd',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    marginBottom: spacing(2),
  },
  citySelectorGrid: {
    gap: spacing(1.2),
  },
  citySelectorCard: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#252525',
    borderRadius: 20,
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
    marginTop: spacing(1),
    marginBottom: spacing(1.25),
    backgroundColor: '#0f0f0f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: spacing(1.4),
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
    marginBottom: spacing(1.25),
    borderRadius: 18,
    overflow: 'hidden',
  },
  cardBackground: {
    height: 140,
    justifyContent: 'flex-end',
  },
  cardImage: {
    borderRadius: 18,
    opacity: 0.38,
  },
  cardOverlay: {
    flex: 1,
    paddingHorizontal: spacing(1.8),
    paddingVertical: spacing(1.4),
    justifyContent: 'space-between',
  },
  title: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  meta: {
    color: '#f0f0f0',
    fontSize: 13,
  },
  ctaRow: {
    marginTop: spacing(1.5),
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  ctaButton: {
    backgroundColor: colors.orange,
    paddingHorizontal: spacing(1.6),
    paddingVertical: spacing(0.7),
    borderRadius: 999,
  },
  ctaText: {
    color: colors.black,
    fontWeight: '700',
    fontSize: 14,
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
});