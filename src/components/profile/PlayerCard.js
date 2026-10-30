// Carta de jugador estilo cromo: media, posición, foto y 6 atributos. Los
// números vienen calculados del backend (playerCardService.computePlayerCard).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SocialAvatar } from '../social/SocialComponents';
import { CARD_TIERS, POSITION_SHORT } from '../../utils/profileTheme';

export default function PlayerCard({ card, name, nickname, avatarUrl, shirtNumber, width = 230 }) {
  if (!card) return null;
  const tier = CARD_TIERS[card.tier] || CARD_TIERS.bronze;
  const scale = width / 230;
  const half = Math.ceil(card.attributes.length / 2);
  const columns = [card.attributes.slice(0, half), card.attributes.slice(half)];
  const displayName = (nickname || name || '').toUpperCase();

  return (
    <View style={[styles.shadow, { width, borderRadius: 22 * scale }]}>
      <LinearGradient colors={tier.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, { borderRadius: 22 * scale, padding: 14 * scale }]}>
        <View style={styles.top}>
          <View style={styles.rating}>
            <Text style={[styles.overall, { color: tier.text, fontSize: 44 * scale }]}>{card.provisional ? '–' : card.overall}</Text>
            <Text style={[styles.position, { color: tier.text, fontSize: 15 * scale }]}>{POSITION_SHORT[card.position] || 'JUG'}</Text>
            {shirtNumber ? <Text style={[styles.shirt, { color: tier.text, fontSize: 12 * scale }]}>#{shirtNumber}</Text> : null}
          </View>
          <View style={[styles.avatarRing, { borderColor: tier.line, borderRadius: 999 }]}>
            <SocialAvatar uri={avatarUrl} name={name} size={96 * scale} />
          </View>
        </View>

        <Text numberOfLines={1} style={[styles.name, { color: tier.text, fontSize: 18 * scale, marginTop: 10 * scale }]}>{displayName}</Text>
        <View style={[styles.divider, { backgroundColor: tier.line }]} />

        <View style={styles.attributes}>
          {columns.map((column, index) => (
            <View key={index} style={[styles.column, index === 1 && { borderLeftWidth: 1, borderLeftColor: tier.line }]}>
              {column.map((attribute) => (
                <View key={attribute.key} style={styles.attribute}>
                  <Text style={[styles.attributeValue, { color: tier.text, fontSize: 17 * scale }]}>{card.provisional ? '–' : attribute.value}</Text>
                  <Text style={[styles.attributeLabel, { color: tier.text, fontSize: 12 * scale }]}>{attribute.label}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        <Text style={[styles.tier, { color: tier.text, fontSize: 9 * scale }]}>
          {card.provisional ? `CARTA EN JUEGO · ${card.matches_played}/3 PARTIDOS` : `${tier.label} · ${card.matches_played} PARTIDOS`}
        </Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: { alignSelf: 'center', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  card: { overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  rating: { alignItems: 'center', minWidth: 54 },
  overall: { fontWeight: '900' },
  position: { fontWeight: '900', letterSpacing: 1, marginTop: -2 },
  shirt: { fontWeight: '900', marginTop: 6, opacity: 0.8 },
  avatarRing: { borderWidth: 3, padding: 2 },
  name: { fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
  divider: { height: 1, marginVertical: 10 },
  attributes: { flexDirection: 'row' },
  column: { flex: 1, paddingHorizontal: 10 },
  attribute: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingVertical: 3 },
  attributeValue: { fontWeight: '900', minWidth: 26 },
  attributeLabel: { fontWeight: '800', opacity: 0.85 },
  tier: { textAlign: 'center', fontWeight: '900', letterSpacing: 1.4, marginTop: 10, opacity: 0.75 },
});
