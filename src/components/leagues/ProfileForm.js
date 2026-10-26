import React from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { L } from './LeagueUI';

// Piezas comunes de los editores de perfil (equipo y jugador).

export async function pickImage(aspect) {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permiso necesario', 'Permite el acceso a tus fotos para elegir una imagen.');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.85 });
    return result.canceled ? null : result.assets[0].uri;
  } catch (error) {
    Alert.alert('Error', error.message || 'No se pudo abrir la galería');
    return null;
  }
}

export function ImageField({ label, uri, onPick, onRemove, hint, wide, round }) {
  return (
    <View style={[styles.imageField, wide && { flex: 1.4 }]}>
      <Pressable onPress={onPick} style={[styles.thumb, wide && styles.thumbWide, round && styles.thumbRound]}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Ionicons name="image-outline" size={20} color={L.subtle} />}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.imageLabel}>{label}</Text>
        <Text style={styles.imageHint} numberOfLines={2}>{hint}</Text>
        <View style={styles.imageActions}>
          <Pressable onPress={onPick} hitSlop={6}><Text style={styles.imageAction}>{uri ? 'Cambiar' : 'Subir'}</Text></Pressable>
          {!!uri && <Pressable onPress={onRemove} hitSlop={6}><Text style={[styles.imageAction, { color: L.loss }]}>Quitar</Text></Pressable>}
        </View>
      </View>
    </View>
  );
}

export function Field({ label, value, onChange, max, hint, prefix, multiline, ...props }) {
  const text = value || '';
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={styles.label}>{label.toUpperCase()}</Text>
        {!!max && max > 4 && <Text style={styles.counter}>{text.length}/{max}</Text>}
      </View>
      <View style={[styles.inputWrap, multiline && styles.inputMulti]}>
        {!!prefix && <Text style={styles.prefix}>{prefix}</Text>}
        <TextInput
          value={text}
          onChangeText={onChange}
          maxLength={max}
          multiline={multiline}
          placeholderTextColor={L.subtle}
          style={[styles.input, multiline && styles.inputMultiText]}
          {...props}
        />
      </View>
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

// Selector de una opción entre pocas (posición, pie dominante…).
export function Pills({ label, options, value, onChange, allowEmpty }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={styles.pills}>
        {options.map(([key, text]) => {
          const active = value === key;
          return (
            <Pressable key={key} onPress={() => onChange(active && allowEmpty ? null : key)} style={[styles.pill, active && styles.pillActive]}>
              <Text style={[styles.pillText, active && styles.pillTextActive]}>{text}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: L.subtle, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  imageField: { flex: 1, flexDirection: 'row', gap: 10, padding: 10, borderRadius: 14, backgroundColor: L.surface, borderWidth: 1, borderColor: L.line },
  thumb: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: L.raised },
  thumbWide: { width: 60 },
  thumbRound: { borderRadius: 22 },
  imageLabel: { color: L.text, fontSize: 13, fontWeight: '800' },
  imageHint: { color: L.subtle, fontSize: 10, marginTop: 1 },
  imageActions: { flexDirection: 'row', gap: 12, marginTop: 5 },
  imageAction: { color: L.accent, fontSize: 12, fontWeight: '800' },
  field: { marginBottom: 16 },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between' },
  counter: { color: L.subtle, fontSize: 10, fontWeight: '700' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderRadius: 13, backgroundColor: L.surface, borderWidth: 1, borderColor: L.line },
  inputMulti: { alignItems: 'flex-start' },
  prefix: { color: L.muted, fontSize: 15, fontWeight: '700', marginRight: 2 },
  input: { flex: 1, color: L.text, fontSize: 15, paddingVertical: 12 },
  inputMultiText: { minHeight: 96, textAlignVertical: 'top' },
  hint: { color: L.subtle, fontSize: 11, marginTop: 5 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: L.surface, borderWidth: 1, borderColor: L.line },
  pillActive: { backgroundColor: L.text, borderColor: L.text },
  pillText: { color: L.soft, fontSize: 13, fontWeight: '700' },
  pillTextActive: { color: L.bg },
});
