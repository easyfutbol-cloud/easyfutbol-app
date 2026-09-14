import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  Switch,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';

const BASE = String(api?.defaults?.baseURL || '').replace(/\/+$/, '');
const PUBLIC_BASE = BASE.replace(/\/api\/?$/, '');
const FALLBACK_CITIES = ['Valladolid', 'León', 'Oviedo', 'Palencia', 'Salamanca', 'Gijón', 'Avilés', 'Bilbao'];

function resolveImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return `${PUBLIC_BASE}${imageUrl}`;
}

async function getAuthHeader() {
  const raw = await AsyncStorage.getItem('token');
  let token = raw;
  try { const parsed = JSON.parse(raw || 'null'); token = parsed?.access_token || parsed?.token || raw; } catch {}
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AdminFieldEditScreen({ navigation, route }) {
  const fieldId = route?.params?.fieldId || null;
  const isNew = !fieldId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [currentId, setCurrentId] = useState(fieldId);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [arrivalInstructions, setArrivalInstructions] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreviewUri, setImagePreviewUri] = useState(null);
  const [imageNonce, setImageNonce] = useState(Date.now());
  const [cities, setCities] = useState(FALLBACK_CITIES);

  const loadCities = useCallback(async () => {
    try {
      const res = await api.get('/admin/cities');
      const data = res.data;
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : FALLBACK_CITIES;
      if (list.length) setCities(list);
    } catch {
      // se mantiene el fallback
    }
  }, []);

  const loadField = useCallback(async () => {
    if (!fieldId) return;
    try {
      setLoading(true);
      const res = await api.get(`/admin/fields/${fieldId}`);
      const field = res.data?.data;
      if (!field) throw new Error('Campo no encontrado');

      setName(field.name || '');
      setCity(field.city || '');
      setAddress(field.address || '');
      setMapsUrl(field.maps_url || '');
      setArrivalInstructions(field.arrival_instructions || '');
      setIsActive(!!field.is_active);
      setImageUrl(field.image_url || '');
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo cargar el campo');
    } finally {
      setLoading(false);
    }
  }, [fieldId]);

  useFocusEffect(
    useCallback(() => {
      loadCities();
      loadField();
    }, [loadCities, loadField])
  );

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert('Falta el nombre', 'Escribe el nombre del campo.');
    if (!city) return Alert.alert('Falta la ciudad', 'Selecciona una ciudad.');

    const body = {
      name: name.trim(),
      city,
      address: address.trim(),
      maps_url: mapsUrl.trim(),
      arrival_instructions: arrivalInstructions.trim(),
      is_active: isActive,
    };

    try {
      setSaving(true);

      if (currentId) {
        await api.put(`/admin/fields/${currentId}`, body);
        Alert.alert('Guardado', 'Los datos del campo se han actualizado.');
      } else {
        const res = await api.post('/admin/fields', body);
        const newId = res.data?.data?.id;
        setCurrentId(newId);
        Alert.alert('Campo creado', 'Ahora puedes añadirle una foto.');
      }
    } catch (e) {
      const msg = e?.response?.data?.msg || e.message || 'No se pudo guardar el campo';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handlePickPhoto = async () => {
    if (!currentId) {
      return Alert.alert('Guarda primero', 'Guarda el campo antes de subir una foto.');
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      });
      if (result.canceled) return;

      setUploadingPhoto(true);
      const localUri = result.assets[0].uri;
      setImagePreviewUri(localUri);

      const headers = await getAuthHeader();
      const formData = new FormData();
      formData.append('photo', { uri: localUri, type: 'image/jpeg', name: 'field.jpg' });

      const res = await fetch(`${BASE}/admin/fields/${currentId}/photo`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `Error ${res.status}`);
      }

      const json = await res.json().catch(() => ({}));
      if (json?.image_url) setImageUrl(json.image_url);
      setImageNonce(Date.now());
      setImagePreviewUri(null);
      Alert.alert('Foto actualizada');
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo subir la foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleOpenMaps = () => {
    if (!mapsUrl.trim()) return;
    Linking.openURL(mapsUrl.trim()).catch(() => Alert.alert('Enlace no válido', 'No se pudo abrir el enlace de Maps.'));
  };

  const photoUri = imagePreviewUri || (imageUrl ? `${resolveImageUrl(imageUrl)}?v=${imageNonce}` : null);

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#ff5a00" />
        <Text style={styles.loadingText}>Cargando campo...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.screenTitle}>{isNew && !currentId ? 'Añadir campo' : 'Editar campo'}</Text>

      <TouchableOpacity style={styles.photoBox} onPress={handlePickPhoto} activeOpacity={0.85}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoPlaceholderText}>
              {currentId ? 'Toca para añadir una foto' : 'Guarda el campo para poder subir una foto'}
            </Text>
          </View>
        )}
        {uploadingPhoto ? (
          <View style={styles.photoOverlay}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
      </TouchableOpacity>

      <Text style={styles.label}>Nombre del campo</Text>
      <TextInput
        style={styles.input}
        placeholder="Ej. Ribera de Castilla"
        placeholderTextColor="#666"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Ciudad</Text>
      <Picker selectedValue={city} onValueChange={setCity} style={styles.picker} dropdownIconColor="#fff">
        <Picker.Item label="Selecciona ciudad" value="" color="#777" />
        {cities.map((c) => (
          <Picker.Item key={c} label={c} value={c} color="#fff" />
        ))}
      </Picker>

      <Text style={styles.label}>Dirección</Text>
      <TextInput
        style={styles.input}
        placeholder="Calle, número..."
        placeholderTextColor="#666"
        value={address}
        onChangeText={setAddress}
      />

      <Text style={styles.label}>Enlace de Google Maps</Text>
      <TextInput
        style={styles.input}
        placeholder="https://maps.app.goo.gl/..."
        placeholderTextColor="#666"
        value={mapsUrl}
        onChangeText={setMapsUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
      {mapsUrl.trim() ? (
        <TouchableOpacity onPress={handleOpenMaps}>
          <Text style={styles.mapsLinkPreview}>Abrir enlace para comprobarlo →</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.label}>Indicaciones de llegada</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Ej. Llega 5 minutos antes, la entrada está junto al parking..."
        placeholderTextColor="#666"
        value={arrivalInstructions}
        onChangeText={setArrivalInstructions}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>Campo activo</Text>
          <Text style={styles.switchHint}>Si lo desactivas, dejará de aparecer al crear partidos.</Text>
        </View>
        <Switch
          value={isActive}
          onValueChange={setIsActive}
          trackColor={{ false: '#333', true: '#ff5a00' }}
          thumbColor="#fff"
        />
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{currentId ? 'Guardar cambios' : 'Crear campo'}</Text>}
      </TouchableOpacity>

      {currentId && isNew ? (
        <TouchableOpacity style={styles.doneButton} onPress={() => navigation.goBack()}>
          <Text style={styles.doneButtonText}>Terminar</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 16, paddingBottom: 40 },
  centeredContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  loadingText: { marginTop: 12, color: '#fff', fontSize: 16 },
  screenTitle: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 18 },
  photoBox: { width: '100%', height: 180, borderRadius: 16, overflow: 'hidden', backgroundColor: '#111', borderWidth: 1, borderColor: '#222', marginBottom: 20 },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  photoPlaceholderText: { color: '#888', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  photoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  label: { color: '#c2c2c2', fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: '#111', borderWidth: 1, borderColor: '#222', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15 },
  textArea: { minHeight: 100, paddingTop: 12 },
  picker: { backgroundColor: '#111', borderRadius: 12, color: '#fff' },
  mapsLinkPreview: { color: '#ff8c4d', fontSize: 12, fontWeight: '700', marginTop: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22, backgroundColor: '#111', borderRadius: 14, borderWidth: 1, borderColor: '#222', padding: 14 },
  switchLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  switchHint: { color: '#9c9c9c', fontSize: 12, marginTop: 2 },
  saveButton: { backgroundColor: '#ff5a00', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 26, minHeight: 50, justifyContent: 'center' },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  doneButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: '#ff5a00' },
  doneButtonText: { color: '#ff8c4d', fontSize: 14, fontWeight: '700' },
});
