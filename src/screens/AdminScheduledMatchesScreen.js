import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';

const ORANGE = '#ff5a00';

const formatDateTime = (value) => {
  const raw = String(value || '');
  const normalized = raw && !/[zZ]|[+-]\d\d:\d\d$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : raw;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return date.toLocaleString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function AdminScheduledMatchesScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  const load = useCallback(async (refresh = false) => {
    try {
      refresh ? setRefreshing(true) : setLoading(true);
      const { data } = await api.get('/admin/scheduled-matches');
      setItems(Array.isArray(data?.data) ? data.data : []);
    } catch (error) {
      Alert.alert('No se pudo cargar', error?.response?.data?.msg || 'Revisa la conexión e inténtalo de nuevo.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cancelItem = (item) => {
    Alert.alert(
      'Cancelar automatización',
      `“${item.title}” no se publicará automáticamente.`,
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Cancelar automatización',
          style: 'destructive',
          onPress: async () => {
            try {
              setCancellingId(item.id);
              await api.delete(`/admin/scheduled-matches/${item.id}`);
              setItems((current) => current.filter((entry) => entry.id !== item.id));
            } catch (error) {
              Alert.alert('No se pudo cancelar', error?.response?.data?.msg || 'Inténtalo de nuevo.');
            } finally {
              setCancellingId(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={ORANGE} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityLabel="Volver">
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ADMINISTRACIÓN</Text>
          <Text style={styles.screenTitle}>Partidos programados</Text>
          <Text style={styles.subtitle}>Se publicarán seis días antes, a las 16:00.</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('AdminCreateMatch')}>
        <Text style={styles.primaryButtonText}>Programar nuevos partidos</Text>
      </TouchableOpacity>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={items.length ? styles.list : styles.emptyList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={ORANGE} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <View style={styles.badge}><Text style={styles.badgeText}>PROGRAMADO</Text></View>
            </View>
            <Text style={styles.location}>{item.city} · {item.resolved_field_name || item.field_name}</Text>
            <View style={styles.timeline}>
              <View style={styles.timelineItem}>
                <Text style={styles.timelineLabel}>PUBLICACIÓN</Text>
                <Text style={styles.timelineValue}>{formatDateTime(item.publish_at)}</Text>
              </View>
              <View style={styles.line} />
              <View style={styles.timelineItem}>
                <Text style={styles.timelineLabel}>PARTIDO</Text>
                <Text style={styles.timelineValue}>{formatDateTime(item.starts_at)}</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.cancelButton}
              disabled={cancellingId === item.id}
              onPress={() => cancelItem(item)}
            >
              {cancellingId === item.id
                ? <ActivityIndicator color="#ff8c73" />
                : <Text style={styles.cancelText}>Cancelar automatización</Text>}
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>◷</Text>
            <Text style={styles.emptyTitle}>No hay partidos pendientes</Text>
            <Text style={styles.emptyText}>Crea un lote y EasyFutbol se encargará de publicarlo en el momento indicado.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080808', paddingHorizontal: 16 },
  center: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: 10, marginBottom: 18 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#171717', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  backText: { color: '#fff', fontSize: 35, lineHeight: 37, marginTop: -3 },
  headerCopy: { flex: 1 },
  eyebrow: { color: ORANGE, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, marginBottom: 3 },
  screenTitle: { color: '#fff', fontSize: 27, fontWeight: '900' },
  subtitle: { color: '#989898', fontSize: 13, lineHeight: 18, marginTop: 5 },
  primaryButton: { backgroundColor: ORANGE, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  list: { paddingBottom: 36 },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingBottom: 90 },
  card: { backgroundColor: '#121212', borderRadius: 20, borderWidth: 1, borderColor: '#242424', padding: 16, marginBottom: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { flex: 1, color: '#fff', fontSize: 18, lineHeight: 23, fontWeight: '900' },
  badge: { backgroundColor: 'rgba(255,90,0,0.14)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  badgeText: { color: '#ff8747', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  location: { color: '#aaa', fontSize: 13, marginTop: 7 },
  timeline: { backgroundColor: '#191919', borderRadius: 14, padding: 13, marginTop: 15 },
  timelineItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  timelineLabel: { color: '#777', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  timelineValue: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'right' },
  line: { height: 1, backgroundColor: '#292929', marginVertical: 10 },
  cancelButton: { borderWidth: 1, borderColor: '#642b21', borderRadius: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 13 },
  cancelText: { color: '#ff8c73', fontWeight: '800' },
  emptyCard: { alignItems: 'center', backgroundColor: '#111', borderRadius: 22, borderWidth: 1, borderColor: '#222', padding: 28 },
  emptyIcon: { color: ORANGE, fontSize: 40, marginBottom: 10 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 7 },
  emptyText: { color: '#999', fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
