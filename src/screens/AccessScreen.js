// src/screens/AccessScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Image,
  ImageBackground,
  StatusBar,
  Alert,
  TextInput,
  Keyboard,
} from 'react-native';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';

const BG_IMG = {
  uri: 'https://images.unsplash.com/photo-1517747614396-d21a78b850e8?q=80&w=1200&auto=format',
};
const APP_LOGO = require('../../assets/Logo.png');

export default function AccessScreen({ navigation, route }) {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('login'); // 'login' | 'register'

  // Login
  const [identifier, setIdentifier] = useState(''); // usuario o correo
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password
  const [showForgot, setShowForgot] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');

  useEffect(() => {
    const prefill = route?.params?.prefill;
    if (prefill?.identifier) {
      const v = String(prefill.identifier);
      setIdentifier(v);
      setForgotIdentifier(v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Register
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // baseURL del backend (api/client). Si termina en /api, lo normalizamos para no duplicar rutas.
  const BASE = (api?.defaults?.baseURL || '')
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');

  function isValidEmail(v) {
    const s = String(v || '').trim();
    // validación simple pero efectiva
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
  }

  function isValidPhone(v) {
    const digits = String(v || '').replace(/\D/g, '');
    // Acepta 9-15 dígitos (internacional)
    return digits.length >= 9 && digits.length <= 15;
  }

  function isStrongPassword(v) {
    const s = String(v || '');
    // Mínimo 6 caracteres, al menos 1 mayúscula y al menos 1 símbolo
    const hasMin = s.length >= 6;
    const hasUpper = /[A-ZÁÉÍÓÚÜÑ]/.test(s);
    const hasSymbol = /[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/.test(s);
    return hasMin && hasUpper && hasSymbol;
  }

  // Normaliza la respuesta de tu backend { token, user }
  function pickAuthData(json) {
    const root = json?.data ?? json ?? {};
    const user = root.user || json?.user || {};
    const token =
      root.access_token ||
      root.token ||
      root.jwt ||
      user?.access_token ||
      user?.token ||
      user?.jwt ||
      null;

    return { token, user };
  }

  async function persistSession(token, user) {
    await AsyncStorage.setItem('token', String(token));
    await AsyncStorage.setItem('user', JSON.stringify(user || {}));
  }

  async function postJsonWithFallback(paths, payload) {
    let lastJson = {};
    let lastStatus = 0;

    for (const p of paths) {
      const url = `${BASE}${p}`;
      console.log('POST =>', url);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      lastJson = json;
      lastStatus = res.status;

      // Si no es 404, ya tenemos respuesta válida (ok o error real)
      if (res.status !== 404) {
        return { res, json, url };
      }
    }

    // Si todos fueron 404, devolvemos el último intento
    return {
      res: { ok: false, status: lastStatus },
      json: lastJson,
      url: `${BASE}${paths[paths.length - 1]}`,
    };
  }

  async function handleLogin() {
    try {
      if (!BASE) throw new Error('No se ha configurado la URL de la API (baseURL).');

      const id = String(identifier || '').trim();
      if (!id) throw new Error('Introduce tu usuario o correo.');

      const pass = String(password || '');
      if (!pass) throw new Error('Introduce tu contraseña.');

      setLoading(true);

      // Endpoints posibles (según backend)
      const { res, json } = await postJsonWithFallback(
        ['/auth/login', '/api/auth/login', '/api/login'],
        {
          identifier: id,
          login: id,
          user: id,
          username: id,
          email: id,
          correo: id,
          password: pass,
          pass: pass,
          contrasena: pass,
          "contraseña": pass,
        }
      );

      // Si el email no está verificado, mandamos a la pantalla de verificación
      if (
        res.status === 403 &&
        (json?.code === 'EMAIL_NOT_VERIFIED' ||
          json?.message === 'EMAIL_NOT_VERIFIED' ||
          json?.msg?.toLowerCase?.().includes?.('verifica'))
      ) {
        const emailForVerify = isValidEmail(id) ? id : (json?.email || '');

        if (!emailForVerify) {
          Alert.alert(
            'Verifica tu correo',
            'Tu cuenta aún no está verificada. Inicia sesión usando tu correo electrónico para poder verificarla.'
          );
          return;
        }

        navigation.navigate('VerifyEmail', { email: emailForVerify });
        return;
      }

      if (!res.ok) {
        throw new Error(json?.msg || json?.message || `Error API: ${res.status}`);
      }

      const { token, user } = pickAuthData(json);
      if (!token) throw new Error('La API no devolvió token.');

      await persistSession(token, user);
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (e) {
      console.log('Error login:', e?.message);
      Alert.alert('Error', e?.message || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    try {
      if (!BASE) throw new Error('No se ha configurado la URL de la API (baseURL).');

      const id = String(forgotIdentifier || identifier || '').trim();
      if (!id) throw new Error('Introduce tu correo electrónico para recuperar la contraseña.');

      // Para restablecer, necesitamos el correo real
      if (!isValidEmail(id)) {
        throw new Error('Para restablecer la contraseña necesitas introducir tu correo electrónico.');
      }

      setLoading(true);

      const { res, json } = await postJsonWithFallback(
        ['/auth/password/forgot', '/api/auth/password/forgot', '/api/password/forgot'],
        {
          email: id,
          correo: id,
          identifier: id,
          login: id,
          username: id,
          user: id,
        }
      );

      if (!res.ok) {
        throw new Error(json?.msg || json?.message || `Error API: ${res.status}`);
      }

      setShowForgot(false);
      Alert.alert(
        'Revisa tu correo',
        'Si el email existe en EasyFutbol, te hemos enviado un enlace para restablecer la contraseña.'
      );
    } catch (e) {
      console.log('Error forgot password:', e?.message);
      Alert.alert('Error', e?.message || 'No se pudo enviar el correo de recuperación');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    try {
      if (!BASE) throw new Error('No se ha configurado la URL de la API (baseURL).');

      const u = String(username || '').trim();
      const em = String(email || '').trim();
      const ph = String(phone || '').trim();
      const pass = String(regPassword || '');
      const pass2 = String(confirmPassword || '');

      if (!u) throw new Error('Introduce un nombre de usuario.');
      if (!em) throw new Error('Introduce un correo electrónico.');
      if (!isValidEmail(em)) throw new Error('Introduce un correo electrónico válido.');
      if (!ph) throw new Error('Introduce un teléfono.');
      if (!isValidPhone(ph)) throw new Error('Introduce un teléfono válido (9-15 dígitos).');
      if (!isStrongPassword(pass)) {
        throw new Error('La contraseña debe tener mínimo 6 caracteres, 1 mayúscula y 1 símbolo.');
      }
      if (!pass2) throw new Error('Confirma tu contraseña.');
      if (pass !== pass2) throw new Error('Las contraseñas no coinciden.');

      setLoading(true);

      // Endpoints posibles (según backend)
      const { res, json } = await postJsonWithFallback(
        ['/auth/register', '/api/auth/register', '/api/register'],
        {
          username: u,
          user: u,
          nombre: u,
          name: u,
          email: em,
          phone: ph,
          telefono: ph,
          tel: ph,
          password: pass,
        }
      );

      // En el nuevo flujo, el backend puede pedir verificación de email (no devuelve token todavía)
      if (json?.needsEmailVerification) {
        navigation.navigate('VerifyEmail', { email: em });
        return;
      }

      if (!res.ok) {
        throw new Error(json?.msg || json?.message || `Error API: ${res.status}`);
      }

      const { token, user } = pickAuthData(json);

      // Si el backend devuelve token (caso legacy), iniciamos sesión.
      if (token) {
        await persistSession(token, user);
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
        return;
      }

      // Si no hay token, volvemos al login (el usuario deberá verificar su email)
      setMode('login');
      setIdentifier(em);
      Alert.alert('Revisa tu correo', 'Te hemos enviado un código para verificar tu email.');
    } catch (e) {
      console.log('Error registro:', e?.message);
      Alert.alert('Error', e?.message || 'No se pudo completar el registro');
    } finally {
      setLoading(false);
    }
  }

  const showLogin = mode === 'login';

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ImageBackground source={BG_IMG} style={styles.bg} resizeMode="cover">
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <View
        style={styles.container}
        onStartShouldSetResponder={() => true}
        onResponderRelease={Keyboard.dismiss}
      >
        <Image source={APP_LOGO} style={styles.logo} />
        <Text style={styles.title}>EasyFutbol</Text>

        <View style={styles.switchRow}>
          <TouchableOpacity
            style={[styles.switchBtn, showLogin && styles.switchBtnActive]}
            onPress={() => { setMode('login'); setShowForgot(false); }}
            disabled={loading}
          >
            <Text style={[styles.switchText, showLogin && styles.switchTextActive]}>Iniciar sesión</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.switchBtn, !showLogin && styles.switchBtnActive]}
            onPress={() => { setMode('register'); setShowForgot(false); }}
            disabled={loading}
          >
            <Text style={[styles.switchText, !showLogin && styles.switchTextActive]}>Registrarme</Text>
          </TouchableOpacity>
        </View>

        {showLogin ? (
          <View style={styles.form}>
            <Text style={styles.subtitle}>Usuario o correo (si no verificas, usa correo)</Text>
            <TextInput
              style={styles.input}
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="Usuario o correo"
              placeholderTextColor="#777"
              autoCapitalize="none"
              keyboardType="default"
              editable={!loading}
            />

            <Text style={[styles.subtitle, { marginTop: 10 }]}>Contraseña</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="Contraseña"
                placeholderTextColor="#777"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword(v => !v)}
                disabled={loading}
                accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              <Text style={styles.primaryText}>{loading ? 'Entrando...' : 'Entrar'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowForgot(v => !v)}
              disabled={loading}
              style={styles.forgotBtn}
            >
              <Text style={styles.forgotText}>¿Has olvidado tu contraseña?</Text>
            </TouchableOpacity>

            {showForgot && (
              <View style={styles.forgotBox}>
                <Text style={styles.forgotTitle}>Restablecer contraseña</Text>
                <TextInput
                  style={styles.input}
                  value={forgotIdentifier}
                  onChangeText={setForgotIdentifier}
                  placeholder="Tu correo electrónico"
                  placeholderTextColor="#777"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!loading}
                />

                <TouchableOpacity
                  style={[styles.secondaryBtn, loading && { opacity: 0.7 }]}
                  onPress={handleForgotPassword}
                  disabled={loading}
                >
                  <Text style={styles.secondaryText}>{loading ? 'Enviando...' : 'Enviar enlace'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.subtitle}>Usuario</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Nombre de usuario"
              placeholderTextColor="#777"
              autoCapitalize="none"
              editable={!loading}
            />

            <Text style={[styles.subtitle, { marginTop: 10 }]}>Correo electrónico</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="correo@ejemplo.com"
              placeholderTextColor="#777"
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
            />

            <Text style={[styles.subtitle, { marginTop: 10 }]}>Teléfono</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Ej: 600123123"
              placeholderTextColor="#777"
              keyboardType="phone-pad"
              editable={!loading}
            />

            <Text style={[styles.subtitle, { marginTop: 10 }]}>Contraseña</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={regPassword}
                onChangeText={setRegPassword}
                placeholder="Mínimo 6, 1 mayúscula y 1 símbolo"
                placeholderTextColor="#777"
                secureTextEntry={!showRegPassword}
                autoCapitalize="none"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowRegPassword(v => !v)}
                disabled={loading}
                accessibilityLabel={showRegPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <Text style={styles.eyeText}>{showRegPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.subtitle, { marginTop: 10 }]}>Confirmar contraseña</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repite la contraseña"
                placeholderTextColor="#777"
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowConfirmPassword(v => !v)}
                disabled={loading}
                accessibilityLabel={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <Text style={styles.eyeText}>{showConfirmPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
              onPress={handleRegister}
              disabled={loading}
            >
              <Text style={styles.primaryText}>{loading ? 'Creando...' : 'Crear cuenta'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      </ImageBackground>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  logo: { width: 80, height: 80, marginBottom: 10 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 14 },
  subtitle: { color: '#ccc', alignSelf: 'flex-start', marginBottom: 6 },

  switchRow: {
    flexDirection: 'row',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  switchBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  switchBtnActive: {
    backgroundColor: '#ff5a00',
  },
  switchText: {
    color: '#bbb',
    fontWeight: '800',
  },
  switchTextActive: {
    color: '#000',
  },

  form: {
    width: '100%',
    maxWidth: 420,
  },
  input: {
    width: '100%',
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#fff',
  },

  passwordRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    paddingRight: 44,
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    height: '100%',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  eyeText: {
    color: '#fff',
    fontSize: 18,
  },

  primaryBtn: {
    marginTop: 16,
    backgroundColor: '#ff5a00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 16,
  },
  forgotBtn: {
    marginTop: 10,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  forgotText: {
    color: '#ff5a00',
    fontWeight: '800',
  },
  forgotBox: {
    marginTop: 12,
    backgroundColor: '#0d0d0d',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  forgotTitle: {
    color: '#fff',
    fontWeight: '900',
    marginBottom: 8,
  },
  secondaryBtn: {
    marginTop: 12,
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff5a00',
  },
  secondaryText: {
    color: '#ff5a00',
    fontWeight: '900',
    fontSize: 16,
  }
});