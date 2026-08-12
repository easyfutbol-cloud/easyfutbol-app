import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

export default function LeaguePlayerAvatar({ name, photoUrl, size = 42, featured = false, style }) {
  const initials = String(name || '?').split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return <View style={[styles.frame, { width: size, height: size, borderRadius: size / 2 }, featured && styles.featured, style]}>
    {photoUrl ? <Image source={{ uri: photoUrl }} resizeMode="cover" style={styles.image} /> : <Text style={[styles.initials, { fontSize: Math.max(10, size * .27) }]}>{initials}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#22262b', borderWidth: 1, borderColor: '#343841' },
  featured: { borderWidth: 2, borderColor: '#ff6a17' },
  image: { width: '100%', height: '100%' },
  initials: { color: '#fff', fontWeight: '900' },
});
