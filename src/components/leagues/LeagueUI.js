import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { leagueInfo } from '../../data/leaguePreviewData';

export function LeagueHeader({ title, subtitle }) {
  return <View style={styles.header}>
    <View style={styles.topline}>
      <View style={styles.dot} />
      <Text style={styles.kicker}>{leagueInfo.name.toUpperCase()}</Text>
      <View style={styles.badge}><Text style={styles.badgeText}>PILOTO</Text></View>
    </View>
    <Text style={styles.title}>{title}</Text>
    {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
  </View>;
}
export const leagueScreenStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090a0d' },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 120 },
  card: { backgroundColor: '#12141a', borderRadius: 18, borderWidth: 1, borderColor: '#20232b', padding: 16, marginBottom: 12 },
  sectionTitle: { color: '#fff', fontSize: 19, fontWeight: '900', marginTop: 10, marginBottom: 12 },
  muted: { color: '#929299', fontSize: 13, lineHeight: 19 },
});
const styles = StyleSheet.create({
  header: { marginBottom: 24 },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ff5a00' },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: '#1b1d23', borderWidth: 1, borderColor: '#292c35' },
  badgeText: { color: '#888c96', fontSize: 8, fontWeight: '900', letterSpacing: .8 },
  kicker: { color: '#b7bac2', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 7 },
  subtitle: { color: '#8f8f96', fontSize: 14, lineHeight: 20, marginTop: 7 },
});
