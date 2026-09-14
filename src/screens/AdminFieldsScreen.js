import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';

const PUBLIC_BASE = String(api?.defaults?.baseURL || '').replace(/\/api\/?$/, '');

function resolveImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return `${PUBLIC_BASE}${imageUrl}`;
}

export default function AdminFieldsScreen({ navigation }) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchFields = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      setError('');

      const res = await api.get('/admin/fields', { params: { include_inactive: 1 } });
      setFields(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (e) {
      setError(e?.response?.data?.msg || e.message || 'No se pudieron cargar los campos');
      setFields([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchFields();
    }, [fetchFields])
  );

  const handleCreatePress = () => navigation.navigate('AdminFieldEdit');
  const handleEditPress = (field) => navigation.navigate('AdminFieldEdit', { fieldId: field.id });

  const renderFieldCard = ({ item }) => {
    const imageUri = resolveImageUrl(item.image_url);

    return (
      <TouchableOpacity activeOpacity={0.9} style={styles.card} onPress={() => handleEditPress(item)}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Text style={styles.thumbPlaceholderText}>Sin foto</Text>
          </View>
        )}

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <Text style={styles.title} numberOfLines={1}>{item.name}</Text>
            {!item.is_active ? (
              <View style={styles.inactiveBadge}>
                <Text style={styles.inactiveBadgeText}>Inactivo</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.metaText}>{item.city}</Text>
          <Text style={styles.metaText} numberOfLines={1}>{item.address || 'Sin dirección'}</Text>
          <Text style={styles.editHint}>Editar campo →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#ff5a00" />
        <Text style={styles.loadingText}>Cargando campos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <Text style={styles.screenTitle}>Campos</Text>
        <Text style={styles.screenSubtitle}>
          Gestiona la foto, la ubicación y las indicaciones de llegada de cada campo.
        </Text>

        <TouchableOpacity style={styles.createButton} onPress={handleCreatePress}>
          <Text style={styles.createButtonText}>+ Añadir campo</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchFields()}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={fields}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderFieldCard}
        contentContainerStyle={fields.length === 0 ? styles.emptyListContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchFields(true)} tintColor="#ff5a00" />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No hay campos todavía</Text>
            <Text style={styles.emptySubtitle}>
              Añade el primer campo para que aparezca al crear partidos.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingHorizontal: 16, paddingTop: 18 },
  centeredContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  loadingText: { marginTop: 12, color: '#fff', fontSize: 16 },
  topSection: { marginBottom: 18 },
  screenTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 6 },
  screenSubtitle: { color: '#b3b3b3', fontSize: 14, lineHeight: 21, marginBottom: 16 },
  createButton: { backgroundColor: '#ff5a00', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  createButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  errorBox: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#ff5a00', borderRadius: 14, padding: 14, marginBottom: 16 },
  errorText: { color: '#fff', fontSize: 14, marginBottom: 10 },
  retryButton: { alignSelf: 'flex-start', backgroundColor: '#ff5a00', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  retryButtonText: { color: '#fff', fontWeight: '700' },
  listContent: { paddingBottom: 24 },
  emptyListContainer: { flexGrow: 1, justifyContent: 'center', paddingBottom: 40 },
  emptyState: { backgroundColor: '#111', borderRadius: 18, padding: 24, borderWidth: 1, borderColor: '#1f1f1f', alignItems: 'center' },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { color: '#9c9c9c', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card: { flexDirection: 'row', backgroundColor: '#111', borderRadius: 18, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#222' },
  thumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: '#181818' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#252525' },
  thumbPlaceholderText: { color: '#666', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  cardBody: { flex: 1, marginLeft: 14, justifyContent: 'center' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '800' },
  inactiveBadge: { backgroundColor: 'rgba(255,92,92,0.16)', borderWidth: 1, borderColor: '#ff5c5c', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  inactiveBadgeText: { color: '#ff9c9c', fontSize: 10, fontWeight: '800' },
  metaText: { color: '#c2c2c2', fontSize: 13, marginBottom: 2 },
  editHint: { color: '#ff8c4d', fontSize: 12, fontWeight: '700', marginTop: 6 },
});
