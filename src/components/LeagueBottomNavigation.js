import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LEAGUE_TABS } from '../navigation/leagueNavigation';
import { useLeagueCity } from '../data/leagueCity';

// Barra flotante translúcida de la liga.
export default function LeagueBottomNavigation({ currentRouteName, onNavigate }) {
  const insets = useSafeAreaInsets();
  // Sin liga en juego en la ciudad que se ve, solo tienen sentido Inicio y La liga.
  const { viewing } = useLeagueCity();
  const tabs = viewing.status === 'live' ? LEAGUE_TABS : LEAGUE_TABS.filter((tab) => tab.alwaysVisible);
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom - 6, Platform.OS === 'android' ? 10 : 8) }]}>
      <View style={styles.bar}>
        <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.shade} />
        {tabs.map((tab) => {
          const active = tab.routeName === currentRouteName || Boolean(tab.children?.includes(currentRouteName));
          return (
            <Pressable key={tab.routeName} onPress={() => onNavigate(tab.routeName)} style={styles.tab} accessibilityRole="button" accessibilityState={{ selected: active }}>
              <View style={[styles.iconWrap, active && styles.iconActive]}>
                <Ionicons name={active ? tab.activeIcon : tab.icon} size={20} color={active ? '#FF8A4C' : '#80858F'} />
              </View>
              <Text numberOfLines={1} style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, zIndex: 900 },
  bar: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 4, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(14,15,19,0.72)' },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  iconWrap: { width: 46, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: 'rgba(255,90,0,0.16)' },
  label: { color: '#80858F', fontSize: 10, fontWeight: '700' },
  labelActive: { color: '#FFFFFF' },
});
