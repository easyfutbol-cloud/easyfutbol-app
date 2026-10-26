import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTeam, leagueSponsor } from '../../data/leaguePreviewData';
import { useTeamProfiles } from '../../data/leagueTeamProfiles';
import { useLeagueCity, viewCity } from '../../data/leagueCity';
import { L, pressedFx } from './leagueTheme';
import { CitySheet } from './CityPicker';

export { L, pressedFx };

// Brillo de fondo; `tint` permite teñirlo con el color de un equipo.
function Ambient({ tint = L.accent }) {
  return (
    <View pointerEvents="none" style={styles.ambient}>
      <LinearGradient colors={[`${tint}2E`, `${tint}0D`, 'transparent']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(99,102,241,0.10)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.3, y: 0.7 }} style={StyleSheet.absoluteFill} />
    </View>
  );
}

// Contenedor común: fondo, barra superior translúcida y espacio para la navegación inferior.
export function LeagueScreen({ children, onBack, backLabel, onExit, right, scroll = true, tint }) {
  const insets = useSafeAreaInsets();
  const top = (insets.top || (Platform.OS === 'android' ? 24 : 0)) + 6;
  const [headerHeight, setHeaderHeight] = useState(top + 46);
  const scrollY = useRef(new Animated.Value(0)).current;
  const navigation = useNavigation();
  const { viewing, favorite, isBrowsing } = useLeagueCity();
  const [sheet, setSheet] = useState(false);
  const selectCity = (city) => {
    setSheet(false);
    viewCity(city.id);
    if (city.status !== 'live') navigation.navigate('LeagueHome');
  };
  const barOpacity = scrollY.interpolate({ inputRange: [0, 40], outputRange: [0, 1], extrapolate: 'clamp' });

  const bar = (
    <View style={styles.topRow}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} style={({ pressed }) => [styles.backButton, pressed && pressedFx]}>
          <Ionicons name="chevron-back" size={18} color={L.text} />
          {!!backLabel && <Text style={styles.backText}>{backLabel}</Text>}
        </Pressable>
      ) : (
        <Pressable onPress={() => setSheet(true)} hitSlop={6} style={({ pressed }) => [styles.brand, pressed && pressedFx]} accessibilityLabel={`Ciudad: ${viewing.name}. Cambiar de ciudad`}>
          <LinearGradient colors={[L.accentLight, L.accent, '#C2410C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.brandMark}>
            <Ionicons name="trophy" size={15} color="#fff" />
          </LinearGradient>
          <View>
            <Text style={styles.brandKicker}>EASYFUTBOL <Text style={{ color: L.accentLight }}>LEAGUE</Text></Text>
            <View style={styles.cityRow}>
              <Text style={styles.cityName}>{viewing.name}</Text>
              {viewing.id === favorite.id && <Ionicons name="star" size={11} color={L.gold} />}
              <View style={styles.cityChevron}><Ionicons name="chevron-down" size={12} color={L.text} /></View>
            </View>
          </View>
        </Pressable>
      )}
      <View style={styles.topRight}>
        {right}
        <View style={styles.demoPill}><Text style={styles.demoText}>DEMO</Text></View>
        {!!onExit && (
          <Pressable onPress={onExit} hitSlop={10} style={({ pressed }) => [styles.roundButton, pressed && pressedFx]} accessibilityLabel="Salir de la liga">
            <Ionicons name="close" size={18} color={L.soft} />
          </Pressable>
        )}
      </View>
    </View>
  );

  const banner = !onBack && isBrowsing ? (
    <Pressable onPress={() => selectCity(favorite)} style={({ pressed }) => [styles.browsing, pressed && pressedFx]}>
      <Ionicons name="eye-outline" size={15} color={L.accentLight} />
      <Text style={styles.browsingText} numberOfLines={1}>Estás viendo <Text style={styles.browsingStrong}>{viewing.name}</Text></Text>
      <Text style={styles.browsingAction}>Volver a {favorite.name}</Text>
    </Pressable>
  ) : null;
  const citySheet = <CitySheet visible={sheet} onClose={() => setSheet(false)} onSelect={selectCity} />;

  if (!scroll) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <Ambient tint={tint} />
        <View style={[styles.staticHeader, { paddingTop: top }]}>{bar}</View>
        <View style={[styles.content, { flex: 1 }]}>{banner}{children}</View>
        {citySheet}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <Ambient tint={tint} />
      <Animated.ScrollView
        contentContainerStyle={[styles.content, { paddingTop: headerHeight + 4 }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        {banner}
        {children}
      </Animated.ScrollView>
      <View style={styles.header} onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: barOpacity }]}>
          <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.headerShade} />
          <View style={styles.headerLine} />
        </Animated.View>
        <View style={{ paddingTop: top }}>{bar}</View>
      </View>
      {citySheet}
    </View>
  );
}

// Para pantallas que necesitan una liga en juego (calendario, clasificación…).
export function withLiveLeague(Screen) {
  return function LiveLeagueScreen(props) {
    const { viewing } = useLeagueCity();
    if (viewing.status !== 'live') {
      return (
        <LeagueScreen>
          <View style={styles.notLive}>
            <Ionicons name="time-outline" size={30} color={L.subtle} />
            <Text style={styles.notLiveTitle}>La liga de {viewing.name} aún no ha empezado</Text>
            <Text style={styles.notLiveText}>Calendario, clasificación y estadísticas aparecerán cuando arranque la temporada.</Text>
            <Pressable onPress={() => props.navigation.navigate('LeagueHome')} style={({ pressed }) => [styles.notLiveButton, pressed && pressedFx]}>
              <Text style={styles.notLiveButtonText}>Ver {viewing.name}</Text>
            </Pressable>
          </View>
        </LeagueScreen>
      );
    }
    return <Screen {...props} league={viewing} />;
  };
}

export function PageTitle({ kicker, title, subtitle }) {
  return (
    <View style={styles.pageTitle}>
      {!!kicker && (
        <View style={styles.kickerRow}>
          <View style={styles.kickerDot} />
          <Text style={styles.kicker}>{kicker}</Text>
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

export function Section({ title, action, onAction, children, style }) {
  return (
    <View style={[styles.section, style]}>
      {(!!title || !!action) && (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {!!action && (
            <Pressable onPress={onAction} hitSlop={8} style={({ pressed }) => [styles.sectionAction, pressed && pressedFx]}>
              <Text style={styles.sectionActionText}>{action}</Text>
              <Ionicons name="arrow-forward" size={12} color={L.soft} />
            </Pressable>
          )}
        </View>
      )}
      {children}
    </View>
  );
}

export function Card({ children, style, onPress }) {
  if (onPress) {
    return <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && pressedFx]}>{children}</Pressable>;
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

// Texto legible sobre un color (blanco salvo en colores muy claros).
export function readableOn(hex) {
  const value = String(hex || '').replace('#', '');
  if (value.length !== 6) return '#fff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.72 ? '#111' : '#fff';
}

export function Crest({ teamId, size = 32, team: override }) {
  useTeamProfiles();
  const team = override || getTeam(teamId);
  const frame = { width: size, height: size, borderRadius: size * 0.3 };
  if (team.crestUri) {
    return (
      <View style={[styles.crest, frame, styles.crestImageFrame]}>
        <Image source={{ uri: team.crestUri }} style={styles.crestImage} resizeMode="cover" />
      </View>
    );
  }
  return (
    <LinearGradient colors={[team.color, `${team.color}99`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.crest, frame, { borderColor: 'rgba(255,255,255,0.16)' }]}>
      <Text style={[styles.crestText, { color: readableOn(team.color), fontSize: Math.max(8, size * 0.3) }]}>{team.short}</Text>
    </LinearGradient>
  );
}

// Control segmentado con indicador que se desliza.
export function Segmented({ options, value, onChange, style }) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex(([key]) => key === value));
  const position = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    Animated.spring(position, { toValue: index, useNativeDriver: true, speed: 22, bounciness: 5 }).start();
  }, [index, position]);
  const segment = width ? (width - 6) / options.length : 0;

  return (
    <View style={[styles.segmented, style]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {!!segment && (
        <Animated.View
          pointerEvents="none"
          style={[styles.segmentIndicator, { width: segment, transform: [{ translateX: position.interpolate({ inputRange: [0, 1], outputRange: [0, segment] }) }] }]}
        />
      )}
      {options.map(([key, label]) => {
        const active = key === value;
        return (
          <Pressable key={key} onPress={() => onChange(key)} style={styles.segment}>
            <Text numberOfLines={1} style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chips({ options, value, onChange }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map(([key, label, hint]) => {
        const active = key === value;
        const body = (
          <>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            {!!hint && <Text style={[styles.chipHint, active && styles.chipHintActive]}>{hint}</Text>}
          </>
        );
        return (
          <Pressable key={key} onPress={() => onChange(key)} style={({ pressed }) => [pressed && pressedFx]}>
            {active ? (
              <LinearGradient colors={[L.accentLight, L.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.chip, styles.chipActive]}>{body}</LinearGradient>
            ) : (
              <View style={styles.chip}>{body}</View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function FormDots({ form, size = 7 }) {
  const color = { W: L.win, D: L.draw, L: L.loss };
  return (
    <View style={styles.form}>
      {form.slice(-5).map((result, index) => (
        <View key={index} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color[result] }} />
      ))}
    </View>
  );
}

export function Stat({ value, label, accent, style }) {
  return (
    <View style={[styles.stat, accent && styles.statAccent, style]}>
      <Text style={[styles.statValue, accent && { color: L.accentLight }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Fila de partido reutilizable: marcador si está jugado, hora si está programado.
export function MatchRow({ match, onPress, showMeta = true, highlightTeamId }) {
  useTeamProfiles();
  const home = getTeam(match.homeId);
  const away = getTeam(match.awayId);
  const finished = match.status === 'finished';
  const nameStyle = (teamId, own, other) => [
    styles.matchTeam,
    finished && own < other && styles.matchTeamLost,
    highlightTeamId === teamId && styles.matchTeamOwn,
  ];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.matchRow, pressed && pressedFx]}>
      <View style={styles.matchSide}>
        <Crest teamId={home.id} size={28} />
        <Text numberOfLines={1} style={nameStyle(home.id, match.homeScore, match.awayScore)}>{home.name}</Text>
      </View>
      <View style={styles.matchCenter}>
        {finished ? (
          <View style={styles.scoreBox}>
            <Text style={styles.matchScore}>{match.homeScore}<Text style={styles.matchDash}> : </Text>{match.awayScore}</Text>
          </View>
        ) : (
          <View style={[styles.scoreBox, styles.timeBox]}>
            <Text style={styles.matchTime}>{match.time}</Text>
          </View>
        )}
        {showMeta && <Text style={styles.matchMeta}>{finished ? 'Final' : match.day.split(' ')[0]}</Text>}
      </View>
      <View style={[styles.matchSide, styles.matchSideAway]}>
        <Text numberOfLines={1} style={[nameStyle(away.id, match.awayScore, match.homeScore), styles.alignRight]}>{away.name}</Text>
        <Crest teamId={away.id} size={28} />
      </View>
    </Pressable>
  );
}

export function SponsorSlot({ label = 'Presentado por', compact }) {
  const name = leagueSponsor.name;
  if (!name) {
    return (
      <View style={[styles.sponsor, compact && styles.sponsorCompact]}>
        <Text style={styles.sponsorLabel}>{label.toUpperCase()}</Text>
        <Text style={[styles.sponsorName, styles.sponsorPlaceholder]}>Tu marca aquí</Text>
      </View>
    );
  }
  return (
    <LinearGradient colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.02)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.sponsor, styles.sponsorActive, compact && styles.sponsorCompact]}>
      <Text style={styles.sponsorLabel}>{label.toUpperCase()}</Text>
      <View style={styles.sponsorRow}>
        <Ionicons name="sparkles" size={12} color={L.gold} />
        <Text style={styles.sponsorName}>{name}</Text>
      </View>
    </LinearGradient>
  );
}

export function Divider({ style }) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: L.bg },
  ambient: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  content: { paddingHorizontal: 16, paddingBottom: 130 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 10, zIndex: 10 },
  headerShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,9,12,0.55)' },
  headerLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.12)' },
  staticHeader: { paddingBottom: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 36 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 34, paddingLeft: 8, paddingRight: 12, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: L.line },
  backText: { color: L.text, fontSize: 13, fontWeight: '700' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  brandMark: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  brandKicker: { color: L.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  cityName: { color: L.text, fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  cityChevron: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)', marginLeft: 1 },
  browsing: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, marginTop: 4, marginBottom: 12, borderRadius: 14, backgroundColor: 'rgba(255,90,0,0.08)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.25)' },
  browsingText: { flex: 1, color: L.soft, fontSize: 12 },
  browsingStrong: { color: L.text, fontWeight: '800' },
  browsingAction: { color: L.accentLight, fontSize: 12, fontWeight: '800' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  demoPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  demoText: { color: L.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  roundButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: L.line },

  pageTitle: { marginTop: 10, marginBottom: 22 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  kickerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: L.accent },
  kicker: { color: L.accentLight, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: L.text, fontSize: 34, lineHeight: 39, fontWeight: '900', letterSpacing: -1 },
  subtitle: { color: L.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },

  section: { marginBottom: 30 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: L.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  sectionActionText: { color: L.soft, fontSize: 12, fontWeight: '700' },

  card: { backgroundColor: L.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: L.line, borderTopColor: L.highlight },

  crest: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  crestText: { fontWeight: '900', letterSpacing: -0.3 },
  crestImageFrame: { overflow: 'hidden', borderColor: 'rgba(255,255,255,0.14)', backgroundColor: L.raised },
  crestImage: { width: '100%', height: '100%' },

  segmented: { flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: L.line },
  segmentIndicator: { position: 'absolute', top: 3, bottom: 3, left: 3, borderRadius: 11, backgroundColor: L.raised, borderWidth: 1, borderColor: L.highlight },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 9 },
  segmentText: { color: L.muted, fontSize: 13, fontWeight: '700' },
  segmentTextActive: { color: L.text },

  chips: { gap: 8, paddingRight: 16 },
  chip: { minWidth: 58, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: L.line, alignItems: 'center' },
  chipActive: { borderColor: 'transparent' },
  chipText: { color: L.soft, fontSize: 14, fontWeight: '800' },
  chipHint: { color: L.subtle, fontSize: 10, fontWeight: '700', marginTop: 1 },
  chipTextActive: { color: '#fff' },
  chipHintActive: { color: 'rgba(255,255,255,0.8)' },

  form: { flexDirection: 'row', gap: 3 },

  stat: { flex: 1, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 16, backgroundColor: L.surface, borderWidth: 1, borderColor: L.line, borderTopColor: L.highlight },
  statAccent: { backgroundColor: 'rgba(255,90,0,0.08)', borderColor: 'rgba(255,90,0,0.22)' },
  statValue: { color: L.text, fontSize: 23, fontWeight: '900', letterSpacing: -0.6 },
  statLabel: { color: L.muted, fontSize: 11, fontWeight: '600', marginTop: 2 },

  matchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  matchSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 },
  matchSideAway: { justifyContent: 'flex-end' },
  matchTeam: { flexShrink: 1, color: L.text, fontSize: 13, fontWeight: '700' },
  matchTeamLost: { color: L.muted },
  matchTeamOwn: { color: L.accentLight },
  alignRight: { textAlign: 'right' },
  matchCenter: { width: 70, alignItems: 'center' },
  scoreBox: { minWidth: 56, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.07)' },
  timeBox: { backgroundColor: L.accentSoft },
  matchScore: { color: L.text, fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  matchDash: { color: L.subtle, fontWeight: '700' },
  matchTime: { color: L.accentLight, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  matchMeta: { color: L.subtle, fontSize: 10, fontWeight: '600', marginTop: 4 },

  sponsor: { alignItems: 'center', paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.14)' },
  sponsorCompact: { paddingVertical: 9 },
  sponsorActive: { borderStyle: 'solid', borderColor: L.line, borderTopColor: L.highlight },
  sponsorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  sponsorLabel: { color: L.subtle, fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  sponsorName: { color: L.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  sponsorPlaceholder: { color: L.muted, fontWeight: '700', marginTop: 3 },

  divider: { height: 1, backgroundColor: L.line },
  notLive: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  notLiveTitle: { color: L.text, fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  notLiveText: { color: L.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  notLiveButton: { marginTop: 18, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 14, backgroundColor: L.accent },
  notLiveButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
