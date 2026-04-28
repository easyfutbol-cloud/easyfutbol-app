import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function LeagueStatsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Estadísticas</Text>
      <Text style={styles.text}>Aquí aparecerán goleadores, asistentes, MVPs y estadísticas personales.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  title: { color: '#fff', fontSize: 26, fontWeight: '700', marginBottom: 10 },
  text: { color: '#aaa', fontSize: 15 },
});