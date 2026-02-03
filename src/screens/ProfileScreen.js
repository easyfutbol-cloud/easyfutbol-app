// src/screens/ProfileScreen.js
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, StatusBar, ActivityIndicator, TouchableOpacity,
  Alert, TextInput, ScrollView, ImageBackground, Image
} from 'react-native';
import { colors, spacing } from '../theme';
import { api } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useFocusEffect, CommonActions } from '@react-navigation/native';

const ORANGE = '#ff5a00';
const FIELD_BG = {
  uri: 'https://images.unsplash.com/photo-1486286701208-1d58e9338013?q=80&w=2400&auto=format&fit=crop'
};

export default function ProfileScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [uploading, setUploading] = useState(false);

  const BASE = (api?.defaults?.baseURL || '').replace(/\/+$/, '');

  const getAuthHeader = async () => {
    const raw = await AsyncStorage.getItem('token');
    let token = raw;
    try { const parsed = JSON.parse(raw || 'null'); token = parsed?.access_token || parsed?.token || raw; } catch {}
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const goToAccess = async () => {
    await AsyncStorage.multiRemove(['token', 'user']);
    try { navigation.replace('Access'); return; } catch {}
    try { navigation.navigate('Access'); return; } catch {}
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Access' }] }));
  };

  const pingApi = async () => {
    try {
      const res = await fetch(`${BASE}/api/health`, { method: 'GET' });
      if (!res.ok) throw new Error(`/api/health ${res.status}`);
      return true;
    } catch (e) {
      setErrMsg(`No hay conexión con la API (${e?.message || 'health fail'})`);
      return false;
    }
  };

  const parsePayload = async (res) => {
    const json = await res.json().catch(() => ({}));
    const payload = json?.data ?? json ?? null;
    if (!payload?.user) throw new Error(json?.msg || 'Respuesta inesperada del servidor');
    return payload;
  };

  const loadProfile = async () => {
    setLoading(true);
    setErrMsg('');
    try {
      const ok = await pingApi();
      if (!ok) { setLoading(false); return; }

      const headers = { Accept: 'application/json', ...(await getAuthHeader()) };
      const res = await fetch(`${BASE}/api/me/profile`, { method: 'GET', headers });

      if (res.status === 401) {
        setErrMsg('Sesión expirada. Vuelve a iniciar sesión.');
        setData(null);
        return;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Perfil ${res.status} ${text?.slice(0,120)}`);
      }

      const payload = await parsePayload(res);
      setData(payload);
      setName(payload?.user?.name || '');
      setEmail(payload?.user?.email || '');
    } catch (e) {
      setErrMsg(e?.message?.toString?.() || 'Network Error');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProfile(); }, []);
  useFocusEffect(useCallback(() => { loadProfile(); }, []));

  const logout = async () => {
    await AsyncStorage.multiRemove(['token','user']);
    Alert.alert('Sesión cerrada');
    goToAccess();
  };

  const save = async () => {
    try {
      const body = {};
      if (name && data?.user && name !== data.user.name) body.name = name;
      if (email && data?.user && email !== data.user.email) body.email = email;
      if (password) body.password = password;
      if (Object.keys(body).length === 0) { Alert.alert('Nada que actualizar'); return; }

      const headers = { 'Content-Type':'application/json', ...(await getAuthHeader()) };
      const res = await fetch(`${BASE}/api/me/profile`, { method: 'PATCH', headers, body: JSON.stringify(body) });

      if (res.status === 401) { setErrMsg('Sesión expirada. Vuelve a iniciar sesión.'); return; }
      if (!res.ok) {
        const txt = await res.text().catch(()=> '');
        throw new Error(txt || `Error ${res.status}`);
      }
      Alert.alert('Perfil actualizado');
      setPassword(''); setEditing(false);
      await loadProfile();
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo actualizar');
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1,1],
        quality: 0.9
      });
      if (result.canceled) return;

      setUploading(true);
      const localUri = result.assets[0].uri;
      const headers = { ...(await getAuthHeader()) };
      const formData = new FormData();
      formData.append('avatar', { uri: localUri, type: 'image/jpeg', name: 'avatar.jpg' });

      const res = await fetch(`${BASE}/api/me/avatar`, { method: 'POST', headers, body: formData });
      if (res.status === 401) { setErrMsg('Sesión expirada. Vuelve a iniciar sesión.'); return; }
      if (!res.ok) {
        const txt = await res.text().catch(()=> '');
        throw new Error(txt || `Error ${res.status}`);
      }
      Alert.alert('Foto actualizada');
      await loadProfile();
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo subir imagen');
    } finally { setUploading(false); }
  };

  // ------- derivados
  const user = data?.user || null;
  const stats = data?.stats || {};
  const avatarUrl = user?.avatar_url ? (BASE + user.avatar_url) : null;

  const s = {
    matches_played: stats.matches_played ?? 0,
    goals: stats.goals ?? 0,
    assists: stats.assists ?? 0,
    mvps: stats.mvps ?? 0,
    teammate_rating: stats.teammate_rating ?? '—',
    matches_won: stats.matches_won ?? 0,
  };

  const STAT_ITEMS = useMemo(() => ([
    { key: 'matches_played', label: 'Partidos', value: s.matches_played, emoji: '🎯' },
    { key: 'goals', label: 'Goles', value: s.goals, emoji: '⚽️' },
    { key: 'assists', label: 'Asistencias', value: s.assists, emoji: '🅰️' },
    { key: 'mvps', label: 'MVPs', value: s.mvps, emoji: '🏆' },
    { key: 'teammate_rating', label: 'Nota comp.', value: s.teammate_rating, emoji: '⭐️' },
    { key: 'matches_won', label: 'Ganados', value: s.matches_won, emoji: '✅' },
  ]), [s]);

  if (loading) {
    return (
      <View style={styles.loader}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={ORANGE} />
      </View>
    );
  }

  if (!data) {
    const isSession = (errMsg || '').toLowerCase().includes('sesión');
    return (
      <View style={[styles.loader, { paddingHorizontal:24 }]}>
        <Text style={{ color:'#bbb', textAlign:'center', marginBottom:12 }}>
          {errMsg || 'No se pudo cargar el perfil'}
        </Text>
        <TouchableOpacity
          onPress={() => (isSession ? goToAccess() : loadProfile())}
          style={{ backgroundColor: ORANGE, padding:12, borderRadius:10, minWidth:180 }}
        >
          <Text style={{ color:'#000', fontWeight:'800', textAlign:'center' }}>
            {isSession ? 'Ir a iniciar sesión' : 'Reintentar'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex:1, backgroundColor: colors.black }}>
      <StatusBar barStyle="light-content" />
      <ImageBackground source={FIELD_BG} style={styles.bg} resizeMode="cover">
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(0,0,0,0.45)','rgba(0,0,0,0.9)']} style={StyleSheet.absoluteFill} />

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing(2),
            paddingTop: spacing(2),
            paddingBottom: spacing(6),
          }}
        >
          <Text style={styles.title}>Mi Perfil</Text>

          {/* Avatar simple */}
          <View style={styles.avatarWrapper}>
            <TouchableOpacity onPress={pickImage} disabled={uploading} activeOpacity={0.85}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>
                    {(user?.name || 'Jugador')[0].toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.tapHint}>
              {uploading ? 'Subiendo foto...' : 'Toca la foto para cambiarla'}
            </Text>
          </View>

          {/* Panel info */}
          <View style={styles.panel}>
            {editing ? (
              <>
                <Text style={styles.label}>Nombre</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Tu nombre" placeholderTextColor="#777" />
                <Text style={styles.label}>Email</Text>
                <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="correo@ejemplo.com" placeholderTextColor="#777" />
                <Text style={styles.label}>Contraseña</Text>
                <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor="#777" />
                <View style={{ flexDirection:'row', gap:10, marginTop: spacing(1.5) }}>
                  <TouchableOpacity style={styles.saveBtn} onPress={save}><Text style={styles.saveText}>Guardar</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditing(false); setPassword(''); }}><Text style={styles.cancelText}>Cancelar</Text></TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.name}>{user?.name}</Text>
                <Text style={styles.email}>{user?.email}</Text>
                <Text style={styles.meta}>Rol: {user?.role || 'jugador'}</Text>
                <Text style={styles.meta}>Registrado: {new Date(user?.created_at).toLocaleDateString()}</Text>
                <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}><Text style={styles.editText}>Editar perfil</Text></TouchableOpacity>
              </>
            )}
          </View>

          {/* Stats */}
          <View style={styles.statsCard}>
            <Text style={styles.section}>📊 Estadísticas</Text>
            <View style={styles.grid}>
              {STAT_ITEMS.map(item => (
                <View key={item.key} style={styles.gridItem}>
                  <Text style={styles.gridValue}>{item.value}</Text>
                  <Text style={styles.gridLabel}>{item.emoji} {item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </ScrollView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  loader:{ flex:1, backgroundColor:'#000', alignItems:'center', justifyContent:'center' },
  bg:{ flex:1 },
  title:{ color:'#fff', fontSize:22, fontWeight:'800', textAlign:'center', marginBottom: spacing(1) },
  tapHint:{ color:'#bbb', fontSize:12, marginTop:8 },

  avatarWrapper: {
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  avatarImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: ORANGE,
    backgroundColor: '#111',
  },
  avatarPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: ORANGE,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '900',
  },

  panel:{ backgroundColor:'rgba(17,17,17,0.9)', borderRadius:16, padding: spacing(2), borderWidth:1, borderColor:'rgba(255,255,255,0.06)', marginBottom: spacing(2) },

  name:{ color:'#fff', fontSize:18, fontWeight:'800', marginBottom:2 },
  email:{ color:'#bbb', fontSize:13, marginBottom:4 },
  meta:{ color:'#999', fontSize:12, marginBottom:2 },
  label:{ color:'#ddd', fontWeight:'700', marginTop: spacing(0.5), marginBottom:4 },
  input:{ backgroundColor:'#1f1f1f', color:'#fff', padding: spacing(1.2), borderRadius:12, borderWidth:1, borderColor:'rgba(255,255,255,0.06)', marginBottom: spacing(1) },
  editBtn:{ backgroundColor:'#2a2a2a', padding: spacing(1.4), borderRadius:12, marginTop: spacing(1.5) },
  editText:{ color:'#fff', fontWeight:'800', textAlign:'center' },
  saveBtn:{ flex:1, backgroundColor: ORANGE, padding: spacing(1.4), borderRadius:12 },
  saveText:{ color:'#000', fontWeight:'900', textAlign:'center' },
  cancelBtn:{ flex:1, backgroundColor:'#333', padding: spacing(1.4), borderRadius:12 },
  cancelText:{ color:'#fff', fontWeight:'800', textAlign:'center' },

  statsCard:{ backgroundColor:'rgba(17,17,17,0.92)', borderRadius:16, padding: spacing(2), borderWidth:1, borderColor:'rgba(255,255,255,0.06)' },
  section:{ color: ORANGE, fontWeight:'800', marginBottom:10, fontSize:14 },
  grid:{ flexDirection:'row', flexWrap:'wrap', columnGap:10, rowGap:10, justifyContent:'space-between' },
  gridItem:{ width:'48%', backgroundColor:'#121212', borderRadius:14, paddingVertical:14, paddingHorizontal:12, borderWidth:1, borderColor:'rgba(255,255,255,0.05)' },
  gridValue:{ color:'#fff', fontSize:20, fontWeight:'900', marginBottom:4 },
  gridLabel:{ color:'#bdbdbd', fontSize:12, fontWeight:'700' },

  logoutBtn:{ backgroundColor: ORANGE, padding: spacing(1.5), borderRadius:12, marginTop: spacing(2) },
  logoutText:{ color:'#000', fontWeight:'900', textAlign:'center' },
});