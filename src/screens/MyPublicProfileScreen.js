import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Switch, Alert, Modal, FlatList, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import { uploadForm } from '../api/upload';
import ScreenHeader from '../components/ScreenHeader';
import { resolveSocialAvatarUrl } from '../components/social/SocialComponents';
import PlayerCard from '../components/profile/PlayerCard';
import { DEFAULT_SECTIONS, FOOT_LABELS, POSITION_LABELS, PROFILE_ACCENTS, PROFILE_SECTIONS, SECTION_ORDER, accentFor } from '../utils/profileTheme';

const EMPTY_IDENTITY = { nickname: '', shirt_number: '', bio: '', favorite_team: '', primary_position: null, secondary_position: null, dominant_foot: null };

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
  const [profileUser, setProfileUser] = useState(null);
  const [card, setCard] = useState(null);
  const [accent, setAccent] = useState('orange');
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [identity, setIdentity] = useState(EMPTY_IDENTITY);
  const [savedIdentity, setSavedIdentity] = useState(EMPTY_IDENTITY);
  const [savingIdentity, setSavingIdentity] = useState(false);

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
      setProfileUser(d.user || null);
      setCard(d.card || null);
      setAccent(d.user?.profile_accent || 'orange');
      setSections(d.sections || DEFAULT_SECTIONS);
      const loaded = {
        nickname: d.user?.nickname || '',
        shirt_number: d.user?.shirt_number ? String(d.user.shirt_number) : '',
        bio: d.user?.bio || '',
        favorite_team: d.user?.favorite_team || '',
        primary_position: d.user?.primary_position || null,
        secondary_position: d.user?.secondary_position || null,
        dominant_foot: d.user?.dominant_foot || null,
      };
      setIdentity(loaded);
      setSavedIdentity(loaded);
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

  const saveCustomization = async (patch) => {
    try {
      setSaving(true);
      await api.patch('/player-profile/me/customization', patch);
      return true;
    } catch (e) {
      Alert.alert('Perfil', e?.response?.data?.msg || e.message || 'No se pudo guardar');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const chooseAccent = async (key) => {
    const previous = accent;
    setAccent(key);
    if (!(await saveCustomization({ profile_accent: key }))) setAccent(previous);
  };

  const updateSections = async (next) => {
    const previous = sections;
    setSections(next);
    if (!(await saveCustomization({ profile_sections: next }))) setSections(previous);
  };
  const toggleSection = (key) => updateSections(sections.includes(key) ? sections.filter((k) => k !== key) : [...sections, key]);
  const moveSection = (key, direction) => {
    const index = sections.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    updateSections(next);
  };
  // Primero las visibles en su orden; debajo las ocultas para activarlas.
  const sectionRows = [...sections, ...SECTION_ORDER.filter((key) => !sections.includes(key))];

  const setField = (key, value) => setIdentity((prev) => ({ ...prev, [key]: value }));
  const identityDirty = Object.keys(EMPTY_IDENTITY).some((key) => identity[key] !== savedIdentity[key]);
  const saveIdentity = async () => {
    try {
      setSavingIdentity(true);
      await api.patch('/player-profile/me/customization', {
        nickname: identity.nickname,
        shirt_number: identity.shirt_number === '' ? null : identity.shirt_number,
        bio: identity.bio,
        favorite_team: identity.favorite_team,
      });
      const sportChanged = ['primary_position', 'dominant_foot'].some((key) => identity[key] !== savedIdentity[key]);
      if (sportChanged) {
        // La secundaria no puede ser igual que la principal.
        const secondary = identity.secondary_position === identity.primary_position ? null : identity.secondary_position;
        await api.patch('/me/sport-profile', { primary_position: identity.primary_position, secondary_position: secondary, dominant_foot: identity.dominant_foot });
      }
      setSavedIdentity(identity);
      await load();
    } catch (e) {
      Alert.alert('Perfil', e?.response?.data?.msg || e.message || 'No se pudo guardar');
    } finally {
      setSavingIdentity(false);
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

      const res = await uploadForm(`${BASE}/player-profile/me/banner`, { method: 'POST', headers, body: formData });
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

      const res = await uploadForm(`${BASE}/player-profile/me/photos`, { method: 'POST', headers, body: formData });
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
        title="Editar perfil"
        description="Cómo te ven los demás jugadores: tu estilo, tu carta y lo que enseñas."
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>Portada</Text>
        <TouchableOpacity style={styles.bannerBox} onPress={pickBanner} activeOpacity={0.85}>
          {uploadingBanner ? <ActivityIndicator color="#ff5a00" /> : bannerUrl ? (
            <Image source={{ uri: resolveSocialAvatarUrl(bannerUrl) }} style={styles.bannerImage} resizeMode="cover" />
          ) : (
            <LinearGradient colors={accentFor(accent).banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.bannerPlaceholder]}>
              <Ionicons name="image-outline" size={26} color="#fff" />
              <Text style={[styles.bannerPlaceholderText, { color: '#fff' }]}>Añadir portada (opcional)</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
        {bannerUrl ? <TouchableOpacity onPress={removeBanner}><Text style={styles.removeText}>Quitar portada</Text></TouchableOpacity> : null}

        <Text style={styles.sectionLabel}>Color de tu perfil</Text>
        <Text style={styles.hint}>Se usa en la portada, los botones y los títulos de tu perfil.</Text>
        <View style={styles.swatches}>
          {Object.entries(PROFILE_ACCENTS).map(([key, item]) => (
            <TouchableOpacity key={key} onPress={() => chooseAccent(key)} style={[styles.swatch, accent === key && { borderColor: '#fff' }]} accessibilityRole="button" accessibilityLabel={`Color ${item.label}`}>
              <View style={[styles.swatchInner, { backgroundColor: item.color }]}>{accent === key ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}</View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Tu jugador</Text>
        <View style={styles.formCard}>
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Apodo</Text>
              <TextInput value={identity.nickname} onChangeText={(v) => setField('nickname', v)} maxLength={24} placeholder="Ej. El Mago" placeholderTextColor="#555" style={styles.input} />
            </View>
            <View style={{ width: 86 }}>
              <Text style={styles.inputLabel}>Dorsal</Text>
              <TextInput value={identity.shirt_number} onChangeText={(v) => setField('shirt_number', v.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="10" placeholderTextColor="#555" style={[styles.input, { textAlign: 'center' }]} />
            </View>
          </View>

          <Text style={styles.inputLabel}>Posición</Text>
          <View style={styles.choiceRow}>
            {Object.entries(POSITION_LABELS).map(([key, label]) => (
              <Choice key={key} label={label} active={identity.primary_position === key} color={accentFor(accent).color} onPress={() => setField('primary_position', identity.primary_position === key ? null : key)} />
            ))}
          </View>

          <Text style={styles.inputLabel}>Pierna buena</Text>
          <View style={styles.choiceRow}>
            {Object.entries(FOOT_LABELS).map(([key, label]) => (
              <Choice key={key} label={label} active={identity.dominant_foot === key} color={accentFor(accent).color} onPress={() => setField('dominant_foot', identity.dominant_foot === key ? null : key)} />
            ))}
          </View>

          <Text style={styles.inputLabel}>Equipo favorito</Text>
          <TextInput value={identity.favorite_team} onChangeText={(v) => setField('favorite_team', v)} maxLength={40} placeholder="Ej. Real Sporting" placeholderTextColor="#555" style={styles.input} />

          <View style={styles.bioHeader}>
            <Text style={styles.inputLabel}>Bio</Text>
            <Text style={styles.counter}>{identity.bio.length}/160</Text>
          </View>
          <TextInput value={identity.bio} onChangeText={(v) => setField('bio', v)} maxLength={160} multiline placeholder="Cuéntale a la gente cómo juegas" placeholderTextColor="#555" style={[styles.input, styles.bioInput]} />

          <TouchableOpacity onPress={saveIdentity} disabled={!identityDirty || savingIdentity} style={[styles.saveButton, { backgroundColor: accentFor(accent).color }, (!identityDirty || savingIdentity) && { opacity: 0.4 }]} accessibilityRole="button">
            {savingIdentity ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{identityDirty ? 'Guardar cambios' : 'Guardado'}</Text>}
          </TouchableOpacity>
        </View>

        {card ? <>
          <Text style={styles.sectionLabel}>Tu carta</Text>
          <Text style={styles.hint}>Se calcula sola con tus partidos y tu posición. Actívala en Secciones para que la vean los demás.</Text>
          <PlayerCard card={card} name={profileUser?.name} nickname={savedIdentity.nickname} avatarUrl={profileUser?.avatar_url} shirtNumber={savedIdentity.shirt_number} width={210} />
        </> : null}

        <Text style={styles.sectionLabel}>Secciones de tu perfil</Text>
        <Text style={styles.hint}>Elige qué se ve y en qué orden. Lo que apagues no lo verá nadie más.</Text>
        <View style={styles.statsList}>
          {sectionRows.map((key) => {
            const meta = PROFILE_SECTIONS[key];
            const index = sections.indexOf(key);
            const active = index >= 0;
            return (
              <View key={key} style={[styles.statRow, !active && { opacity: 0.55 }]}>
                <Ionicons name={meta.icon} size={19} color={active ? accentFor(accent).color : '#666'} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.statLabel}>{meta.label}</Text>
                  <Text style={styles.statValueHint}>{meta.hint}</Text>
                </View>
                {active ? <>
                  <TouchableOpacity onPress={() => moveSection(key, -1)} disabled={index === 0} style={[styles.moveButton, index === 0 && { opacity: 0.25 }]} accessibilityLabel={`Subir ${meta.label}`}><Ionicons name="chevron-up" size={16} color="#fff" /></TouchableOpacity>
                  <TouchableOpacity onPress={() => moveSection(key, 1)} disabled={index === sections.length - 1} style={[styles.moveButton, index === sections.length - 1 && { opacity: 0.25 }]} accessibilityLabel={`Bajar ${meta.label}`}><Ionicons name="chevron-down" size={16} color="#fff" /></TouchableOpacity>
                </> : null}
                <Switch value={active} onValueChange={() => toggleSection(key)} trackColor={{ false: '#333', true: accentFor(accent).color }} style={{ marginLeft: 6 }} />
              </View>
            );
          })}
        </View>

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
      </KeyboardAvoidingView>

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

function Choice({ label, active, color, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.choice, active && { backgroundColor: color, borderColor: color }]} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[styles.choiceText, active && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent', padding: 3 },
  swatchInner: { flex: 1, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  formCard: { backgroundColor: '#171719', borderRadius: 18, borderWidth: 1, borderColor: '#29292d', padding: 14 },
  formRow: { flexDirection: 'row', gap: 10 },
  inputLabel: { color: '#a5a8ae', fontSize: 11, fontWeight: '900', letterSpacing: 0.6, marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: '#1f1f23', borderRadius: 12, borderWidth: 1, borderColor: '#2c2c31', color: '#fff', fontSize: 14, paddingHorizontal: 12, paddingVertical: 11 },
  bioHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  counter: { color: '#66686e', fontSize: 10, fontWeight: '800' },
  bioInput: { minHeight: 76, textAlignVertical: 'top' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { borderRadius: 999, borderWidth: 1, borderColor: '#34343a', paddingHorizontal: 12, paddingVertical: 8 },
  choiceText: { color: '#c9cbd0', fontSize: 12, fontWeight: '800' },
  saveButton: { marginTop: 16, borderRadius: 13, height: 46, alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  moveButton: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#26262b', alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
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
