import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cities, CITY_STATUS } from '../../data/leaguePreviewData';
import { setFavoriteCity, useLeagueCity } from '../../data/leagueCity';
import { L, pressedFx } from './leagueTheme';

export function cityDetail(city) {
  if (city.status === 'live') return `Jornada ${city.playedRounds} de ${city.totalRounds} · ${city.teams.length} equipos`;
  if (city.status === 'registration') return `${city.teamsRegistered}/${city.teamsMax} equipos · Empieza en ${city.start.toLowerCase()}`;
  return `Llegada prevista: ${city.start.toLowerCase()}`;
}

export function CityStatus({ status, style }) {
  const info = CITY_STATUS[status];
  return (
    <View style={[styles.status, { backgroundColor: `${info.color}1F` }, style]}>
      <View style={[styles.statusDot, { backgroundColor: info.color }]} />
      <Text style={[styles.statusText, { color: info.color }]}>{info.label}</Text>
    </View>
  );
}

// Hoja inferior con todas las ciudades: tocar una la abre, la estrella la marca como tuya.
export function CitySheet({ visible, onClose, onSelect }) {
  const insets = useSafeAreaInsets();
  const { favoriteId, viewingId } = useLeagueCity();
  const ordered = [...cities].sort((a, b) => (a.id === favoriteId ? -1 : b.id === favoriteId ? 1 : 0));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.handle} />
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Ciudades</Text>
            <Text style={styles.subtitle}>Ojea la liga de otras ciudades. La estrella marca la tuya.</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close}><Ionicons name="close" size={18} color={L.soft} /></Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {ordered.map((city) => {
            const favorite = city.id === favoriteId;
            const viewing = city.id === viewingId;
            return (
              <Pressable key={city.id} onPress={() => onSelect(city)} style={({ pressed }) => [styles.row, viewing && styles.rowActive, pressed && pressedFx]}>
                <View style={[styles.cityIcon, city.status === 'live' && styles.cityIconLive]}>
                  <Ionicons name={city.status === 'live' ? 'football' : 'location-outline'} size={17} color={city.status === 'live' ? L.accentLight : L.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{city.name}</Text>
                    {favorite && <Text style={styles.yours}>TU CIUDAD</Text>}
                  </View>
                  <Text style={styles.detail}>{cityDetail(city)}</Text>
                  <CityStatus status={city.status} style={{ marginTop: 6 }} />
                </View>
                <Pressable onPress={() => setFavoriteCity(city.id)} hitSlop={10} style={styles.star} accessibilityLabel={favorite ? 'Ciudad favorita' : `Marcar ${city.name} como favorita`}>
                  <Ionicons name={favorite ? 'star' : 'star-outline'} size={20} color={favorite ? L.gold : L.subtle} />
                </Pressable>
                {viewing && <Ionicons name="checkmark-circle" size={20} color={L.accent} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { maxHeight: '82%', paddingHorizontal: 16, paddingTop: 8, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#111317', borderWidth: 1, borderColor: L.line },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  title: { color: L.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: L.muted, fontSize: 13, marginTop: 3 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  list: { gap: 8, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: L.surface, borderWidth: 1, borderColor: L.line },
  rowActive: { borderColor: 'rgba(255,90,0,0.45)', backgroundColor: 'rgba(255,90,0,0.06)' },
  cityIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  cityIconLive: { backgroundColor: L.accentSoft },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: L.text, fontSize: 16, fontWeight: '800' },
  yours: { color: L.gold, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  detail: { color: L.muted, fontSize: 12, marginTop: 2 },
  star: { padding: 4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800' },
});
