// src/screens/StatsScreen.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar, FlatList, TouchableOpacity, ImageBackground, ActivityIndicator, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, layout, radii, spacing, typography } from '../theme';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';

const ORANGE = '#ff5a00';
const DEFAULT_PLAYER_AVATAR = 'https://easyfutbol.es/wp-content/uploads/2026/05/Diseno-sin-titulo-7.png';
function buildAvatarUrl(rawAvatar) {
  if (!rawAvatar) return DEFAULT_PLAYER_AVATAR;

  const value = String(rawAvatar).trim();
  if (!value) return DEFAULT_PLAYER_AVATAR;

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const apiBase = (api?.defaults?.baseURL || '').replace(/\/+$/, '');
  const assetBase = apiBase.replace(/\/api$/, '');

  if (value.startsWith('/')) {
    return assetBase ? `${assetBase}${value}` : value;
  }

  return assetBase ? `${assetBase}/${value.replace(/^\/+/, '')}` : value;
}

const SCREEN_BACKGROUND = require('../../assets/matches/match-5.jpg');

const PERIODS = [
  { key: 'monthly', label: 'Mensual' },
  { key: 'quarterly', label: 'Trimestral' },
  { key: 'yearly', label: 'Anual' },
];

const LOCATIONS = [
  { key: 'national', label: 'Nacional', location_id: null },
  { key: 'valladolid', label: 'Valladolid', location_id: 1 },
  { key: 'asturias', label: 'Asturias', location_id: 2 },
];

export default function StatsScreen() {
  const [period, setPeriod] = useState('monthly');
  const [location, setLocation] = useState('national');
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const selectedLocation = useMemo(
    () => LOCATIONS.find(item => item.key === location) || LOCATIONS[0],
    [location]
  );

  const periodCaption = useMemo(() => {
    const month = referenceDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    if (period === 'monthly') return month.charAt(0).toUpperCase() + month.slice(1);
    if (period === 'quarterly') return `${Math.floor(referenceDate.getMonth() / 3) + 1}.º trimestre · ${referenceDate.getFullYear()}`;
    return String(referenceDate.getFullYear());
  }, [period, referenceDate]);

  const referenceParam = useMemo(() => {
    const year = referenceDate.getFullYear();
    const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-15`;
  }, [referenceDate]);

  const movePeriod = direction => {
    setReferenceDate(current => {
      const next = new Date(current.getFullYear(), current.getMonth(), 15);
      next.setMonth(next.getMonth() + direction * (period === 'quarterly' ? 3 : period === 'yearly' ? 12 : 1));
      return next;
    });
  };

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setItems([]);
    setError('');
    try {
      const params = { period, reference_date: referenceParam };

      if (selectedLocation.key !== 'national') {
        params.location_id = selectedLocation.location_id;
        params.location_slug = selectedLocation.key;
      }

      const r = await api.get('/stats/top-players', { params });
      const data = r.data?.data || [];
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setItems([]);
      setError('No se pudieron cargar las estadísticas.');
    } finally {
      setLoading(false);
    }
  }, [period, referenceParam, selectedLocation]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const renderRow = ({ item, index }) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
    const rawAvatar = item.avatar_url || item.avatarUrl || item.avatar || item.profile_image || item.photo || null;
    const avatar = buildAvatarUrl(rawAvatar);
    const displayName = item.username || item.name || 'Usuario';
    return (
      <View style={[styles.row, index < 3 && styles.rowPodium]} accessible accessibilityLabel={`Posición ${index + 1}, ${displayName}, ${item.goals ?? 0} goles, ${item.assists ?? 0} asistencias`}>
        <Text style={[styles.rank, index < 3 && styles.rankMedal]}>{medal}</Text>

        <Image source={{ uri: avatar || DEFAULT_PLAYER_AVATAR }} style={styles.avatar} resizeMode="cover" />

        <View style={{ flex: 1 }}>
          <Text style={[styles.name, item.is_plus && styles.plusName]} numberOfLines={1}>{displayName}{item.is_plus ? '  ★' : ''}</Text>
          <Text style={styles.meta}>
            {item.goals ?? 0} G · {item.assists ?? 0} A · {item.wins ?? 0} V
          </Text>
          <Text style={styles.locationMeta}>{selectedLocation.key === 'national' ? (item.locationName || item.location_name || 'EasyFutbol') : selectedLocation.label}</Text>
        </View>
        <View style={styles.totalWrap}>
          <Text style={styles.total}>{item.total ?? (item.goals ?? 0) + (item.assists ?? 0)}</Text>
          <Text style={styles.totalLabel}>Total</Text>
        </View>
      </View>
    );
  };

  const ListEmpty = () => (
    <View style={{ paddingVertical: spacing(6), alignItems: 'center' }}>
      <Text style={styles.empty}>Sin estadísticas</Text>
    </View>
  );

  const Pill = ({ active, label, onPress }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.pill, active && styles.pillActive]} accessibilityRole="radio" accessibilityState={{ selected: active }}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.flex1}>
      <StatusBar barStyle="light-content" />
      <ImageBackground source={SCREEN_BACKGROUND} style={styles.bg} resizeMode="cover" imageStyle={styles.backgroundImage}>
        <LinearGradient colors={['rgba(8,10,14,0.80)', 'rgba(8,10,14,0.98)']} style={StyleSheet.absoluteFill} />
        <View style={styles.safe}>
          <ScreenHeader
            eyebrow="RANKING EASYFUTBOL"
            title="Estadísticas"
            description="Compara el rendimiento de los jugadores por periodo y ciudad."
          />

          {/* Filtros compactos */}
          <View style={styles.controlsCard}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentRow}>
                {PERIODS.map(p => (
                  <Pill key={p.key} label={p.label} active={period === p.key} onPress={() => setPeriod(p.key)} />
                ))}
              <View style={styles.filterDivider} />
                {LOCATIONS.map(item => (
                  <Pill
                    key={item.key}
                    label={item.label}
                    active={location === item.key}
                    onPress={() => setLocation(item.key)}
                  />
                ))}
            </ScrollView>
            <View style={styles.dateNavigator}>
              <TouchableOpacity style={styles.arrowButton} onPress={() => movePeriod(-1)} accessibilityLabel="Periodo anterior">
                <Ionicons name="chevron-back" size={20} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.dateLabel}>{periodCaption}</Text>
              <TouchableOpacity style={styles.arrowButton} onPress={() => movePeriod(1)} accessibilityLabel="Periodo siguiente">
                <Ionicons name="chevron-forward" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.dynamicTitle}>Ranking · {selectedLocation.label}</Text>

          {/* Lista */}
          <View style={styles.listCard}>
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" />
                <Text style={styles.loadingTxt}>Cargando…</Text>
              </View>
            ) : error ? (
              <View style={styles.errorWrap}>
                <Text style={styles.errorTxt}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={fetchStats}>
                  <Text style={styles.retryTxt}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(it, i) => String(`${it.id ?? it.user_id ?? i}-${it.location_id ?? selectedLocation.location_id}`)}
                renderItem={renderRow}
                ListEmptyComponent={ListEmpty}
                contentContainerStyle={{ paddingVertical: spacing(1) }}
              />
            )}
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, backgroundColor: colors.background },
  bg: { flex: 1 },
  backgroundImage: { opacity: 0.58 },
  safe: { flex: 1, width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', paddingHorizontal: spacing(2), paddingTop: spacing(1) },

  controlsCard: {
    backgroundColor: 'rgba(17,21,27,0.92)',
    borderRadius: radii.large,
    paddingHorizontal: spacing(1),
    paddingVertical: spacing(0.8),
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing(1),
  },
  segmentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  filterDivider: { width: 1, height: 25, backgroundColor: 'rgba(255,255,255,0.18)', marginHorizontal: 2 },

  pill: {
    minHeight: 34,
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pillActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  pillText: { color: '#eaeaea', fontWeight: '700', fontSize: 12 },
  pillTextActive: { color: '#000', fontWeight: '800' },

  dateNavigator: { height: 38, marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12 },
  arrowButton: { width: 42, height: 38, alignItems: 'center', justifyContent: 'center' },
  dateLabel: { color: colors.white, fontSize: 13, fontWeight: '800', textTransform: 'capitalize' },

  dynamicTitle: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: spacing(0.7),
  },

  listCard: {
    flex: 1,
    backgroundColor: 'rgba(17,21,27,0.92)',
    borderRadius: radii.large,
    padding: spacing(1),
    borderWidth: 1,
    borderColor: colors.border,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing(1.5),
    borderRadius: radii.medium,
    marginBottom: spacing(1),
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPodium: { borderColor: 'rgba(255,90,0,0.42)', backgroundColor: 'rgba(255,90,0,0.08)' },
  rank: { color: ORANGE, fontSize: 16, fontWeight: '800', width: 36, textAlign: 'center' },
  rankMedal: { fontSize: 18 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: spacing(1.2),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#1a1a1a',
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginRight: spacing(1.2),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  avatarFallbackText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  name: { color: colors.white, fontSize: 16, fontWeight: '700' },
  plusName: { color: '#F4C95D' },
  meta: { color: '#b3b3b3', fontSize: 12, marginTop: 2 },
  locationMeta: { color: ORANGE, fontSize: 11, marginTop: 3, fontWeight: '800' },
  totalWrap: { alignItems: 'flex-end', minWidth: 60 },
  total: { color: colors.white, fontSize: 18, fontWeight: '800' },
  totalLabel: { color: '#9a9a9a', fontSize: 10 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing(6) },
  loadingTxt: { color: '#cfcfcf', marginTop: 8 },
  errorWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing(6) },
  errorTxt: { color: '#ffb4a9', marginBottom: spacing(1.5), textAlign: 'center' },
  retryBtn: {
    backgroundColor: ORANGE,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryTxt: { color: '#000', fontWeight: '800' },
});
