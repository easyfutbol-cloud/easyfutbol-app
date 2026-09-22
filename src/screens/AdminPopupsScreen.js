import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image, Switch, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { resolvePopupImage } from '../components/AppPopupHost';

export const FREQUENCY_LABELS = {
  once: 'Una vez por jugador',
  daily: 'Una vez al día',
  always: 'Cada vez que abre la app',
};

const LOCATION_NAMES = { valladolid: 'Valladolid', asturias: 'Asturias' };

function formatAudience(value) {
  if (!value) return 'Todas las sedes';
  return String(value).split(',').map((slug) => LOCATION_NAMES[slug] || slug).join(' + ');
}

function getStatus(popup) {
  if (popup.ends_at && new Date(popup.ends_at).getTime() <= Date.now()) return { label: 'Caducado', color: '#888' };
  if (!popup.is_active) return { label: 'Pausado', color: '#e0a800' };
  return { label: 'Activo', color: '#39D98A' };
}

function formatEnds(value) {
  if (!value) return 'Sin caducidad';
  return `Hasta el ${new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
}

export default function AdminPopupsScreen({ navigation }) {
  const [popups, setPopups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const fetchPopups = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      const res = await api.get('/admin/popups');
      setPopups(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudieron cargar los popups');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchPopups(); }, [fetchPopups]));

  const toggleActive = async (popup, value) => {
    try {
      setTogglingId(popup.id);
      const res = await api.put(`/admin/popups/${popup.id}`, { is_active: value });
      setPopups((prev) => prev.map((p) => (p.id === popup.id ? res.data.data : p)));
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo cambiar el estado');
    } finally {
      setTogglingId(null);
    }
  };

  const renderItem = ({ item }) => {
    const status = getStatus(item);
    const imageUri = resolvePopupImage(item.image_url);
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => navigation.navigate('AdminPopupEdit', { popupId: item.id })}>
        <View style={styles.cardTop}>
          {imageUri ? <Image source={{ uri: imageUri }} style={styles.thumb} /> : (
            <View style={[styles.thumb, styles.thumbEmpty]}><Ionicons name="chatbox-ellipses-outline" size={22} color="#666" /></View>
          )}
          <View style={styles.cardCopy}>
            <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: status.color }]} />
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
              <Text style={styles.metaText}> · {formatEnds(item.ends_at)}</Text>
            </View>
          </View>
          <Switch
            value={!!item.is_active}
            onValueChange={(value) => toggleActive(item, value)}
            disabled={togglingId === item.id}
            trackColor={{ false: '#333', true: '#ff5a00' }}
          />
        </View>
        <View style={styles.cardBottom}>
          <Text style={styles.metaText}>{formatAudience(item.audience_locations)} · {FREQUENCY_LABELS[item.frequency]}</Text>
          <Text style={styles.metaText}>👁 {item.viewers} · 👆 {item.clickers}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ff5a00" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={popups}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchPopups(true)} tintColor="#ff5a00" />}
        ListHeaderComponent={(
          <View>
            <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={18} color="#ccc" />
              <Text style={styles.backText}>Volver</Text>
            </TouchableOpacity>
            <Text style={styles.screenTitle}>Popups</Text>
            <Text style={styles.screenSubtitle}>Avisos que ven los jugadores al abrir la app.</Text>
            <TouchableOpacity style={styles.newButton} onPress={() => navigation.navigate('AdminPopupEdit')}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.newButtonText}>Crear popup</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Todavía no has creado ningún popup.</Text>}
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
  card: { backgroundColor: '#141414', borderRadius: 16, borderWidth: 1, borderColor: '#262626', padding: 12, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#1a1a1a' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1 },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  statusText: { fontSize: 11, fontWeight: '800' },
  metaText: { color: '#888', fontSize: 11 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#222' },
  empty: { color: '#777', textAlign: 'center', marginTop: 30, fontSize: 13 },
});
