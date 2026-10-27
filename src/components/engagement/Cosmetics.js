import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Marco de avatar canjeado con EasyPoints: un aro en degradado alrededor de
// la foto. Sin marco devuelve la foto tal cual.
export function FramedAvatar({ frame, size, ring, children }) {
  const colors = frame?.colors;
  if (!Array.isArray(colors) || colors.length < 2) return children;
  const width = ring ?? Math.max(3, Math.round(size * 0.06));
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size + width * 2, height: size + width * 2, borderRadius: (size + width * 2) / 2, padding: width, alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </LinearGradient>
  );
}

// Título canjeado que se enseña bajo el nombre ("El Muro", "Capitán"…).
export function PlayerTitleBadge({ title, style }) {
  if (!title?.label) return null;
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.badgeText}>{title.label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'center', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,90,0,.14)', borderWidth: 1, borderColor: 'rgba(255,90,0,.45)' },
  badgeText: { color: '#ff7a32', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
});
