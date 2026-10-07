import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Switch, Alert, Modal, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import { resolveSocialAvatarUrl } from '../components/social/SocialComponents';

const BASE = String(api?.defaults?.baseURL || '').replace(/\/+$/, '');

const STAT_OPTIONS = [
  { key: 'goals', label: 'Goles', icon: 'football-outline' },
  { key: 'assists', label: 'Asistencias', icon: 'git-merge-outline' },
  { key: 'saves', label: 'Paradas', icon: 'hand-left-outline' },
  { key: 'mvp_count', label: 'Veces MVP', icon: 'star-outline' },
  { key: 'matches_played', label: 'Partidos jugados', icon: 'calendar-outline' },
  { key: 'win_rate', label: '% de victorias', icon: 'trophy-outline' },
];

async function getAuthHeader() {
  const raw = await AsyncStorage.getItem('token');
  let token = raw;
  try { const parsed = JSON.parse(raw || 'null'); token = parsed?.access_token || parsed?.token || raw; } catch {}
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function MyPublicProfileScreen({ navigation }) {
  const [myId, setMyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [bannerUrl, setBannerUrl] = useState(null);
  const [allStats, setAllStats] = useState(null);
  const [visibleStats, setVisibleStats] = useState([]);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [photos, setPhotos] = useState([]);

  const [matchPickerVisible, setMatchPickerVisible] = useState(false);
  const [myMatches, setMyMatches] = useState(null);
  const [pendingPhotoUri, setPendingPhotoUri] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const storedUser = await AsyncStorage.getItem('user');
      const user = storedUser ? JSON.parse(storedUser) : null;
      if (!user?.id) throw new Error('Sesión no válida');
      setMyId(user.id);

      const res = await api.get(`/player-profile/${user.id}`);
      const d = res.data;
      setBannerUrl(d.user?.banner_url || null);
      setAllStats(d.all_stats || null);
      setVisibleStats(d.visible_stats || []);
      setCommentsEnabled(Boolean(d.comments_enabled));
      setPhotos(d.photos || []);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo cargar tu perfil');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveSettings = async (nextVisibleStats, nextCommentsEnabled) => {
    try {
      setSaving(true);
      await api.patch('/player-profile/me/settings', { visible_stats: nextVisibleStats, comments_enabled: nextCommentsEnabled });
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const toggleStat = (key) => {
    const next = visibleStats.includes(key) ? visibleStats.filter((k) => k !== key) : [...visibleStats, key];
    setVisibleStats(next);
    saveSettings(next, commentsEnabled);
  };

  const toggleComments = (value) => {
    setCommentsEnabled(value);
    saveSettings(visibleStats, value);
  };

  const pickBanner = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });
      if (result.canceled) return;

      setUploadingBanner(true);
      const headers = await getAuthHeader();
      const formData = new FormData();
      formData.append('banner', { uri: result.assets[0].uri, type: 'image/jpeg', name: 'banner.jpg' });

      const res = await fetch(`${BASE}/player-profile/me/banner`, { method: 'POST', headers, body: formData });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setBannerUrl(json.banner_url);
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo subir la portada');
    } finally {
      setUploadingBanner(false);
    }
  };

  const removeBanner = () => Alert.alert('Quitar portada', '¿Seguro que quieres quitarla?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Quitar', style: 'destructive', onPress: async () => {
      try {
        await api.delete('/player-profile/me/banner');
        setBannerUrl(null);
      } catch (e) { Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo quitar'); }
    } },
  ]);

  const openMatchPicker = async (localUri) => {
    setPendingPhotoUri(localUri);
    setMatchPickerVisible(true);
    if (myMatches === null) {
      try {
        const res = await api.get('/stats/me/history', { params: { limit: 30 } });
        setMyMatches(Array.isArray(res.data?.data) ? res.data.data : []);
      } catch {
        setMyMatches([]);
      }
    }
  };

  const uploadPhoto = async (matchId) => {
    if (!pendingPhotoUri) return;
    try {
      setMatchPickerVisible(false);
      setUploadingPhoto(true);
      const headers = await getAuthHeader();
      const formData = new FormData();
      formData.append('photo', { uri: pendingPhotoUri, type: 'image/jpeg', name: 'photo.jpg' });
      if (matchId) formData.append('match_id', String(matchId));

      const res = await fetch(`${BASE}/player-profile/me/photos`, { method: 'POST', headers, body: formData });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setPhotos((prev) => [json.data, ...prev]);
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo subir la foto');
    } finally {
      setUploadingPhoto(false);
      setPendingPhotoUri(null);
    }
  };

  const pickPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled) return;
      await openMatchPicker(result.assets[0].uri);
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo abrir la galería');
    }
  };

  const deletePhoto = (photo) => Alert.alert('Borrar foto', '¿Seguro que quieres borrarla?', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Borrar', style: 'destructive', onPress: async () => {
      try {
        await api.delete(`/player-profile/me/photos/${photo.id}`);
        setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      } catch (e) { Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo borrar'); }
    } },
  ]);

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#ff5a00" /></View>;
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Mi perfil público"
        description="Fotos, estadísticas y comentarios que verá cualquiera."
        action={(
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver">
              <Ionicons name="chevron-back" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.previewButton} onPress={() => navigation.navigate('PlayerSocialProfile', { userId: myId })}>
              <Ionicons name="eye-outline" size={16} color="#fff" />
              <Text style={styles.previewButtonText}>Ver</Text>
            </TouchableOpacity>
          </View>
        )}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>Portada</Text>
        <TouchableOpacity style={styles.bannerBox} onPress={pickBanner} activeOpacity={0.85}>
          {uploadingBanner ? <ActivityIndicator color="#ff5a00" /> : bannerUrl ? (
            <Image source={{ uri: resolveSocialAvatarUrl(bannerUrl) }} style={styles.bannerImage} resizeMode="cover" />
          ) : (
            <View style={styles.bannerPlaceholder}>
              <Ionicons name="image-outline" size={26} color="#666" />
              <Text style={styles.bannerPlaceholderText}>Añadir portada (opcional)</Text>
            </View>
          )}
        </TouchableOpacity>
        {bannerUrl ? <TouchableOpacity onPress={removeBanner}><Text style={styles.removeText}>Quitar portada</Text></TouchableOpacity> : null}

        <Text style={styles.sectionLabel}>Estadísticas que se ven en tu perfil</Text>
        <Text style={styles.hint}>Solo tú decides qué enseñar. El resto se queda privado.</Text>
        <View style={styles.statsList}>
          {STAT_OPTIONS.map((opt) => {
            const active = visibleStats.includes(opt.key);
            const value = allStats?.[opt.key];
            return (
              <TouchableOpacity key={opt.key} style={styles.statRow} onPress={() => toggleStat(opt.key)} activeOpacity={0.8}>
                <Ionicons name={opt.icon} size={19} color={active ? '#ff8c4d' : '#666'} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.statLabel}>{opt.label}</Text>
                  <Text style={styles.statValueHint}>Tu valor actual: {value ?? 0}{opt.key === 'win_rate' ? '%' : ''}</Text>
                </View>
                <View style={[styles.checkbox, active && styles.checkboxActive]}>
                  {active ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statLabel}>Permitir comentarios</Text>
            <Text style={styles.hint}>Solo pueden comentar jugadores con 5 o más partidos jugados.</Text>
          </View>
          <Switch value={commentsEnabled} onValueChange={toggleComments} trackColor={{ false: '#333', true: '#ff5a00' }} />
        </View>

        <View style={styles.photosHeader}>
          <Text style={styles.sectionLabel}>Fotos</Text>
          <TouchableOpacity style={styles.addPhotoButton} onPress={pickPhoto} disabled={uploadingPhoto}>
            {uploadingPhoto ? <ActivityIndicator size="small" color="#fff" /> : (
              <><Ionicons name="add" size={16} color="#fff" /><Text style={styles.addPhotoButtonText}>Añadir</Text></>
            )}
          </TouchableOpacity>
        </View>
        {!photos.length ? (
          <Text style={styles.hint}>Sube fotos tuyas de los partidos para que aparezcan en tu perfil.</Text>
        ) : (
          <View style={styles.photoGrid}>
            {photos.map((photo) => (
              <View key={photo.id} style={styles.photoTile}>
                <Image source={{ uri: resolveSocialAvatarUrl(photo.image_url) }} style={styles.photoTileImage} />
                <TouchableOpacity style={styles.photoDeleteButton} onPress={() => deletePhoto(photo)}>
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {saving ? <Text style={styles.savingText}>Guardando…</Text> : null}
      </ScrollView>

      <Modal visible={matchPickerVisible} transparent animationType="slide" onRequestClose={() => setMatchPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>¿De qué partido es esta foto?</Text>
            <Text style={styles.hint}>Opcional — solo puedes etiquetar partidos que hayas jugado de verdad.</Text>
            <TouchableOpacity style={styles.modalSkipButton} onPress={() => uploadPhoto(null)}>
              <Text style={styles.modalSkipButtonText}>Sin partido concreto</Text>
            </TouchableOpacity>
            <FlatList
              data={myMatches || []}
              keyExtractor={(item) => String(item.match_id)}
              style={{ maxHeight: 300 }}
              ListEmptyComponent={myMatches === null ? <ActivityIndicator color="#ff5a00" style={{ marginVertical: 16 }} /> : null}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalMatchRow} onPress={() => uploadPhoto(item.match_id)}>
                  <Text style={styles.modalMatchTitle} numberOfLines={1}>{item.title || 'Partido'}</Text>
                  <Text style={styles.modalMatchDate}>{new Date(item.starts_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalCancelButton} onPress={() => { setMatchPickerVisible(false); setPendingPhotoUri(null); }}>
              <Text style={styles.modalCancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0b0d' },
  loading: { flex: 1, backgroundColor: '#0b0b0d', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 18, paddingBottom: 60 },
  backButton: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#191c22', borderWidth: 1, borderColor: '#30343c', alignItems: 'center', justifyContent: 'center' },
  previewButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ff5a00', borderRadius: 10, paddingHorizontal: 12, height: 34 },
  previewButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  sectionLabel: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 22, marginBottom: 8 },
  hint: { color: '#777', fontSize: 11, lineHeight: 16, marginBottom: 10 },
  bannerBox: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16, overflow: 'hidden', backgroundColor: '#171719', borderWidth: 1, borderColor: '#29292d', alignItems: 'center', justifyContent: 'center' },
  bannerImage: { width: '100%', height: '100%' },
  bannerPlaceholder: { alignItems: 'center', gap: 6 },
  bannerPlaceholderText: { color: '#777', fontSize: 12, fontWeight: '600' },
  removeText: { color: '#ff6b6b', fontSize: 12, fontWeight: '700', marginTop: 8 },
  statsList: { backgroundColor: '#171719', borderRadius: 18, borderWidth: 1, borderColor: '#29292d', overflow: 'hidden' },
  statRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#232326' },
  statLabel: { color: '#fff', fontSize: 13, fontWeight: '800' },
  statValueHint: { color: '#777', fontSize: 11, marginTop: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#444', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: '#ff5a00', borderColor: '#ff5a00' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22, backgroundColor: '#171719', borderRadius: 16, borderWidth: 1, borderColor: '#29292d', padding: 14 },
  photosHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 },
  addPhotoButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ff5a00', borderRadius: 10, paddingHorizontal: 12, height: 32 },
  addPhotoButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoTile: { width: '31%', aspectRatio: 1 },
  photoTileImage: { width: '100%', height: '100%', borderRadius: 12, backgroundColor: '#222' },
  photoDeleteButton: { position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,.7)', alignItems: 'center', justifyContent: 'center' },
  savingText: { color: '#666', fontSize: 11, textAlign: 'center', marginTop: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#141414', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 32 },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  modalSkipButton: { paddingVertical: 12, alignItems: 'center', backgroundColor: '#1e1e21', borderRadius: 12, marginBottom: 10 },
  modalSkipButtonText: { color: '#ddd', fontWeight: '700', fontSize: 13 },
  modalMatchRow: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#232326', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalMatchTitle: { color: '#fff', fontSize: 13, fontWeight: '700', flex: 1, marginRight: 10 },
  modalMatchDate: { color: '#888', fontSize: 11 },
  modalCancelButton: { marginTop: 10, paddingVertical: 13, alignItems: 'center' },
  modalCancelButtonText: { color: '#888', fontSize: 13, fontWeight: '700' },
});
