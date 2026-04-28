import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function LeagueVideosScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vídeos</Text>
      <Text style={styles.text}>Aquí aparecerán highlights, resúmenes y vídeos de partidos.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  title: { color: '#fff', fontSize: 26, fontWeight: '700', marginBottom: 10 },
  text: { color: '#aaa', fontSize: 15 },
});