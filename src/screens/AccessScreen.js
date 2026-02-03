// src/screens/AccessScreen.js
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  ImageBackground, StatusBar, Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client'; // <- para leer baseURL
import { signInWithGoogle } from '../services/googleAuth';

const ORANGE = '#ff5a00';
const BG_IMG = { uri: 'https://images.unsplash.com/photo-1517747614396-d21a78b850e8?q=80&w=1200&auto=format' };
const APP_LOGO = require('../../assets/Logo.png');

export default function AccessScreen({ navigation }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const BASE = (api?.defaults?.baseURL || '').replace(/\/+$/, '');

  // Helper: POST JSON intentando varias rutas posibles del backend
  async function postFirstAvailable(paths, body) {
    let lastErr;
    for (const p of paths) {
      try {
        const res = await fetch(`${BASE}${p}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          // si la ruta no existe (404) probamos la siguiente
          if (res.status === 404) { lastErr = new Error(`404 ${p}`); continue; }
          throw new Error(json?.msg || `${p} ${res.status}`);
        }
        return json;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('No se pudo contactar con la API');
  }

  // Normaliza el shape de respuesta y devuelve { token, user }
  function pickAuthData(json) {
    const root = json?.data ?? json ?? {};
    const user =
      root.user ||
      json?.user ||
      {};
    const token =
      root.access_token || root.token || root.jwt ||
      user?.access_token || user?.token || user?.jwt ||
      null;

    return { token, user };
  }

  async function handleAuth() {
    if (!email || !password || (mode === 'register' && !name)) {
      Alert.alert('Completa los datos');
      return;
    }
    setLoading(true);
    try {
      const paths =
        mode === 'login'
          ? ['/api/login', '/api/auth/login']
          : ['/api/register', '/api/auth/register'];

      const payload =
        mode === 'login'
          ? { email, password }
          : { name, email, password };

      const json = await postFirstAvailable(paths, payload);
      const { token, user } = pickAuthData(json);

      if (!token) throw new Error('La API no devolvió token');

      // Guarda SIEMPRE token como string plano
      await AsyncStorage.setItem('token', String(token));
      await AsyncStorage.setItem('user', JSON.stringify(user || {}));

      // Navega a Home
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    try {
      setLoading(true);

      // 1) Abrir Google y obtener idToken
      const idToken = await signInWithGoogle();

      // 2) Llamar a tu backend con ese idToken
      const json = await postFirstAvailable(['/api/auth/google'], { idToken });

      // 3) Normalizar respuesta igual que en login normal
      const { token, user } = pickAuthData(json);

      if (!token) {
        throw new Error('La API no devolvió token');
      }

      // 4) Guardar token y user
      await AsyncStorage.setItem('token', String(token));
      await AsyncStorage.setItem('user', JSON.stringify(user || {}));

      // 5) Ir a Home y resetear navegación
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (e) {
      console.log('Error Google login:', e?.message);
      Alert.alert('Error', e?.message || 'No se pudo iniciar sesión con Google');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ImageBackground source={BG_IMG} style={styles.bg} resizeMode="cover">
      <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <View style={styles.container}>
        <Image source={APP_LOGO} style={styles.logo} />
        <Text style={styles.title}>EasyFutbol</Text>
        <Text style={styles.subtitle}>
          {mode === 'login' ? 'Inicia sesión para jugar' : 'Crea tu cuenta en segundos'}
        </Text>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            onPress={() => setMode('login')}
            style={[styles.toggleBtn, mode === 'login' && styles.toggleActive]}
          >
            <Text style={[styles.toggleText, mode === 'login' && styles.toggleTextActive]}>Entrar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMode('register')}
            style={[styles.toggleBtn, mode === 'register' && styles.toggleActive]}
          >
            <Text style={[styles.toggleText, mode === 'register' && styles.toggleTextActive]}>Registrarse</Text>
          </TouchableOpacity>
        </View>

        {mode === 'register' && (
          <TextInput
            style={styles.input}
            placeholder="Nombre y apellidos"
            placeholderTextColor="#aaa"
            value={name}
            onChangeText={setName}
          />
        )}
        <TextInput
          style={styles.input}
          placeholder="Correo electrónico"
          placeholderTextColor="#aaa"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#aaa"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity style={[styles.primaryBtn, loading && { opacity: 0.7 }]} onPress={handleAuth} disabled={loading}>
          <Text style={styles.primaryText}>
            {loading ? 'Procesando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.or}>o</Text>

        <TouchableOpacity
          style={[styles.googleBtn, loading && { opacity: 0.7 }]}
          onPress={handleGoogle}
          disabled={loading}
        >
          <Image
            source={{
              uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Google_%22G%22_Logo.svg/512px-Google_%22G%22_Logo.svg.png',
            }}
            style={{ width: 18, height: 18, marginRight: 8 }}
          />
          <Text style={styles.googleText}>Continuar con Google</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  logo: { width: 80, height: 80, marginBottom: 10 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#ccc', marginBottom: 20 },
  toggleRow: { flexDirection: 'row', marginBottom: 20, width: '100%' },
  toggleBtn: {
    flex: 1, paddingVertical: 10, marginHorizontal: 5, borderRadius: 12,
    borderWidth: 1, borderColor: '#444', alignItems: 'center',
  },
  toggleActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  toggleText: { color: '#ccc', fontWeight: '700' },
  toggleTextActive: { color: '#000' },
  input: {
    width: '100%', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
    padding: 12, color: '#fff', marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 14,
    paddingHorizontal: 24, width: '100%', marginTop: 10, alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700' },
  or: { color: '#ccc', marginVertical: 16 },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#111',
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20,
  },
  googleText: { color: '#fff', fontWeight: '700' },
});
