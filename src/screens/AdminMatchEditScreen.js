

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://api.easyfutbol.es';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Borrador' },
  { value: 'open', label: 'Abierto' },
  { value: 'full', label: 'Completo' },
  { value: 'closed', label: 'Cerrado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'finished', label: 'Finalizado' },
];

const SHIRT_OPTIONS = [
  { value: '', label: 'Sin definir' },
  { value: 'white', label: 'Blanca' },
  { value: 'black', label: 'Negra' },
];

function normalizeDateForInput(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function normalizeTimeForInput(value) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

export default function AdminMatchEditScreen({ route, navigation }) {
  const matchId = route?.params?.matchId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [totalSlots, setTotalSlots] = useState('');
  const [status, setStatus] = useState('open');
  const [easyPassRequired, setEasyPassRequired] = useState('1');
  const [shirtColor, setShirtColor] = useState('');
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [availableSlots, setAvailableSlots] = useState(0);

  const fetchMatch = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const token = await AsyncStorage.getItem('token');

      if (!token) {
        setError('No se encontró la sesión. Inicia sesión de nuevo.');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/matches/${matchId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'No se pudo cargar el partido');
      }

      setTitle(data?.title || '');
      setDescription(data?.description || '');
      setCity(data?.city || '');
      setFieldName(data?.field_name || '');
      setMatchDate(normalizeDateForInput(data?.match_date));
      setStartTime(normalizeTimeForInput(data?.start_time));
      setEndTime(normalizeTimeForInput(data?.end_time));
      setTotalSlots(String(data?.total_slots ?? ''));
      setStatus(data?.status || 'open');
      setEasyPassRequired(String(data?.easypass_required ?? 1));
      setShirtColor(data?.shirt_color || '');
      setConfirmedCount(Number(data?.confirmed_count ?? 0));
      setAvailableSlots(Number(data?.available_slots ?? 0));
    } catch (err) {
      setError(err.message || 'Error cargando partido');
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useFocusEffect(
    useCallback(() => {
      if (!matchId) {
        setError('No se recibió el ID del partido.');
        setLoading(false);
        return;
      }

      fetchMatch();
    }, [fetchMatch, matchId])
  );

  const handleSave = async () => {
    if (!matchId) {
      Alert.alert('Error', 'No se encontró el partido a editar.');
      return;
    }

    if (!title.trim() || !city.trim() || !fieldName.trim() || !matchDate.trim() || !startTime.trim() || !endTime.trim()) {
      Alert.alert('Campos obligatorios', 'Rellena título, ciudad, campo, fecha y horas.');
      return;
    }

    try {
      setSaving(true);

      const token = await AsyncStorage.getItem('token');

      if (!token) {
        Alert.alert('Sesión no disponible', 'Inicia sesión de nuevo.');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/matches/${matchId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          city: city.trim(),
          field_name: fieldName.trim(),
          match_date: matchDate.trim(),
          start_time: startTime.trim(),
          end_time: endTime.trim(),
          total_slots: Number(totalSlots),
          status,
          easypass_required: Number(easyPassRequired),
          shirt_color: shirtColor || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'No se pudo actualizar el partido');
      }

      Alert.alert('Guardado', 'El partido se actualizó correctamente.', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (err) {
      Alert.alert('Error', err.message || 'No se pudo guardar el partido');
    } finally {
      setSaving(false);
    }
  };

  const renderStatusSelector = () => (
    <View style={styles.selectorContainer}>
      {STATUS_OPTIONS.map((option) => {
        const isActive = status === option.value;

        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.selectorPill, isActive && styles.selectorPillActive]}
            onPress={() => setStatus(option.value)}
          >
            <Text style={[styles.selectorPillText, isActive && styles.selectorPillTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderShirtSelector = () => (
    <View style={styles.selectorContainer}>
      {SHIRT_OPTIONS.map((option) => {
        const isActive = shirtColor === option.value;

        return (
          <TouchableOpacity
            key={option.value || 'none'}
            style={[styles.selectorPill, isActive && styles.selectorPillActive]}
            onPress={() => setShirtColor(option.value)}
          >
            <Text style={[styles.selectorPillText, isActive && styles.selectorPillTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#ff5a00" />
        <Text style={styles.loadingText}>Cargando datos del partido...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.screenTitle}>Editar partido</Text>
      <Text style={styles.screenSubtitle}>
        Modifica los datos del partido y guarda los cambios.
      </Text>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchMatch}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.infoRow}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Inscritos confirmados</Text>
          <Text style={styles.infoValue}>{confirmedCount}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Plazas libres actuales</Text>
          <Text style={styles.infoValue}>{availableSlots}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Nombre del partido</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Miércoles EasyFutbol 20:30"
          placeholderTextColor="#777"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Descripción</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Descripción del partido"
          placeholderTextColor="#777"
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text style={styles.label}>Ciudad</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Valladolid"
          placeholderTextColor="#777"
          value={city}
          onChangeText={setCity}
        />

        <Text style={styles.label}>Campo</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. Ribera de Castilla"
          placeholderTextColor="#777"
          value={fieldName}
          onChangeText={setFieldName}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Fecha</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#777"
          value={matchDate}
          onChangeText={setMatchDate}
          autoCapitalize="none"
        />

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Hora inicio</Text>
            <TextInput
              style={styles.input}
              placeholder="20:30"
              placeholderTextColor="#777"
              value={startTime}
              onChangeText={setStartTime}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.halfField}>
            <Text style={styles.label}>Hora fin</Text>
            <TextInput
              style={styles.input}
              placeholder="21:30"
              placeholderTextColor="#777"
              value={endTime}
              onChangeText={setEndTime}
              autoCapitalize="none"
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Plazas totales</Text>
            <TextInput
              style={styles.input}
              placeholder="16"
              placeholderTextColor="#777"
              value={totalSlots}
              onChangeText={setTotalSlots}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.halfField}>
            <Text style={styles.label}>EasyPass necesarios</Text>
            <TextInput
              style={styles.input}
              placeholder="1"
              placeholderTextColor="#777"
              value={easyPassRequired}
              onChangeText={setEasyPassRequired}
              keyboardType="number-pad"
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Estado</Text>
        {renderStatusSelector()}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Color de camiseta</Text>
        {renderShirtSelector()}
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Guardar cambios</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 30,
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#fff',
    fontSize: 16,
  },
  screenTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 6,
  },
  screenSubtitle: {
    color: '#b3b3b3',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  errorBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#ff5a00',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 10,
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#ff5a00',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  infoLabel: {
    color: '#9c9c9c',
    fontSize: 12,
    marginBottom: 8,
  },
  infoValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  section: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 2,
  },
  input: {
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#fff',
    fontSize: 15,
    marginBottom: 14,
  },
  textArea: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  selectorContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  selectorPill: {
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  selectorPillActive: {
    backgroundColor: 'rgba(255, 90, 0, 0.16)',
    borderColor: '#ff5a00',
  },
  selectorPillText: {
    color: '#cfcfcf',
    fontSize: 13,
    fontWeight: '600',
  },
  selectorPillTextActive: {
    color: '#ff8c4d',
  },
  saveButton: {
    backgroundColor: '#ff5a00',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});