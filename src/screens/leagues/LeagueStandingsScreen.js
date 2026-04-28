import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function LeagueStandingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Clasificación</Text>
      <Text style={styles.text}>Aquí aparecerá la tabla completa de la liga.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  title: { color: '#fff', fontSize: 26, fontWeight: '700', marginBottom: 10 },
  text: { color: '#aaa', fontSize: 15 },
});