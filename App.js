// App.js
import React, { useEffect, useState } from 'react';
import {
  Platform,
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import {
  NavigationContainer,
  DefaultTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './src/api/client';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import AccessScreen from './src/screens/AccessScreen';
import MatchScreen from './src/screens/MatchScreen';
import MatchsScreen from './src/screens/MatchsScreen';
import MyMatchesScreen from './src/screens/MyMatchesScreen';
import StatsScreen from './src/screens/StatsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AdminCreateMatchScreen from './src/screens/AdminCreateMatchScreen';
import AdminMatchStatsScreen from './src/screens/AdminMatchStatsScreen';
import AdminNotifyScreen from './src/screens/AdminNotifyScreen';

// Notificaciones (opcional)
let Notifications = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {}

const Stack = createNativeStackNavigator();
const ORANGE = '#ff5a00';

// Tema oscuro sin barra superior por defecto
const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: '#0b0b0d' },
};

// === Navigation Ref para navegar desde fuera de las screens ===
export const navigationRef = createNavigationContainerRef();

// === Controlador global para abrir/cerrar el menú desde cualquier screen ===
export const menuController = { open: () => {}, close: () => {} };

function VerifyEmailScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const extraTop = 8;

  const emailFromRoute = route?.params?.email || '';
  const [email, setEmail] = useState(String(emailFromRoute));
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  // Mantén el prefijo /api si tu backend está montado bajo /api
  const BASE = (api?.defaults?.baseURL || '').replace(/\/+$/, '');

  const submitVerify = async () => {
    try {
      const em = String(email || '').trim().toLowerCase();
      const c = String(code || '').trim();
      if (!em) throw new Error('Introduce tu email');
      if (!c) throw new Error('Introduce el código');

      setLoading(true);
      const res = await fetch(`${BASE}/auth/email/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email: em, code: c }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.msg || json?.message || `Error API: ${res.status}`);
      }

      navigation.navigate('Access', { prefill: { identifier: em } });
    } catch (e) {
      console.log('verify email error:', e?.message);
      // eslint-disable-next-line no-alert
      alert(e?.message || 'No se pudo verificar');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      const em = String(email || '').trim().toLowerCase();
      if (!em) throw new Error('Introduce tu email');

      setLoading(true);
      const res = await fetch(`${BASE}/auth/email/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email: em }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.msg || json?.message || `Error API: ${res.status}`);
      }

      // eslint-disable-next-line no-alert
      alert('Código reenviado. Mira tu correo.');
    } catch (e) {
      console.log('resend email error:', e?.message);
      // eslint-disable-next-line no-alert
      alert(e?.message || 'No se pudo reenviar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 20,
          paddingTop: (insets.top || (Platform.OS === 'android' ? 24 : 0)) + extraTop,
          justifyContent: 'center',
          backgroundColor: '#0b0b0d',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 8 }}>
          Verifica tu correo
        </Text>
        <Text style={{ color: '#bbb', marginBottom: 18 }}>
          Te hemos enviado un código de 6 dígitos. Introdúcelo para poder apuntarte y pagar.
        </Text>

        <Text style={{ color: '#ccc', marginBottom: 6 }}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="correo@ejemplo.com"
          placeholderTextColor="#777"
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
          style={{
            backgroundColor: '#111',
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 14,
            color: '#fff',
            marginBottom: 12,
          }}
        />

        <Text style={{ color: '#ccc', marginBottom: 6 }}>Código</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor="#777"
          keyboardType="number-pad"
          editable={!loading}
          style={{
            backgroundColor: '#111',
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 14,
            color: '#fff',
          }}
        />

        <TouchableOpacity
          onPress={submitVerify}
          disabled={loading}
          style={{
            marginTop: 16,
            backgroundColor: ORANGE,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
            opacity: loading ? 0.7 : 1,
          }}
        >
          <Text style={{ color: '#000', fontWeight: '900', fontSize: 16 }}>
            {loading ? 'Verificando...' : 'Verificar'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={resend}
          disabled={loading}
          style={{
            marginTop: 10,
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
            opacity: loading ? 0.7 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>Reenviar código</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('Access', { prefill: { identifier: email } })}
          disabled={loading}
          style={{ marginTop: 14, alignItems: 'center' }}
        >
          <Text style={{ color: '#bbb' }}>Volver a iniciar sesión</Text>
        </TouchableOpacity>
      </View>
    </TouchableWithoutFeedback>
  );
}

// --- Botón + Menú hamburguesa persistente (arriba derecha) ---
function AppMenu({ currentRouteName }) {
  const insets = useSafeAreaInsets();

  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLogged, setIsLogged] = useState(false);

  // Exponer controlador global
  useEffect(() => {
    menuController.open = () => setOpen(true);
    menuController.close = () => setOpen(false);
    return () => {
      menuController.open = () => {};
      menuController.close = () => {};
    };
  }, []);

  // Carga/refresh de sesión
  const refreshAuth = async () => {
    try {
      const raw = await AsyncStorage.getItem('user');
      if (!raw) {
        setIsLogged(false);
        setIsAdmin(false);
        return;
      }
      const user = JSON.parse(raw);
      const admin =
        user?.role === 'admin' ||
        user?.is_admin === true ||
        (Array.isArray(user?.permissions) && user.permissions.includes('admin'));
      setIsLogged(true);
      setIsAdmin(!!admin);
    } catch {
      setIsLogged(false);
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    refreshAuth();
  }, [currentRouteName]); // refresca al cambiar de ruta

  // En Access y VerifyEmail no mostramos ni botón ni modal
  if (currentRouteName === 'Access' || currentRouteName === 'VerifyEmail') return null;

  const baseItems = [
    { label: 'Inicio', screen: 'Home' },
    { label: 'Partidos', screen: 'Matchs' },
    { label: 'Mis Partidos', screen: 'MyMatches' },
    { label: 'Estadísticas', screen: 'Stats' },
    { label: 'Perfil', screen: 'Profile' },
  ];

  const adminItems = [
    { label: 'Crear Partido (Admin)', screen: 'AdminCreateMatch' },
    { label: 'Stats Partido (Admin)', screen: 'AdminMatchStats' },
    { label: 'Avisos (Admin)', screen: 'AdminNotify' },
  ];

  const goTo = (screen) => {
    setOpen(false);
    if (navigationRef.isReady()) {
      navigationRef.navigate(screen);
    }
  };

  return (
    <>
      {/* Botón flotante: oculto en Home para que no tape el avatar */}
      {currentRouteName !== 'Home' && (
        <View
          pointerEvents="box-none"
          style={[
            styles.menuBtnWrapper,
            { top: (insets.top || (Platform.OS === 'android' ? 24 : 0)) + 8 },
          ]}
        >
          <TouchableOpacity
            accessibilityLabel="Abrir menú de navegación"
            onPress={() => setOpen(true)}
            style={styles.menuBtn}
            activeOpacity={0.85}
          >
            <View style={styles.bar} />
            <View style={[styles.bar, { width: 14 }]} />
            <View style={[styles.bar, { width: 10 }]} />
          </TouchableOpacity>
        </View>
      )}

      {/* Modal del menú (se puede abrir también desde el avatar de Home) */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.panel,
              { marginTop: (insets.top || (Platform.OS === 'android' ? 24 : 0)) + 8 },
            ]}
          >
            <Text style={styles.panelTitle}>Navegación</Text>

            {baseItems.map((it) => (
              <Pressable key={it.screen} onPress={() => goTo(it.screen)} style={styles.item}>
                <Text style={styles.itemText}>{it.label}</Text>
              </Pressable>
            ))}

            {isAdmin && (
              <>
                <View style={styles.sectionTag}>
                  <Text style={styles.sectionTagText}>ADMIN</Text>
                </View>
                {adminItems.map((it) => (
                  <Pressable key={it.screen} onPress={() => goTo(it.screen)} style={styles.item}>
                    <Text style={styles.itemText}>{it.label}</Text>
                  </Pressable>
                ))}
              </>
            )}

            <View style={styles.divider} />
            {!isLogged && (
              <Pressable onPress={() => goTo('Access')} style={styles.item}>
                <Text style={styles.itemText}>Iniciar sesión / Acceso</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function AppShell({ currentRouteName }) {
  const insets = useSafeAreaInsets();
  const extraTop = 8;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: '#0b0b0d',
            paddingTop: (insets.top || (Platform.OS === 'android' ? 24 : 0)) + extraTop,
          },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Access" component={AccessScreen} />
        <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
        <Stack.Screen name="Match" component={MatchScreen} />
        <Stack.Screen name="Matchs" component={MatchsScreen} />
        <Stack.Screen name="MyMatches" component={MyMatchesScreen} />
        <Stack.Screen name="Stats" component={StatsScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="AdminCreateMatch" component={AdminCreateMatchScreen} />
        <Stack.Screen name="AdminMatchStats" component={AdminMatchStatsScreen} />
        <Stack.Screen name="AdminNotify" component={AdminNotifyScreen} />
      </Stack.Navigator>

      <AppMenu currentRouteName={currentRouteName} />
    </View>
  );
}

export default function App() {
  const [currentRouteName, setCurrentRouteName] = useState(null);

  useEffect(() => {
    if (!Notifications) return;
    const subReceived = Notifications.addNotificationReceivedListener(() => {});
    const subResponse = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data || {};
      // navegar según data
    });
    return () => {
      subReceived?.remove?.();
      subResponse?.remove?.();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer
        theme={navTheme}
        ref={navigationRef}
        onReady={() => {
          const route = navigationRef.getCurrentRoute();
          setCurrentRouteName(route?.name ?? null);
        }}
        onStateChange={() => {
          const route = navigationRef.getCurrentRoute();
          setCurrentRouteName(route?.name ?? null);
        }}
      >
        <AppShell currentRouteName={currentRouteName} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  menuBtnWrapper: {
    position: 'absolute',
    right: 12,
    zIndex: 1000,
  },
  menuBtn: {
    width: 40,
    height: 40,
    backgroundColor: ORANGE,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  bar: {
    width: 18,
    height: 2,
    backgroundColor: '#0b0b0d',
    borderRadius: 2,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'flex-end',
  },
  panel: {
    width: 260,
    marginRight: 10,
    backgroundColor: '#131316',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  panelTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 6,
    opacity: 0.9,
  },
  sectionTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,90,0,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
    marginBottom: 2,
  },
  sectionTagText: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  item: {
    paddingVertical: 10,
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  itemText: {
    color: '#fff',
    fontSize: 16,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 8,
  },
});