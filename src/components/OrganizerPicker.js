import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Picker } from '@react-native-picker/picker';
import { api } from '../api/client';

// Selector de "Organizado por" para crear/editar partidos. `value` es el id
// como texto ('' = sin organizador). Recarga al volver de dar de alta uno.
export default function OrganizerPicker({ value, onChange, navigation, pickerStyle, labelStyle }) {
  const [organizers, setOrganizers] = useState([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      api.get('/admin/organizers')
        .then((res) => { if (active) setOrganizers(Array.isArray(res.data?.data) ? res.data.data : []); })
        .catch(() => {});
      return () => { active = false; };
    }, [])
  );

  return (
    <View>
      <View style={styles.header}>
        <Text style={labelStyle}>Organizado por</Text>
        {navigation ? (
          <TouchableOpacity onPress={() => navigation.navigate('AdminOrganizers')} hitSlop={8}>
            <Text style={styles.manage}>Gestionar →</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Picker selectedValue={String(value || '')} onValueChange={(v) => onChange(String(v || ''))} style={pickerStyle} dropdownIconColor="#fff">
        <Picker.Item label="Sin organizador" value="" color="#777" />
        {organizers.map((o) => (
          <Picker.Item key={o.id} label={`${o.first_name} ${o.last_name}`} value={String(o.id)} color="#fff" />
        ))}
      </Picker>
      {!organizers.length ? <Text style={styles.empty}>Aún no hay organizadores. Dalos de alta en Panel → Organizadores.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  manage: { color: '#ff8c4d', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  empty: { color: '#888', fontSize: 12, marginTop: 6 },
});
