// Top jugadores de una categoría: podio para los 3 primeros, lista del 4 al
// 10 y "tu puesto" abajo. Los datos vienen de GET /social/top.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SocialAvatar } from './SocialComponents';

const MEDALS = { 1: '#f4c95d', 2: '#d5dade', 3: '#d99a62' };
const PODIUM_HEIGHT = { 1: 96, 2: 72, 3: 58 };

export default function TopPlayers({ category, onOpenPlayer, myId }) {
  if (!category) return null;
  const items = category.items || [];
  if (!items.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>{category.emoji}</Text>
        <Text style={styles.emptyTitle}>Todavía nadie en este top</Text>
        <Text style={styles.emptyBody}>En cuanto haya partidos con acta en este periodo aparecerán aquí.</Text>
      </View>
    );
  }
  const podium = items.filter((item) => item.rank <= 3).slice(0, 3);
  const rest = items.slice(podium.length);
  // Orden visual del podio: 2º, 1º, 3º.
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean);
  const meInList = items.some((item) => item.id === myId);

  return (
    <View>
      <LinearGradient colors={['#2a1206', '#141417']} style={styles.podiumCard}>
        <Text style={styles.podiumTitle}>{category.emoji} {category.title}</Text>
        <View style={styles.podium}>
          {podiumOrder.map((item) => {
            const place = Math.min(item.rank, 3);
            const first = item === podium[0];
            return (
              <TouchableOpacity key={item.id} style={styles.podiumColumn} onPress={() => onOpenPlayer(item.id)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${item.rank}º ${item.name}, ${item.value} ${category.unit}`}>
                {first ? <Ionicons name="trophy" size={18} color={MEDALS[1]} style={{ marginBottom: 4 }} /> : null}
                <View style={[styles.podiumAvatar, { borderColor: MEDALS[place] }]}>
                  <SocialAvatar uri={item.avatar_url} name={item.name} size={first ? 64 : 52} />
                </View>
                <Text numberOfLines={1} style={[styles.podiumName, item.is_plus && styles.plusName, item.id === myId && styles.meName]}>{item.nickname || item.name.split(' ')[0]}</Text>
                <Text style={styles.podiumValue}>{item.value}</Text>
                <LinearGradient colors={[MEDALS[place], 'rgba(255,255,255,.05)']} style={[styles.podiumBase, { height: PODIUM_HEIGHT[place] }]}>
                  <Text style={styles.podiumRank}>{item.rank}</Text>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </View>
      </LinearGradient>

      {rest.map((item) => (
        <TouchableOpacity key={item.id} style={[styles.row, item.id === myId && styles.rowMine]} onPress={() => onOpenPlayer(item.id)} activeOpacity={0.85} accessibilityRole="button">
          <Text style={styles.rowRank}>{item.rank}</Text>
          <SocialAvatar uri={item.avatar_url} name={item.name} size={38} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[styles.rowName, item.is_plus && styles.plusName]}>{item.name}</Text>
            <Text style={styles.rowMeta}>{item.matches} {item.matches === 1 ? 'partido' : 'partidos'}</Text>
          </View>
          <Text style={styles.rowValue}>{item.value}</Text>
          <Text style={styles.rowUnit}>{category.unit}</Text>
        </TouchableOpacity>
      ))}

      {category.me && !meInList ? (
        <View style={[styles.row, styles.rowMine]}>
          <Text style={styles.rowRank}>{category.me.rank}</Text>
          <View style={styles.meIcon}><Ionicons name="person" size={18} color="#ff7a32" /></View>
          <Text style={[styles.rowName, { flex: 1 }]}>Tú</Text>
          <Text style={styles.rowValue}>{category.me.value}</Text>
          <Text style={styles.rowUnit}>{category.unit}</Text>
        </View>
      ) : !category.me ? (
        <Text style={styles.notIn}>Aún no apareces en este top. ¡Un partido más y entras!</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  podiumCard: { borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,90,0,.28)', padding: 16, paddingBottom: 0, overflow: 'hidden', marginBottom: 12 },
  podiumTitle: { color: '#fff', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 10, marginTop: 14 },
  podiumColumn: { flex: 1, alignItems: 'center', maxWidth: 110 },
  podiumAvatar: { borderWidth: 3, borderRadius: 999, padding: 2 },
  podiumName: { color: '#fff', fontSize: 12, fontWeight: '900', marginTop: 6, maxWidth: '100%' },
  podiumValue: { color: '#ff8a3d', fontSize: 20, fontWeight: '900', marginTop: 1, marginBottom: 6 },
  podiumBase: { alignSelf: 'stretch', borderTopLeftRadius: 14, borderTopRightRadius: 14, alignItems: 'center', paddingTop: 8 },
  podiumRank: { color: '#141417', fontSize: 22, fontWeight: '900' },
  plusName: { color: '#F4C95D' },
  meName: { color: '#ff8a3d' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#141417', borderRadius: 16, borderWidth: 1, borderColor: '#232327', paddingHorizontal: 13, paddingVertical: 10, marginBottom: 8 },
  rowMine: { borderColor: 'rgba(255,90,0,.55)', backgroundColor: 'rgba(255,90,0,.08)' },
  rowRank: { color: '#8d9097', fontSize: 14, fontWeight: '900', width: 24, textAlign: 'center' },
  rowName: { color: '#fff', fontSize: 14, fontWeight: '800' },
  rowMeta: { color: '#6f7178', fontSize: 10, fontWeight: '700', marginTop: 2 },
  rowValue: { color: '#fff', fontSize: 18, fontWeight: '900' },
  rowUnit: { color: '#8d9097', fontSize: 10, fontWeight: '800', width: 62 },
  meIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,90,0,.14)', alignItems: 'center', justifyContent: 'center' },
  notIn: { color: '#77777e', fontSize: 12, textAlign: 'center', marginTop: 6, marginBottom: 10 },
  empty: { alignItems: 'center', padding: 30, borderRadius: 22, backgroundColor: '#141417', borderWidth: 1, borderColor: '#232327' },
  emptyEmoji: { fontSize: 36 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginTop: 10 },
  emptyBody: { color: '#8d9097', fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 },
});
