// src/screens/StatsScreen.js
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, StatusBar, FlatList, TouchableOpacity, ImageBackground, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';
import { api } from '../api/client';

const ORANGE = '#ff5a00';

// Imágenes de fondo de fútbol
const BG_IMAGES = [
  {
    uri: 'https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?q=80&w=1600&auto=format&fit=crop',
  },
  {
    uri: 'https://images.unsplash.com/photo-1518091043644-c1f4fa6bda4c?q=80&w=1600&auto=format&fit=crop',
  },
  {
    uri: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=1600&auto=format&fit=crop',
  },
];

const PERIODS = [
  { key: 'monthly', label: 'Mensual' },
  { key: 'quarterly', label: 'Trimestral' },
  { key: 'yearly', label: 'Anual' },
];

const SCOPES = [
  { key: 'provincial', label: 'Provincial' },
  { key: 'national', label: 'Nacional' },
];

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState('monthly');
  const [scope, setScope] = useState('provincial');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bgIndex, setBgIndex] = useState(0);
  const [error, setError] = useState('');

  const title = useMemo(() => {
    const p = PERIODS.find(p => p.key === period)?.label || '';
    const s = SCOPES.find(s => s.key === scope)?.label || '';
    return `🏆 Goleadores ${p} · ${s}`;
  }, [period, scope]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Ajusta a tus endpoints/params reales:
      // Ejemplo: /stats/top-players?period=monthly&scope=provincial
      const r = await api.get('/stats/top-players', { params: { period, scope } });
      const data = r.data?.data || [];
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setItems([]);
      setError('No se pudieron cargar las estadísticas.');
    } finally {
      setLoading(false);
    }
  }, [period, scope]);

  useEffect(() => {
    fetchStats();
    setBgIndex(prev => (prev + 1) % BG_IMAGES.length); // cambia sutilmente el fondo al cambiar filtros
  }, [fetchStats]);

  const renderRow = ({ item, index }) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
    return (
      <View style={styles.row}>
        <Text style={[styles.rank, index < 3 && styles.rankMedal]}>{medal}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{item.username || item.name}</Text>
          <Text style={styles.meta}>{item.goals ?? 0} G · {item.assists ?? 0} A</Text>
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
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.flex1}>
      <StatusBar barStyle="light-content" />
      <ImageBackground source={BG_IMAGES[bgIndex]} style={styles.bg} resizeMode="cover">
        {/* Capa oscura + blur para legibilidad */}
        <View style={styles.overlay} />
        <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
        <SafeAreaView style={[styles.safe, { paddingTop: insets.top || 12 }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.screenTitle}>Estadísticas</Text>
            <Text style={styles.subtitle}>Top goleadores por periodo y ámbito</Text>
          </View>

          {/* Controles */}
          <View style={styles.controlsCard}>
            <View style={styles.segmentBlock}>
              <Text style={styles.segmentLabel}>Periodo</Text>
              <View style={styles.segmentRow}>
                {PERIODS.map(p => (
                  <Pill key={p.key} label={p.label} active={period === p.key} onPress={() => setPeriod(p.key)} />
                ))}
              </View>
            </View>

            <View style={styles.segmentBlock}>
              <Text style={styles.segmentLabel}>Ámbito</Text>
              <View style={styles.segmentRow}>
                {SCOPES.map(s => (
                  <Pill key={s.key} label={s.label} active={scope === s.key} onPress={() => setScope(s.key)} />
                ))}
              </View>
            </View>
          </View>

          {/* Título dinámico */}
          <Text style={styles.dynamicTitle}>{title}</Text>

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
                keyExtractor={(it, i) => String(it.id ?? `${period}-${scope}-${i}`)}
                renderItem={renderRow}
                ListEmptyComponent={ListEmpty}
                contentContainerStyle={{ paddingVertical: spacing(1) }}
              />
            )}
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, backgroundColor: colors.black },
  bg: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  safe: { flex: 1, paddingHorizontal: spacing(2) },

  header: { marginBottom: spacing(2) },
  screenTitle: { color: colors.white, fontSize: 26, fontWeight: '800', textAlign: 'left' },
  subtitle: { color: '#cfcfcf', marginTop: 4 },

  controlsCard: {
    backgroundColor: 'rgba(17,17,17,0.75)',
    borderRadius: 16,
    padding: spacing(2),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: spacing(2),
  },
  segmentBlock: { marginBottom: spacing(1.5) },
  segmentLabel: { color: '#ddd', marginBottom: spacing(1), fontWeight: '600' },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pillActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  pillText: { color: '#eaeaea', fontWeight: '600' },
  pillTextActive: { color: '#000', fontWeight: '800' },

  dynamicTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: spacing(1),
  },

  listCard: {
    flex: 1,
    backgroundColor: 'rgba(17,17,17,0.8)',
    borderRadius: 16,
    padding: spacing(1),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f0f10',
    padding: spacing(1.5),
    borderRadius: 12,
    marginBottom: spacing(1),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  rank: { color: ORANGE, fontSize: 16, fontWeight: '800', width: 36, textAlign: 'center' },
  rankMedal: { fontSize: 18 },
  name: { color: colors.white, fontSize: 16, fontWeight: '700' },
  meta: { color: '#b3b3b3', fontSize: 12, marginTop: 2 },
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
