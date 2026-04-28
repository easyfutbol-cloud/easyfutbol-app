import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function LeagueCalendarScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Calendario</Text>
      <Text style={styles.text}>Aquí aparecerán las jornadas y partidos de tu equipo.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  title: { color: '#fff', fontSize: 26, fontWeight: '700', marginBottom: 10 },
  text: { color: '#aaa', fontSize: 15 },
});