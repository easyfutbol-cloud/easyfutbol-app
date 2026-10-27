import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';

const PUBLIC_BASE = String(api?.defaults?.baseURL || '').replace(/\/api\/?$/, '');

export function resolveOrganizerPhoto(photoUrl) {
  if (!photoUrl) return null;
  if (/^(https?|file|content):\/\//i.test(photoUrl)) return photoUrl;
  return `${PUBLIC_BASE}${photoUrl}`;
}

// Personas que aparecen en "Organizado por" dentro de cada partido.
export default function AdminOrganizersScreen({ navigation }) {
  const [organizers, setOrganizers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError('');
      const res = await api.get('/admin/organizers', { params: { include_inactive: 1 } });
      setOrganizers(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (e) {
      setError(e?.response?.data?.msg || e.message || 'No se pudieron cargar los organizadores');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }) => {
    const photo = resolveOrganizerPhoto(item.photo_url);
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => navigation.navigate('AdminOrganizerEdit', { organizerId: item.id })}>
        {photo ? <Image source={{ uri: photo }} style={styles.avatar} /> : (
          <View style={[styles.avatar, styles.avatarEmpty]}><Ionicons name="person" size={24} color="#555" /></View>
        )}
        <View style={styles.cardBody}>
          <Text style={styles.name} numberOfLines={1}>{item.first_name} {item.last_name}</Text>
          <Text style={[styles.meta, !item.is_active && styles.inactive]}>{item.is_active ? (photo ? 'Activo' : 'Activo · sin foto') : 'Desactivado'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#666" />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#ff5a00" /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={organizers}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#ff5a00" />}
        ListHeaderComponent={(
          <View>
            <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={18} color="#ccc" />
              <Text style={styles.backText}>Volver</Text>
            </TouchableOpacity>
            <Text style={styles.screenTitle}>Organizadores</Text>
            <Text style={styles.screenSubtitle}>Aparecen en "Organizado por" dentro de cada partido, con su nombre y su foto.</Text>
            <TouchableOpacity style={styles.newButton} onPress={() => navigation.navigate('AdminOrganizerEdit')}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.newButtonText}>Añadir organizador</Text>
            </TouchableOpacity>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        )}
        ListEmptyComponent={!error ? <Text style={styles.empty}>Todavía no hay organizadores.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  backText: { color: '#ccc', fontSize: 13, fontWeight: '700' },
  screenTitle: { color: '#fff', fontSize: 24, fontWeight: '900' },
  screenSubtitle: { color: '#999', fontSize: 13, marginTop: 4, marginBottom: 16 },
  newButton: { height: 50, borderRadius: 14, backgroundColor: '#ff5a00', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 18 },
  newButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  error: { color: '#ff6b6b', marginBottom: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#141414', borderRadius: 16, borderWidth: 1, borderColor: '#262626', padding: 12, marginBottom: 10 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1a1a1a' },
  avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  name: { color: '#fff', fontSize: 16, fontWeight: '800' },
  meta: { color: '#9c9c9c', fontSize: 12, marginTop: 2 },
  inactive: { color: '#ff9c9c' },
  empty: { color: '#888', textAlign: 'center', marginTop: 30 },
});
