// src/screens/HomeScreen.js
import { View, Text, StyleSheet, StatusBar, TouchableOpacity, ImageBackground, Image, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { spacing } from '../theme';
import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Importa el controlador para abrir el menú
import { menuController } from '../../App';

const ORANGE = '#ff5a00';

// ✅ Logo en assets/ en la raíz del proyecto
const APP_LOGO = require('../../assets/Logo.png');

const WORLD_CUP_SCREEN_BG = {
  uri: 'https://easyfutbol.es/wp-content/uploads/2026/05/posible-fondo-1.png',
};

const BG = {
  myMatches: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2024/10/siluetas-futbol-7.jpeg',
  },
  worldCup: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2025/02/grass-2616911_1280.jpg',
  },
  tournament: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2025/02/grass-2616911_1280.jpg',
  },
  upcoming: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2025/01/Imagen-eventos_1.avif',
  },
  stats: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2025/02/Registro-8-scaled.jpeg',
  },
  easyPass: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2025/02/imagen-registro-2-scaled.jpeg',
  },
  adminCreate: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2025/02/grass-2616911_1280.jpg',
  },
};

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [isLogged, setIsLogged] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatar, setAvatar] = useState(null);
  const [displayName, setDisplayName] = useState('');

  const requireAuth = (targetScreen) => {
    if (isLogged) {
      navigation.navigate(targetScreen);
      return;
    }

    Alert.alert(
      'Acceso restringido',
      'Inicia sesión o regístrate para acceder a esta sección.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Iniciar sesión / Registrarme', onPress: () => navigation.navigate('Access') },
      ]
    );
  };

  const readSession = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const rawUser = await AsyncStorage.getItem('user');
      const u = rawUser ? JSON.parse(rawUser) : {};

      console.log('USER EN HOMESCREEN:', u);

      const adminFlag =
        u?.role === 'admin' ||
        u?.role === 'ADMIN' ||
        u?.is_admin === true ||
        u?.is_admin === 1 ||
        u?.is_admin === '1';

      console.log('¿ES ADMIN?:', adminFlag);

      setIsLogged(!!token);
      setIsAdmin(adminFlag);
      setAvatar(u?.avatar_url || u?.avatar || null);
      setDisplayName(u?.username || u?.name || '');
    } catch (err) {
      console.log('Error leyendo sesión en HomeScreen:', err);
      setIsLogged(false);
      setIsAdmin(false);
      setAvatar(null);
      setDisplayName('');
    }
  }, []);

  useEffect(() => {
    readSession();
  }, [readSession]);

  const onPressAvatar = () => menuController.open?.();
  const onLongPressAvatar = () => navigation.navigate(isLogged ? 'Profile' : 'Access');

  const SectionCard = ({ title, bgSource, onPress, children }) => (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.sectionWrapper}>
      <ImageBackground source={bgSource} style={styles.bg} imageStyle={styles.bgImage}>
        <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFillObject} />
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.25)']}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.sectionContent}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {children}
          <View style={styles.cta}>
            <Text style={styles.ctaText}>VER MÁS</Text>
          </View>
        </View>
      </ImageBackground>
    </TouchableOpacity>
  );

  return (
    <ImageBackground
      source={WORLD_CUP_SCREEN_BG}
      style={styles.container}
      imageStyle={styles.worldCupBgImage}
    >
      <LinearGradient
        colors={['rgba(0,0,0,0.88)', 'rgba(0,0,0,0.76)', 'rgba(0,0,0,0.92)']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

        <LinearGradient
          colors={['rgba(255,90,0,0.12)', 'rgba(255,90,0,0)']}
          style={styles.glow}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.3, y: 0.7 }}
        />

        <View style={[styles.topBar, { paddingTop: spacing(1) + insets.top * 0 }]}> 
          <View style={styles.leftBlock}>
            <Image source={APP_LOGO} style={styles.appLogo} />
            <Text numberOfLines={1} style={styles.username}>
              {displayName || 'Usuario'}
            </Text>
          </View>

          <TouchableOpacity
            onPress={onPressAvatar}
            onLongPress={onLongPressAvatar}
            style={styles.avatarWrap}
            accessibilityLabel="Abrir menú / Perfil"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>{(displayName || 'U').charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.stack}>
          {isAdmin && (
            <SectionCard
              title="Crear partido"
              bgSource={BG.adminCreate}
              onPress={() => navigation.navigate('AdminCreateMatch')}
            >
              <Text style={styles.sectionDescription}>
                Publica nuevos partidos de EasyFutbol desde la app (solo administradores).
              </Text>
            </SectionCard>
          )}

          <SectionCard
            title="🏆 Torneo EasyFutbol"
            bgSource={BG.tournament}
            onPress={() => requireAuth('HomeTournament')}
          >
            <Text style={styles.sectionDescription}>
              25 de julio · 19:00 a 23:00 · camiseta oficial, partidos grabados, premios y consumición en La Herminia.
            </Text>
          </SectionCard>

          <SectionCard
            title="Próximos partidos"
            bgSource={BG.upcoming}
            onPress={() => requireAuth('Matchs')}
          />

          <SectionCard
            title="Mis partidos"
            bgSource={BG.myMatches}
            onPress={() => requireAuth('MisPartidos')}
          >
            <Text style={styles.sectionDescription}>
              Consulta tus partidos inscritos, camiseta, ubicación, hora e información importante antes de jugar.
            </Text>
          </SectionCard>

          <SectionCard
            title="Mis entradas"
            bgSource={BG.myMatches}
            onPress={() => requireAuth('MyMatches')}
          >
            <Text style={styles.sectionDescription}>
              Revisa tus entradas compradas y el estado de tus reservas.
            </Text>
          </SectionCard>

          <SectionCard
            title="Mundial EasyFutbol"
            bgSource={BG.worldCup}
            onPress={() => navigation.navigate('WorldCup')}
          >
            <Text style={styles.sectionDescription}>
              Elige tu selección, suma puntos con tus goles, asistencias, MVP y victorias, y compite por el ranking del Mundial.
            </Text>
          </SectionCard>

          <SectionCard
            title="Estadísticas"
            bgSource={BG.stats}
            onPress={() => navigation.navigate('Stats')}
          >
            <Text style={styles.sectionDescription}>
              Consulta tus goles, asistencias, MVP y rankings completos.
            </Text>
          </SectionCard>

          <SectionCard
            title="EasyPass"
            bgSource={BG.easyPass}
            onPress={() => requireAuth('EasyPass')}
          >
            <Text style={styles.sectionDescription}>
              Compra packs de EasyPass y reserva tus partidos más rápido.
            </Text>
          </SectionCard>

          <View style={{ height: spacing(4) }} />
        </ScrollView>
      </LinearGradient>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  worldCupBgImage: {
    resizeMode: 'cover',
    opacity: 0.9,
  },
  glow: {
    position: 'absolute',
    right: -80,
    top: -40,
    width: 260,
    height: 260,
    borderRadius: 260,
  },
  topBar: {
    paddingHorizontal: spacing(2),
    paddingBottom: spacing(1),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  appLogo: { width: 28, height: 28, borderRadius: 6 },
  username: { color: '#fff', fontSize: 18, fontWeight: '800', maxWidth: 220 },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: ORANGE,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: {
    flex: 1,
    backgroundColor: '#0f1114',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: '#fff', fontWeight: '800', fontSize: 16 },
  stack: {
    paddingHorizontal: spacing(2),
    paddingTop: spacing(0.5),
    paddingBottom: spacing(2),
    gap: 14,
  },
  sectionWrapper: { width: '100%' },
  bg: {
    width: '100%',
    minHeight: 140,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  bgImage: { resizeMode: 'cover' },
  sectionContent: { padding: 16, gap: 10 },
  sectionTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sectionDescription: { color: '#fff', fontSize: 13, opacity: 0.9 },
  cta: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  ctaText: { color: '#fff', fontWeight: '800', letterSpacing: 0.4 },
});
