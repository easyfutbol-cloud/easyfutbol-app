import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Image, Switch, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import { AppPopupCard, resolvePopupImage } from '../components/AppPopupHost';
import { FREQUENCY_LABELS } from './AdminPopupsScreen';

const BASE = String(api?.defaults?.baseURL || '').replace(/\/+$/, '');

const ACTION_OPTIONS = [
  { key: 'none', label: 'Sin botón' },
  { key: 'url', label: 'Enlace' },
  { key: 'screen', label: 'Pantalla' },
];

const SCREEN_LABELS = {
  Home: 'Inicio',
  Matchs: 'Partidos',
  MisPartidos: 'Mis partidos',
  Social: 'Amigos',
  Profile: 'Perfil',
  EasyPass: 'EasyPass',
  Plus: 'EasyFutbol+',
  WeeklyLineupVote: 'Votar el 8 de la semana',
  WeeklyLineupResult: 'Resultado del 8',
  Stats: 'Estadísticas',
  Achievements: 'Logros',
  Faq: 'Preguntas frecuentes',
};

const LOCATION_OPTIONS = [
  { key: 'valladolid', label: 'Valladolid' },
  { key: 'asturias', label: 'Asturias' },
];

const EXPIRY_OPTIONS = [
  { key: 'none', label: 'Sin caducidad', days: null },
  { key: '1', label: '24 horas', days: 1 },
  { key: '3', label: '3 días', days: 3 },
  { key: '7', label: '7 días', days: 7 },
  { key: '30', label: '30 días', days: 30 },
];

async function getAuthHeader() {
  const raw = await AsyncStorage.getItem('token');
  let token = raw;
  try { const parsed = JSON.parse(raw || 'null'); token = parsed?.access_token || parsed?.token || raw; } catch {}
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function Chips({ options, value, onChange }) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <TouchableOpacity key={option.key} style={[styles.chip, active && styles.chipActive]} onPress={() => onChange(option.key)}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function AdminPopupEditScreen({ navigation, route }) {
  const initialId = route?.params?.popupId || null;

  const [currentId, setCurrentId] = useState(initialId);
  const [loading, setLoading] = useState(!!initialId);
  const [saving, setSaving] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [actionType, setActionType] = useState('none');
  const [buttonLabel, setButtonLabel] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [actionScreen, setActionScreen] = useState('Matchs');
  const [frequency, setFrequency] = useState('once');
  const [audience, setAudience] = useState([]); // [] = todas las sedes
  const [isActive, setIsActive] = useState(true);
  const [expiry, setExpiry] = useState(initialId ? 'keep' : 'none');
  const [currentEndsAt, setCurrentEndsAt] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [pendingImageUri, setPendingImageUri] = useState(null);
  const [removeImage, setRemoveImage] = useState(false);

  const loadPopup = useCallback(async () => {
    if (!initialId) return;
    try {
      setLoading(true);
      const res = await api.get(`/admin/popups/${initialId}`);
      const p = res.data?.data;
      if (!p) return;
      setTitle(p.title || '');
      setBody(p.body || '');
      setActionType(p.action_type || 'none');
      setButtonLabel(p.button_label || '');
      if (p.action_type === 'url') setActionUrl(p.action_value || '');
      if (p.action_type === 'screen') setActionScreen(p.action_value || 'Matchs');
      setFrequency(p.frequency || 'once');
      setAudience(p.audience_locations ? String(p.audience_locations).split(',') : []);
      setIsActive(!!p.is_active);
      setCurrentEndsAt(p.ends_at || null);
      setImageUrl(p.image_url || '');
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo cargar el popup');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [initialId, navigation]);

  useFocusEffect(useCallback(() => { loadPopup(); }, [loadPopup]));

  const expiryOptions = currentId && initialId
    ? [{ key: 'keep', label: currentEndsAt ? `Mantener (${new Date(currentEndsAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })})` : 'Mantener (sin caducidad)' }, ...EXPIRY_OPTIONS]
    : EXPIRY_OPTIONS;

  const toggleLocation = (key) => {
    setAudience((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });
      if (result.canceled) return;
      setPendingImageUri(result.assets[0].uri);
      setRemoveImage(false);
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo abrir la galería');
    }
  };

  const handleRemoveImage = () => {
    setPendingImageUri(null);
    if (imageUrl) {
      setRemoveImage(true);
      setImageUrl('');
    }
  };

  const currentImage = pendingImageUri || imageUrl || null;

  const buildPayload = () => {
    const payload = {
      title,
      body,
      action_type: actionType,
      button_label: actionType === 'none' ? null : buttonLabel,
      action_value: actionType === 'url' ? actionUrl : actionType === 'screen' ? actionScreen : null,
      frequency,
      audience_locations: audience,
      is_active: isActive,
    };
    if (expiry !== 'keep') {
      const option = EXPIRY_OPTIONS.find((o) => o.key === expiry);
      payload.ends_at = option?.days ? new Date(Date.now() + option.days * 24 * 60 * 60 * 1000).toISOString() : null;
    }
    return payload;
  };

  const handleSave = async () => {
    if (!title.trim()) return Alert.alert('Falta el título', 'Escribe el título del popup.');

    try {
      setSaving(true);
      const payload = buildPayload();
      let id = currentId;

      if (id) {
        await api.put(`/admin/popups/${id}`, payload);
      } else {
        const res = await api.post('/admin/popups', payload);
        id = res.data?.data?.id;
        setCurrentId(id);
      }

      // La imagen va aparte: primero se guarda el popup y luego se sube.
      try {
        if (pendingImageUri && id) {
          const headers = await getAuthHeader();
          const formData = new FormData();
          formData.append('image', { uri: pendingImageUri, type: 'image/jpeg', name: 'popup.jpg' });
          const upload = await fetch(`${BASE}/admin/popups/${id}/image`, { method: 'POST', headers, body: formData });
          if (!upload.ok) throw new Error(`Error ${upload.status}`);
        } else if (removeImage && id) {
          await api.delete(`/admin/popups/${id}/image`);
        }
      } catch (imageError) {
        Alert.alert('Popup guardado, pero la imagen no', 'Vuelve a intentar subir la imagen y guarda de nuevo.');
        return;
      }

      Alert.alert('Guardado', isActive ? 'El popup ya está activo para los jugadores.' : 'Guardado como pausado.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo guardar el popup');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Eliminar popup', 'Se borrará junto con su historial de vistas. ¿Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/admin/popups/${currentId}`);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo eliminar');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ff5a00" />
      </View>
    );
  }

  const previewPopup = {
    title: title.trim() || 'Título del popup',
    body: body.trim(),
    image_url: currentImage,
    action_type: actionType,
    button_label: buttonLabel.trim() || 'Botón',
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={18} color="#ccc" />
        <Text style={styles.backText}>Volver</Text>
      </TouchableOpacity>
      <Text style={styles.screenTitle}>{initialId ? 'Editar popup' : 'Nuevo popup'}</Text>

      <TouchableOpacity style={styles.imageBox} onPress={handlePickImage} activeOpacity={0.85}>
        {currentImage ? (
          <Image source={{ uri: resolvePopupImage(currentImage) }} style={styles.imagePreview} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="image-outline" size={30} color="#666" />
            <Text style={styles.imagePlaceholderText}>Añadir imagen (opcional)</Text>
          </View>
        )}
      </TouchableOpacity>
      {currentImage ? (
        <TouchableOpacity onPress={handleRemoveImage}>
          <Text style={styles.removeImage}>Quitar imagen</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.label}>Título</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} maxLength={120} placeholder="Ej: ¡Nuevo campo en Gijón!" placeholderTextColor="#666" />

      <Text style={styles.label}>Mensaje</Text>
      <TextInput style={[styles.input, styles.inputMultiline]} value={body} onChangeText={setBody} maxLength={1000} multiline placeholder="Cuéntales lo que quieras (opcional)" placeholderTextColor="#666" />

      <Text style={styles.label}>Botón</Text>
      <Chips options={ACTION_OPTIONS} value={actionType} onChange={setActionType} />
      {actionType !== 'none' ? (
        <View>
          <TextInput style={styles.input} value={buttonLabel} onChangeText={setButtonLabel} maxLength={40} placeholder="Texto del botón (ej: Ver partidos)" placeholderTextColor="#666" />
          {actionType === 'url' ? (
            <TextInput style={[styles.input, { marginTop: 8 }]} value={actionUrl} onChangeText={setActionUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://..." placeholderTextColor="#666" />
          ) : (
            <View style={{ marginTop: 10 }}>
              <Chips options={Object.entries(SCREEN_LABELS).map(([key, label]) => ({ key, label }))} value={actionScreen} onChange={setActionScreen} />
            </View>
          )}
        </View>
      ) : null}

      <Text style={styles.label}>Para quién</Text>
      <View style={styles.chips}>
        <TouchableOpacity style={[styles.chip, audience.length === 0 && styles.chipActive]} onPress={() => setAudience([])}>
          <Text style={[styles.chipText, audience.length === 0 && styles.chipTextActive]}>Todas las sedes</Text>
        </TouchableOpacity>
        {LOCATION_OPTIONS.map((option) => {
          const active = audience.includes(option.key);
          return (
            <TouchableOpacity key={option.key} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleLocation(option.key)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.hint}>
        Se usa la sede que eligió cada jugador al registrarse; si no la tiene, la de sus partidos habituales. Quien no tenga ninguna solo verá los popups para todas las sedes.
      </Text>

      <Text style={styles.label}>Cuándo se muestra</Text>
      <Chips options={Object.entries(FREQUENCY_LABELS).map(([key, label]) => ({ key, label }))} value={frequency} onChange={setFrequency} />

      <Text style={styles.label}>Caduca</Text>
      <Chips options={expiryOptions} value={expiry} onChange={setExpiry} />

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchTitle}>Activo</Text>
          <Text style={styles.switchHint}>Si lo pausas, deja de mostrarse sin borrarlo.</Text>
        </View>
        <Switch value={isActive} onValueChange={setIsActive} trackColor={{ false: '#333', true: '#ff5a00' }} />
      </View>

      <TouchableOpacity style={styles.previewButton} onPress={() => setPreviewVisible(true)}>
        <Ionicons name="eye-outline" size={18} color="#fff" />
        <Text style={styles.previewButtonText}>Vista previa</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{initialId ? 'Guardar cambios' : 'Publicar popup'}</Text>}
      </TouchableOpacity>

      {initialId ? (
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>Eliminar popup</Text>
        </TouchableOpacity>
      ) : null}

      <Modal visible={previewVisible} transparent animationType="fade" onRequestClose={() => setPreviewVisible(false)}>
        <View style={styles.previewOverlay}>
          <AppPopupCard popup={previewPopup} onPrimary={() => setPreviewVisible(false)} onClose={() => setPreviewVisible(false)} />
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 60 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  backText: { color: '#ccc', fontSize: 13, fontWeight: '700' },
  screenTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 16 },
  imageBox: { width: '100%', aspectRatio: 16 / 9, borderRadius: 16, overflow: 'hidden', backgroundColor: '#141414', borderWidth: 1, borderColor: '#262626' },
  imagePreview: { width: '100%', height: '100%' },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  imagePlaceholderText: { color: '#777', fontSize: 12, fontWeight: '600' },
  removeImage: { color: '#ff6b6b', fontSize: 12, fontWeight: '700', marginTop: 8 },
  label: { color: '#ddd', fontSize: 13, fontWeight: '800', marginTop: 20, marginBottom: 8 },
  input: { backgroundColor: '#141414', borderWidth: 1, borderColor: '#262626', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 14 },
  inputMultiline: { minHeight: 100, textAlignVertical: 'top' },
  hint: { color: '#777', fontSize: 11, lineHeight: 16, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#141414', borderWidth: 1, borderColor: '#2a2a2a' },
  chipActive: { backgroundColor: '#ff5a00', borderColor: '#ff5a00' },
  chipText: { color: '#aaa', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22, backgroundColor: '#141414', borderRadius: 14, borderWidth: 1, borderColor: '#262626', padding: 14 },
  switchTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  switchHint: { color: '#888', fontSize: 11, marginTop: 2 },
  previewButton: { marginTop: 22, height: 48, borderRadius: 14, borderWidth: 1, borderColor: '#333', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  previewButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  saveButton: { marginTop: 12, height: 52, borderRadius: 14, backgroundColor: '#ff5a00', alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  deleteButton: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  deleteButtonText: { color: '#ff6b6b', fontSize: 13, fontWeight: '700' },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
});
