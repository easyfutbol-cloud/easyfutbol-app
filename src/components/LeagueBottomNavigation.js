import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LEAGUE_TABS } from '../navigation/leagueNavigation';

export default function LeagueBottomNavigation({ currentRouteName, onNavigate }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 5) }]}>
      {LEAGUE_TABS.map((tab) => {
        const active = tab.routeName === currentRouteName || (currentRouteName === 'LeagueMatchDetail' && tab.routeName === 'LeagueCalendar');
        return (
          <Pressable key={tab.routeName} onPress={() => onNavigate(tab.routeName)} style={styles.tab}>
            <Ionicons name={active ? tab.activeIcon : tab.icon} size={21} color={active ? '#ff5a00' : '#777'} />
            <Text numberOfLines={1} style={[styles.label, active && styles.active]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', paddingTop: 9, backgroundColor: '#0b0b0e', borderTopWidth: 1, borderTopColor: '#252529', zIndex: 900 },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  label: { color: '#777', fontSize: 9, fontWeight: '700' },
  active: { color: '#ff5a00' },
});
