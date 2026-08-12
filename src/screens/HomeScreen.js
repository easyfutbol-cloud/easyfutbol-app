import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  ImageBackground,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../api/client';
import SportsFeatureCard from '../components/SportsFeatureCard';
import { menuController } from '../navigation/menuController';
import { publishUnreadNotifications, subscribeUnreadNotifications } from '../utils/notificationEvents';
import { syncNotificationBadge } from '../utils/notifications';
import {
  colors,
  gradients,
  layout,
  radii,
  spacing,
  typography,
} from '../theme';

const APP_LOGO = require('../../assets/Logo.png');
const EASYPASS_LOGO = require('../../assets/easypass-logo.png');

const SCREEN_BACKGROUND = require('../../assets/matches/match-6.jpg');

const CARD_IMAGES = {
  myMatches: require('../../assets/matches/match-8.jpg'),
  tournament: { uri: 'https://easyfutbol.es/wp-content/uploads/2025/02/grass-2616911_1280.jpg' },
  upcoming: { uri: 'https://easyfutbol.es/wp-content/uploads/2025/01/Imagen-eventos_1.avif' },
  stats: { uri: 'https://easyfutbol.es/wp-content/uploads/2025/02/Registro-8-scaled.jpeg' },
  easyPass: { uri: 'https://easyfutbol.es/wp-content/uploads/2025/02/imagen-registro-2-scaled.jpeg' },
  adminCreate: { uri: 'https://easyfutbol.es/wp-content/uploads/2025/02/grass-2616911_1280.jpg' },
};

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const useTwoColumns = width >= 720;

  const [isLogged, setIsLogged] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatar, setAvatar] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [easyPassBalance, setEasyPassBalance] = useState(0);
  const [easyPassLoading, setEasyPassLoading] = useState(false);
  const [upcomingTournament, setUpcomingTournament] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const requireAuth = useCallback((targetScreen) => {
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
  }, [isLogged, navigation]);

  const readSession = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const rawUser = await AsyncStorage.getItem('user');
      const user = rawUser ? JSON.parse(rawUser) : {};
      const adminFlag =
        user?.role === 'admin' ||
        user?.role === 'ADMIN' ||
        user?.is_admin === true ||
        user?.is_admin === 1 ||
        user?.is_admin === '1';

      setIsLogged(Boolean(token));
      setIsAdmin(adminFlag);
      setAvatar(user?.avatar_url || user?.avatar || null);
      setDisplayName(user?.username || user?.name || '');

      if (token) {
        api.get('/social/notifications')
          .then(({ data }) => {
            const count = Math.max(0, Number(data?.unread_count) || 0);
            setUnreadNotifications(count);
            publishUnreadNotifications(count);
            syncNotificationBadge(count);
          })
          .catch(() => setUnreadNotifications(0));
        setEasyPassLoading(true);
        try {
          const response = await api.get('/me/credits');
          const payload = response?.data || {};
          setEasyPassBalance(Number(payload?.easyPassBalance ?? payload?.credits ?? 0) || 0);
        } catch (balanceError) {
          console.log('Error cargando saldo EasyPass en HomeScreen:', balanceError?.message);
          setEasyPassBalance(0);
        } finally {
          setEasyPassLoading(false);
        }
      } else {
        setUnreadNotifications(0);
        setEasyPassBalance(0);
        setEasyPassLoading(false);
      }
    } catch (error) {
      console.log('Error leyendo sesión en HomeScreen:', error);
      setIsLogged(false);
      setIsAdmin(false);
      setAvatar(null);
      setDisplayName('');
      setEasyPassBalance(0);
      setUnreadNotifications(0);
      setEasyPassLoading(false);
    }
  }, []);

  useEffect(() => subscribeUnreadNotifications(setUnreadNotifications), []);

  useFocusEffect(
    useCallback(() => {
      readSession();
      let active = true;

      api.get('/tournaments')
        .then((response) => {
          if (!active) return;
          const payload = response?.data;
          const tournaments = Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload)
            ? payload
            : [];
          const nextTournament = tournaments
            .filter((tournament) => {
              if (tournament?.status === 'finished' || !tournament?.date) return false;
              const date = new Date(tournament.date);
              if (Number.isNaN(date.getTime())) return false;
              date.setHours(23, 59, 59, 999);
              return date.getTime() >= Date.now();
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] || null;
          setUpcomingTournament(nextTournament);
        })
        .catch((error) => {
          console.log('Error cargando torneo destacado en HomeScreen:', error?.message || error);
          if (active) setUpcomingTournament(null);
        });

      return () => {
        active = false;
      };
    }, [readSession])
  );

  const tournamentDescription = upcomingTournament
    ? `${new Date(upcomingTournament.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} · ${new Date(upcomingTournament.date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}${upcomingTournament.city ? ` · ${upcomingTournament.city}` : ''}`
    : '';

  const cards = [
    ...(upcomingTournament ? [{
      key: 'tournament',
      title: upcomingTournament.title || 'Torneo EasyFutbol',
      eyebrow: 'EVENTO DESTACADO',
      description: tournamentDescription,
      imageSource: CARD_IMAGES.tournament,
      onPress: () => requireAuth('HomeTournament'),
      accent: true,
    }] : []),
    {
      key: 'upcoming',
      title: 'Próximos partidos',
      eyebrow: 'JUEGA ESTA SEMANA',
      description: 'Encuentra tu próximo partido y reserva tu plaza.',
      imageSource: CARD_IMAGES.upcoming,
      onPress: () => requireAuth('Matchs'),
    },
    {
      key: 'myMatches',
      title: 'Mis partidos',
      eyebrow: 'TU AGENDA',
      description: 'Consulta camiseta, ubicación, hora e información importante antes de jugar.',
      imageSource: CARD_IMAGES.myMatches,
      onPress: () => requireAuth('MisPartidos'),
    },
    {
      key: 'stats',
      title: 'Estadísticas',
      eyebrow: 'TU RENDIMIENTO',
      description: 'Consulta tus goles, asistencias, MVP y rankings completos.',
      imageSource: CARD_IMAGES.stats,
      onPress: () => navigation.navigate('Stats'),
    },
    {
      key: 'easyPass',
      title: 'EasyPass',
      eyebrow: 'JUEGA MÁS',
      description: 'Compra packs de EasyPass y reserva tus partidos más rápido.',
      imageSource: CARD_IMAGES.easyPass,
      onPress: () => requireAuth('EasyPass'),
      accent: true,
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <ImageBackground source={SCREEN_BACKGROUND} style={StyleSheet.absoluteFill} imageStyle={styles.backgroundImage}>
        <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      </ImageBackground>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: spacing(1),
            paddingBottom: Math.max(insets.bottom, spacing(2)) + spacing(3),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentBoundary}>
          <View style={styles.topBar}>
            <View style={styles.brand}>
              <Image source={APP_LOGO} style={styles.logo} resizeMode="cover" />
              <View style={styles.brandCopy}>
                <Text style={styles.brandName}>EASYFUTBOL</Text>
                <Text numberOfLines={1} style={styles.userName}>
                  {isLogged ? `Hola, ${displayName || 'jugador'}` : 'Fútbol para todos'}
                </Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              {isLogged ? (
                <TouchableOpacity
                  onPress={() => navigation.navigate('Notifications')}
                  style={styles.notificationButton}
                  accessibilityRole="button"
                  accessibilityLabel={`${unreadNotifications} notificaciones sin leer`}
                >
                  <Ionicons name={unreadNotifications ? 'notifications' : 'notifications-outline'} size={22} color={colors.white} />
                  {unreadNotifications > 0 ? (
                    <View style={[styles.notificationBadge, unreadNotifications > 10 && styles.notificationBadgeWide]}>
                      <Text style={styles.notificationBadgeText}>{unreadNotifications > 10 ? '+10' : unreadNotifications}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                onPress={() => requireAuth('EasyPass')}
                style={styles.balanceButton}
                accessibilityRole="button"
                accessibilityLabel={isLogged ? `${easyPassBalance} EasyPass disponibles` : 'Consultar EasyPass'}
              >
                <Text style={styles.balanceValue}>{easyPassLoading ? '…' : easyPassBalance}</Text>
                <Image source={EASYPASS_LOGO} style={styles.balanceLogo} resizeMode="contain" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => menuController.open?.()}
                onLongPress={() => navigation.navigate(isLogged ? 'Profile' : 'Access')}
                style={styles.avatarButton}
                accessibilityRole="button"
                accessibilityLabel="Abrir menú"
                accessibilityHint="Mantén pulsado para abrir tu perfil"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitial}>
                    {(displayName || 'E').charAt(0).toUpperCase()}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {isAdmin ? (
            <View style={styles.adminSection}>
              <Text style={styles.sectionLabel}>GESTIÓN</Text>
              <SportsFeatureCard
                title="Crear partido"
                eyebrow="ADMINISTRACIÓN"
                description="Publica un nuevo partido de EasyFutbol desde la app."
                imageSource={CARD_IMAGES.adminCreate}
                onPress={() => navigation.navigate('AdminCreateMatch')}
                accent
                compact
              />
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Explora EasyFutbol</Text>
            <Text style={styles.sectionSubtitle}>Todo lo que necesitas para jugar y competir.</Text>
          </View>

          <View style={styles.cardGrid}>
            {cards.map((card) => (
              <View
                key={card.key}
                style={[styles.cardCell, useTwoColumns && styles.cardCellWide]}
              >
                <SportsFeatureCard
                  title={card.title}
                  eyebrow={card.eyebrow}
                  description={card.description}
                  imageSource={card.imageSource}
                  onPress={card.onPress}
                  accent={card.accent}
                  compact={useTwoColumns}
                />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backgroundImage: {
    resizeMode: 'cover',
    opacity: 0.56,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPadding,
  },
  contentBoundary: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
  topBar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(2),
  },
  backButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing(1),
  },
  backButtonDisabled: {
    opacity: 0.35,
  },
  backButtonText: {
    color: colors.white,
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '300',
    marginTop: -2,
  },
  brand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing(1),
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: radii.medium,
  },
  brandCopy: {
    flex: 1,
    marginLeft: spacing(1.25),
  },
  brandName: {
    color: colors.orange,
    ...typography.overline,
  },
  userName: {
    color: colors.white,
    ...typography.bodyStrong,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  notificationButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  notificationBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff5a00',
    borderWidth: 2,
    borderColor: '#0b0b0d',
  },
  notificationBadgeWide: { minWidth: 27 },
  notificationBadgeText: { color: '#fff', fontSize: 9, lineHeight: 11, fontWeight: '900' },
  balanceButton: {
    minWidth: 62,
    height: layout.minTouchTarget,
    paddingHorizontal: spacing(1.25),
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 90, 0, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 90, 0, 0.50)',
  },
  balanceValue: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '900',
  },
  balanceLogo: {
    width: 22,
    height: 22,
    marginLeft: 4,
  },
  avatarButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radii.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 2,
    borderColor: colors.orange,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '900',
  },
  adminSection: {
    marginBottom: spacing(3),
  },
  sectionLabel: {
    color: colors.orange,
    ...typography.overline,
    marginBottom: spacing(1),
  },
  sectionHeader: {
    marginBottom: spacing(2),
  },
  sectionTitle: {
    color: colors.white,
    ...typography.title,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    ...typography.body,
    marginTop: spacing(0.5),
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing(0.75),
  },
  cardCell: {
    width: '100%',
    paddingHorizontal: spacing(0.75),
    marginBottom: spacing(1.5),
  },
  cardCellWide: {
    width: '50%',
  },
});
