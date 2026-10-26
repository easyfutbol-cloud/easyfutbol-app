import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { getPlayer } from '../../data/leaguePreviewData';
import { useTeamProfiles } from '../../data/leagueTeamProfiles';

// Con `playerId` usa la foto aprobada del perfil de liga del jugador.
export default function LeaguePlayerAvatar({ name, playerId, photoUrl, size = 42, featured = false, style }) {
  useTeamProfiles();
  const uri = photoUrl || (playerId ? getPlayer(playerId)?.photoUri : null);
  const initials = String(name || '?').split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return <View style={[styles.frame, { width: size, height: size, borderRadius: size / 2 }, featured && styles.featured, style]}>
    {uri ? <Image source={{ uri }} resizeMode="cover" style={styles.image} /> : <Text style={[styles.initials, { fontSize: Math.max(10, size * .27) }]}>{initials}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E222A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  featured: { borderWidth: 2, borderColor: '#FF8A4C' },
  image: { width: '100%', height: '100%' },
  initials: { color: '#E4E6EA', fontWeight: '900', letterSpacing: -0.3 },
});
