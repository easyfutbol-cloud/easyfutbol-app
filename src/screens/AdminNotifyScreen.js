import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, StatusBar, ActivityIndicator } from 'react-native';
import { colors, spacing } from '../theme';
import { api } from '../api/client';

export default function AdminNotifyScreen({ route }) {
  const { matchId } = route.params || {};
  const [id, setId] = useState(matchId ? String(matchId) : '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  const send = async () => {
    try {
      if (!id) return Alert.alert('Falta partido', 'Indica el ID del partido');
      if (!title || !body) return Alert.alert('Faltan campos', 'Título y mensaje son obligatorios');
      setLoading(true);
      const { data } = await api.post(`/admin/notify/match/${id}`, { title, body });
      if (!data?.ok) throw new Error(data?.msg || 'No se pudo enviar');
      Alert.alert('Enviado', `Notificación enviada a ${data.sent} jugadores`);
      setTitle('');
      setBody('');
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo enviar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.title}>Enviar aviso a partido</Text>

      <Text style={styles.label}>ID de partido</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={id}
        onChangeText={setId}
        placeholder="Ej. 12"
        placeholderTextColor="#777"
      />

      <Text style={styles.label}>Título</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Cambio de campo"
        placeholderTextColor="#777"
      />

      <Text style={styles.label}>Mensaje</Text>
      <TextInput
        style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
        multiline
        value={body}
        onChangeText={setBody}
        placeholder="Nos han movido al Campo 2. Nos vemos allí 10 min antes."
        placeholderTextColor="#777"
      />

      <TouchableOpacity style={styles.btn} onPress={send} disabled={loading}>
        {loading ? <ActivityIndicator /> : <Text style={styles.btnText}>Enviar</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor:colors.black, padding:spacing(2) },
  title:{ color:colors.white, fontSize:22, fontWeight:'800', marginBottom:spacing(2), textAlign:'center' },
  label:{ color:'#ddd', fontWeight:'700', marginTop:spacing(1), marginBottom:4 },
  input:{ backgroundColor:'#111', borderWidth:1, borderColor:'#222', color:'#fff', padding:spacing(1.2), borderRadius:10, marginBottom:spacing(1) },
  btn:{ backgroundColor:colors.orange, paddingVertical:spacing(1.6), borderRadius:12, alignItems:'center', marginTop:spacing(2) },
  btnText:{ color:colors.black, fontWeight:'800', fontSize:16 }
});
