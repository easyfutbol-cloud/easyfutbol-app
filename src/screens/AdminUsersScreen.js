import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '../api/client';

const ORANGE = '#ff5a00';

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'valladolid', label: 'Valladolid' },
  { key: 'asturias', label: 'Asturias' },
  { key: 'undefined', label: 'Sin definir' },
];

const getLocationLabel = (location) => {
  const value = String(location || '').trim().toLowerCase();
  if (value === 'valladolid') return 'Valladolid';
  if (value === 'asturias') return 'Asturias';
  return 'Sin definir';
};

const getLocationBadgeStyle = (location) => {
  const value = String(location || '').trim().toLowerCase();
  if (value === 'valladolid') return styles.locationBadgeValladolid;
  if (value === 'asturias') return styles.locationBadgeAsturias;
  return styles.locationBadgeUndefined;
};

const normalizePhoneForWhatsApp = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('34') && digits.length >= 11) return digits;
  if (digits.length === 9) return `34${digits}`;

  return digits;
};

export default function AdminUsersScreen() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locationFilter, setLocationFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const cleanSearch = search.trim();

  const loadUsers = async ({ refresh = false } = {}) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      const params = {
        location: locationFilter,
      };

      if (cleanSearch) {
        params.search = cleanSearch;
      }

      const { data } = await api.get('/admin/users', { params });
      const rows = data?.data || data?.users || [];
      setUsers(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.log('Error cargando usuarios admin', e?.response?.data || e?.message || e);
      setError(e?.response?.data?.msg || 'No se pudieron cargar los usuarios.');
      setUsers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [locationFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadUsers();
    }, 350);

    return () => clearTimeout(timer);
  }, [search]);

  const totals = useMemo(() => {
    const total = users.length;
    const valladolid = users.filter((u) => String(u.preferred_location || u.preferredLocation || '').toLowerCase() === 'valladolid').length;
    const asturias = users.filter((u) => String(u.preferred_location || u.preferredLocation || '').toLowerCase() === 'asturias').length;
    const undefinedUsers = users.filter((u) => !u.preferred_location && !u.preferredLocation).length;

    return { total, valladolid, asturias, undefinedUsers };
  }, [users]);

  const openWhatsApp = async (phone) => {
    const normalizedPhone = normalizePhoneForWhatsApp(phone);
    if (!normalizedPhone) return;

    const url = `https://wa.me/${normalizedPhone}`;
    try {
      await Linking.openURL(url);
    } catch (e) {
      console.log('No se pudo abrir WhatsApp', e?.message || e);
    }
  };

  const renderUser = ({ item }) => {
    const location = item.preferred_location || item.preferredLocation || null;
    const locationLabel = getLocationLabel(location);
    const hasPhone = !!normalizePhoneForWhatsApp(item.phone);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.idPill}>
            <Text style={styles.idPillText}>ID {item.id}</Text>
          </View>
          <Text style={[styles.locationBadge, getLocationBadgeStyle(location)]}>{locationLabel}</Text>
        </View>

        <Text style={styles.name} numberOfLines={1}>{item.name || 'Usuario sin nombre'}</Text>

        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>Teléfono</Text>
          <Text style={styles.infoValue}>{item.phone || 'Sin teléfono'}</Text>
        </View>

        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>Email</Text>
          <Text style={styles.infoValue} numberOfLines={1}>{item.email || 'Sin email'}</Text>
        </View>

        <TouchableOpacity
          style={[styles.whatsappButton, !hasPhone && styles.whatsappButtonDisabled]}
          onPress={() => openWhatsApp(item.phone)}
          disabled={!hasPhone}
          activeOpacity={0.85}
        >
          <Text style={[styles.whatsappButtonText, !hasPhone && styles.whatsappButtonTextDisabled]}>
            Abrir WhatsApp
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Usuarios registrados</Text>
        <Text style={styles.subtitle}>Busca jugadores por ID, nombre, teléfono o email.</Text>

        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por ID, nombre o teléfono"
          placeholderTextColor="#777"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.filtersRow}>
          {FILTERS.map((filter) => {
            const active = locationFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                style={[styles.filterButton, active && styles.filterButtonActive]}
                onPress={() => setLocationFilter(filter.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{filter.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryText}>Mostrando: {totals.total}</Text>
          <Text style={styles.summaryMeta}>Valladolid {totals.valladolid} · Asturias {totals.asturias} · Sin definir {totals.undefinedUsers}</Text>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={ORANGE} size="large" />
            <Text style={styles.loadingText}>Cargando usuarios...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => loadUsers()} activeOpacity={0.85}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(item, index) => String(item.id ?? index)}
            renderItem={renderUser}
            contentContainerStyle={users.length ? styles.listContent : styles.emptyListContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadUsers({ refresh: true })}
                tintColor={ORANGE}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No hay usuarios</Text>
                <Text style={styles.emptyText}>Prueba con otro filtro o búsqueda.</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
  },
  subtitle: {
    color: '#aaa',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#252525',
    borderRadius: 14,
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontWeight: '700',
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  filterButtonActive: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  filterText: {
    color: '#ddd',
    fontSize: 12,
    fontWeight: '900',
  },
  filterTextActive: {
    color: '#000',
  },
  summaryCard: {
    marginTop: 14,
    marginBottom: 10,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(255,90,0,0.35)',
    borderRadius: 14,
    padding: 12,
  },
  summaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  summaryMeta: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#242424',
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  idPill: {
    backgroundColor: 'rgba(255,90,0,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,90,0,0.45)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  idPillText: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: '900',
  },
  locationBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
  },
  locationBadgeValladolid: {
    backgroundColor: '#fff',
    color: '#000',
  },
  locationBadgeAsturias: {
    backgroundColor: ORANGE,
    color: '#000',
  },
  locationBadgeUndefined: {
    backgroundColor: '#242424',
    color: '#aaa',
  },
  name: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 10,
  },
  infoBlock: {
    marginTop: 6,
  },
  infoLabel: {
    color: '#777',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  infoValue: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  whatsappButton: {
    marginTop: 12,
    backgroundColor: ORANGE,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  whatsappButtonDisabled: {
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#333',
  },
  whatsappButtonText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '900',
  },
  whatsappButtonTextDisabled: {
    color: '#777',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    color: '#aaa',
    marginTop: 10,
    fontWeight: '700',
  },
  errorText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: '800',
    marginBottom: 14,
  },
  retryButton: {
    backgroundColor: ORANGE,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: {
    color: '#000',
    fontWeight: '900',
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  emptyText: {
    color: '#aaa',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
});