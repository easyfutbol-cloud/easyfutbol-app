// src/screens/HomeScreen.js
import { View, Text, StyleSheet, StatusBar, TouchableOpacity, ImageBackground, Image, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { colors, spacing } from '../theme';
import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Importa el controlador para abrir el menú
import { menuController } from '../../App';

const ORANGE = '#ff5a00';

// ✅ Logo en assets/ en la raíz del proyecto
const APP_LOGO = require('../../assets/Logo.png');

// Imágenes de fondo (cámbialas por las tuyas: require(...) o URLs propias)
const BG = {
  myMatches: { uri: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?q=80&w=1200&auto=format' },
  upcoming:  { uri: 'https://images.unsplash.com/photo-1517747614396-d21a78b850e8?q=80&w=1200&auto=format' },
  stats:     { uri: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?q=80&w=1200&auto=format' },
  tournaments:{ uri:'https://images.unsplash.com/photo-1543322748-33df6d3db806?q=80&w=1200&auto=format' },
  adminCreate:{ uri:'https://images.unsplash.com/photo-1517927033932-b3d18e61fb3a?q=80&w=1200&auto=format' },
};

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [isLogged, setIsLogged]   = useState(false);
  const [isAdmin, setIsAdmin]     = useState(false);
  const [avatar, setAvatar]       = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [stats, setStats] = useState({ goals: null, assists: null, rank: null });

  const readSession = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const rawUser = await AsyncStorage.getItem('user');
      const u = rawUser ? JSON.parse(rawUser) : {};

      // Logs para depurar rol y datos de usuario
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
      const s = JSON.parse((await AsyncStorage.getItem('user_stats')) || '{}');
      setStats({
        goals: Number.isFinite(+s?.goals) ? +s.goals : null,
        assists: Number.isFinite(+s?.assists) ? +s.assists : null,
        rank: Number.isFinite(+s?.rank) ? +s.rank : null,
      });
    } catch (err) {
      console.log('Error leyendo sesión en HomeScreen:', err);
      setIsLogged(false);
      setIsAdmin(false);
      setAvatar(null);
      setDisplayName('');
      setStats({ goals: null, assists: null, rank: null });
    }
  }, []);

  useEffect(() => { readSession(); }, [readSession]);

  // Tocar avatar -> abre menú; long press -> perfil (si logueado) o acceso
  const onPressAvatar = () => menuController.open?.();
  const onLongPressAvatar = () => navigation.navigate(isLogged ? 'Profile' : 'Access');

  const StatChip = ({ label, value }) => (
    <View style={styles.statChip}>
      <Text style={styles.statValue}>{value ?? '—'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const SectionCard = ({ title, bgSource, onPress, children }) => (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.sectionWrapper}>
      <ImageBackground source={bgSource} style={styles.bg} imageStyle={styles.bgImage}>
        {/* blur + oscurecedor para contraste */}
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
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
    <LinearGradient
      colors={['#0b0b0d', '#121316', '#18191c']}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Glow naranja sutil */}
      <LinearGradient
        colors={['rgba(255,90,0,0.12)', 'rgba(255,90,0,0)']}
        style={styles.glow}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.3, y: 0.7 }}
      />

      {/* Top bar compacto: logo + username (izq) | avatar (dcha) */}
      <View style={[styles.topBar, { paddingTop: spacing(1) }]}>
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

      {/* 4 FILAS APILADAS */}
      <ScrollView contentContainerStyle={styles.stack}>
        {isAdmin && (
          <SectionCard
            title="Crear partido"
            bgSource={BG.adminCreate}
            onPress={() => navigation.navigate('AdminCreateMatch')}
          >
            <Text style={{ color: '#fff', fontSize: 13, opacity: 0.9 }}>
              Publica nuevos partidos de EasyFutbol desde la app (solo administradores).
            </Text>
          </SectionCard>
        )}
        <SectionCard
          title="Próximos partidos"
          bgSource={BG.upcoming}
          onPress={() => navigation.navigate('Matchs')}  // ajusta si tu ruta es distinta
        />
                <SectionCard
          title="Mis entradas"
          bgSource={BG.myMatches}
          onPress={() => navigation.navigate('MyMatches')}
        />
        <SectionCard
          title="Estadísticas"
          bgSource={BG.stats}
          onPress={() => navigation.navigate('Stats')}
        >
          <View style={styles.statsRow}>
            <StatChip label="Goles" value={stats.goals} />
            <StatChip label="Asist." value={stats.assists} />
            <StatChip label="Ranking" value={stats.rank} />
          </View>
        </SectionCard>
        <SectionCard
          title="Torneos"
          bgSource={BG.tournaments}
          onPress={() => navigation.navigate('Tournaments')} // ajusta si tu ruta es distinta
        />
        <View style={{ height: spacing(4) }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },

  glow: {
    position: 'absolute',
    right: -80, top: -40,
    width: 260, height: 260, borderRadius: 260,
  },

  // Top bar compacto
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
    width: 40, height: 40, borderRadius: 20,
    overflow: 'hidden', borderWidth: 2, borderColor: ORANGE,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: { flex: 1, backgroundColor: '#0f1114', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontWeight: '800', fontSize: 16 },

  // Stack
  stack: { paddingHorizontal: spacing(2), paddingTop: spacing(0.5), paddingBottom: spacing(2), gap: 14 },

  // Section card
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

  // CTA pill (fondo traslúcido pero texto blanco)
  cta: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  ctaText: { color: '#fff', fontWeight: '800', letterSpacing: 0.4 },

  // Stats chips
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  statChip: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  statValue: { color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'center' },
  statLabel: { color: '#fff', fontSize: 11, textAlign: 'center' }, // ← blanco
});
