import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Image, Switch } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import { uploadForm } from '../api/upload';
import { resolveOrganizerPhoto } from './AdminOrganizersScreen';

const BASE = String(api?.defaults?.baseURL || '').replace(/\/+$/, '');

async function getAuthHeader() {
  const raw = await AsyncStorage.getItem('token');
  let token = raw;
  try { const parsed = JSON.parse(raw || 'null'); token = parsed?.access_token || parsed?.token || raw; } catch {}
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AdminOrganizerEditScreen({ navigation, route }) {
  const organizerId = route?.params?.organizerId || null;
  const [currentId, setCurrentId] = useState(organizerId);
  const [loading, setLoading] = useState(Boolean(organizerId));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [photoUrl, setPhotoUrl] = useState('');
  const [previewUri, setPreviewUri] = useState(null);
  const [nonce, setNonce] = useState(Date.now());

  const load = useCallback(async () => {
    if (!organizerId) return;
    try {
      setLoading(true);
      const res = await api.get(`/admin/organizers/${organizerId}`);
      const organizer = res.data?.data;
      setFirstName(organizer?.first_name || '');
      setLastName(organizer?.last_name || '');
      setIsActive(Boolean(organizer?.is_active));
      setPhotoUrl(organizer?.photo_url || '');
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || 'No se pudo cargar el organizador');
    } finally {
      setLoading(false);
    }
  }, [organizerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      return Alert.alert('Faltan datos', 'Escribe el nombre y el primer apellido.');
    }
    const body = { first_name: firstName.trim(), last_name: lastName.trim(), is_active: isActive };
    try {
      setSaving(true);
      if (currentId) {
        await api.put(`/admin/organizers/${currentId}`, body);
        Alert.alert('Guardado', 'Organizador actualizado.');
      } else {
        const res = await api.post('/admin/organizers', body);
        setCurrentId(res.data?.data?.id);
        Alert.alert('Organizador creado', 'Ahora añádele una foto para que los jugadores le reconozcan.');
      }
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = async () => {
    if (!currentId) return Alert.alert('Guarda primero', 'Guarda el organizador antes de subir su foto.');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled) return;
      setUploading(true);
      const localUri = result.assets[0].uri;
      setPreviewUri(localUri);
      const formData = new FormData();
      formData.append('photo', { uri: localUri, type: 'image/jpeg', name: 'organizer.jpg' });
      const res = await uploadForm(`${BASE}/admin/organizers/${currentId}/photo`, {
        method: 'POST',
        headers: await getAuthHeader(),
        body: formData,
      });
      if (!res.ok) throw new Error((await res.text().catch(() => '')) || `Error ${res.status}`);
      const json = await res.json().catch(() => ({}));
      if (json?.photo_url) setPhotoUrl(json.photo_url);
      setNonce(Date.now());
      setPreviewUri(null);
    } catch (e) {
      setPreviewUri(null);
      Alert.alert('Error', e.message || 'No se pudo subir la foto');
    } finally {
      setUploading(false);
    }
  };

  const photo = previewUri || (photoUrl ? `${resolveOrganizerPhoto(photoUrl)}?v=${nonce}` : null);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#ff5a00" /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={18} color="#ccc" />
        <Text style={styles.backText}>Volver</Text>
      </TouchableOpacity>
      <Text style={styles.screenTitle}>{currentId ? 'Editar organizador' : 'Nuevo organizador'}</Text>

      <TouchableOpacity style={styles.photoBox} onPress={pickPhoto} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Cambiar foto">
        {photo ? <Image source={{ uri: photo }} style={styles.photo} /> : <Ionicons name="camera-outline" size={30} color="#666" />}
        {uploading ? <View style={styles.photoOverlay}><ActivityIndicator color="#fff" /></View> : null}
      </TouchableOpacity>
      <Text style={styles.photoHint}>{currentId ? 'Toca para elegir su foto' : 'Guarda primero para poder subir la foto'}</Text>

      <Text style={styles.label}>Nombre</Text>
      <TextInput style={styles.input} placeholder="Ej. Roberto" placeholderTextColor="#666" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
      <Text style={styles.label}>Primer apellido</Text>
      <TextInput style={styles.input} placeholder="Ej. Merchán" placeholderTextColor="#666" value={lastName} onChangeText={setLastName} autoCapitalize="words" />

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>Activo</Text>
          <Text style={styles.switchHint}>Si lo desactivas, no se podrá elegir en partidos nuevos.</Text>
        </View>
        <Switch value={isActive} onValueChange={setIsActive} trackColor={{ false: '#333', true: '#ff5a00' }} thumbColor="#fff" />
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{currentId ? 'Guardar cambios' : 'Crear organizador'}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  backText: { color: '#ccc', fontSize: 13, fontWeight: '700' },
  screenTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 18 },
  photoBox: { alignSelf: 'center', width: 120, height: 120, borderRadius: 60, overflow: 'hidden', backgroundColor: '#111', borderWidth: 1, borderColor: '#262626', alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: '100%' },
  photoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  photoHint: { color: '#888', fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 6 },
  label: { color: '#c2c2c2', fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: '#111', borderWidth: 1, borderColor: '#222', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22, backgroundColor: '#111', borderRadius: 14, borderWidth: 1, borderColor: '#222', padding: 14 },
  switchLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  switchHint: { color: '#9c9c9c', fontSize: 12, marginTop: 2 },
  saveButton: { backgroundColor: '#ff5a00', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 26, minHeight: 50, justifyContent: 'center' },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
