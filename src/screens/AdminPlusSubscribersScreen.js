import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { colors, layout, radii, spacing, typography } from '../theme';
import ScreenHeader from '../components/ScreenHeader';

const GOLD = '#F4C95D';
const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'paid', label: 'De pago' },
  { key: 'gift', label: 'Regalo' },
];

const shortDate = (value) => (value ? new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

function periodLabel(subscriber) {
  const end = shortDate(subscriber.current_period_end);
  if (!end) return 'Sin fecha de fin';
  if (subscriber.type === 'gift') return `Regalo hasta el ${end}`;
  return subscriber.cancel_at_period_end ? `Cancelado · activo hasta el ${end}` : `Renueva el ${end}`;
}

export default function AdminPlusSubscribersScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      const response = await api.get('/plus/admin/subscribers');
      setData(response.data?.data || null);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || 'No se pudieron cargar los suscriptores Plus.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !data) return <View style={styles.center}><ActivityIndicator size="large" color={GOLD} /></View>;

  const needle = query.trim().toLowerCase();
  const subscribers = (data?.subscribers || []).filter((row) =>
    (filter === 'all' || row.type === filter)
    && (!needle || `${row.name} ${row.email} ${row.id}`.toLowerCase().includes(needle))
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={GOLD} />}
    >
      <ScreenHeader eyebrow="ADMIN · PLUS" title="Suscriptores Plus" description="Jugadores con EasyFutbol Plus activo ahora mismo, de pago o regalado." />

      <View style={styles.totals}>
        <View style={styles.total}><Text style={styles.totalValue}>{data?.total ?? 0}</Text><Text style={styles.totalLabel}>Activos</Text></View>
        <View style={styles.total}><Text style={[styles.totalValue, { color: '#55D68B' }]}>{data?.paid ?? 0}</Text><Text style={styles.totalLabel}>De pago</Text></View>
        <View style={styles.total}><Text style={[styles.totalValue, { color: GOLD }]}>{data?.gift ?? 0}</Text><Text style={styles.totalLabel}>Regalo</Text></View>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((item) => (
          <TouchableOpacity key={item.key} style={[styles.filter, filter === item.key && styles.filterActive]} onPress={() => setFilter(item.key)} accessibilityRole="button" accessibilityState={{ selected: filter === item.key }}>
            <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={17} color={colors.textSubtle} />
        <TextInput style={styles.searchInput} placeholder="Buscar por nombre, email o ID" placeholderTextColor={colors.textSubtle} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} />
      </View>

      {subscribers.map((row) => (
        <View key={row.id} style={styles.row}>
          <View style={[styles.avatar, row.type === 'gift' && styles.avatarGift]}>
            <Text style={styles.avatarText}>{String(row.name || '?').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowName} numberOfLines={1}>{row.name} <Text style={styles.rowId}>#{row.id}</Text></Text>
            <Text style={styles.rowEmail} numberOfLines={1}>{row.email}</Text>
            <Text style={styles.rowPeriod}>{periodLabel(row)}</Text>
          </View>
          <View style={[styles.badge, row.type === 'gift' ? styles.badgeGift : styles.badgePaid]}>
            <Text style={[styles.badgeText, { color: row.type === 'gift' ? GOLD : '#55D68B' }]}>{row.type === 'gift' ? 'REGALO' : 'PAGO'}</Text>
          </View>
        </View>
      ))}

      {!subscribers.length && (
        <Text style={styles.empty}>{data?.total ? 'Nadie coincide con ese filtro.' : 'Ahora mismo nadie tiene Plus activo.'}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', padding: layout.screenPadding, paddingBottom: spacing(6) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  totals: { flexDirection: 'row', gap: 8 },
  total: { flex: 1, backgroundColor: colors.surface, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, paddingVertical: 14, alignItems: 'center' },
  totalValue: { color: colors.white, fontSize: 26, fontWeight: '900' },
  totalLabel: { color: colors.textSubtle, ...typography.caption, marginTop: 2 },
  filters: { flexDirection: 'row', gap: 8, marginTop: spacing(1.5) },
  filter: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, borderColor: colors.border },
  filterActive: { borderColor: GOLD, backgroundColor: 'rgba(244,201,93,.10)' },
  filterText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  filterTextActive: { color: GOLD },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1A1D22', borderWidth: 1, borderColor: colors.border, borderRadius: radii.small, paddingHorizontal: 12, marginTop: spacing(1), marginBottom: spacing(1.5) },
  searchInput: { flex: 1, color: colors.white, paddingVertical: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, padding: spacing(1.25), marginBottom: spacing(1) },
  avatar: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(85,214,139,.14)', alignItems: 'center', justifyContent: 'center' },
  avatarGift: { backgroundColor: 'rgba(244,201,93,.14)' },
  avatarText: { color: colors.white, fontWeight: '900' },
  rowCopy: { flex: 1 },
  rowName: { color: colors.white, ...typography.bodyStrong },
  rowId: { color: colors.textSubtle, fontSize: 11, fontWeight: '700' },
  rowEmail: { color: colors.textMuted, ...typography.caption, marginTop: 2 },
  rowPeriod: { color: colors.textSubtle, fontSize: 11, fontWeight: '700', marginTop: 4 },
  badge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  badgePaid: { borderColor: 'rgba(85,214,139,.4)' },
  badgeGift: { borderColor: 'rgba(244,201,93,.4)' },
  badgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  empty: { color: colors.textMuted, textAlign: 'center', backgroundColor: colors.surface, padding: spacing(2), borderRadius: radii.medium },
});
