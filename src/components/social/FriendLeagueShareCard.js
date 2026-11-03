import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ShareCardModal, { CARD_HEIGHT, CARD_WIDTH } from '../ShareCardModal';
import { MEDALS } from './FriendLeagueParts';
import { entryName } from '../../utils/friendLeagueRules';

const APP_LOGO = require('../../../assets/Logo.png');
const MAX_ROWS = 8;

// Clasificación para historias (1080x1920). Se dibuja en píxeles de la tarjeta y
// se escala con `k`, igual que el resto de tarjetas para compartir.
function LeagueCard({ cardRef, cardWidth, league, standings }) {
  const [width, setWidth] = useState(0);
  const k = width / CARD_WIDTH;
  const finished = league.status === 'finished';
  const winner = standings[0];
  const subtitle = league.demo
    ? 'Liga de ejemplo'
    : finished && winner ? `Campeón: ${entryName(winner)}` : `Clasificación · ${league.matches_goal} partidos`;

  return (
    <View ref={cardRef} collapsable={false} style={[styles.card, cardWidth ? { width: cardWidth } : null]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <LinearGradient colors={['#5a2206', '#17100c', '#08090b']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill}/>
      {width > 0 ? <View style={{ flex: 1, paddingTop: 110 * k, paddingHorizontal: 70 * k }}>
        <View style={[styles.brand, { gap: 18 * k }]}>
          <Image source={APP_LOGO} style={{ width: 70 * k, height: 70 * k, borderRadius: 16 * k }}/>
          <Text style={[styles.brandText, { fontSize: 40 * k, letterSpacing: 6 * k }]}>EASYFUTBOL</Text>
        </View>
        <Text style={{ fontSize: 130 * k, textAlign: 'center', marginTop: 60 * k }}>🏆</Text>
        <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={[styles.title, { fontSize: 96 * k, marginTop: 20 * k }]}>{league.name}</Text>
        <Text numberOfLines={1} style={[styles.subtitle, { fontSize: 42 * k, marginTop: 18 * k }]}>{subtitle}</Text>
        <View style={{ marginTop: 60 * k, gap: 18 * k }}>
          {standings.slice(0, MAX_ROWS).map((entry) => {
            const medal = MEDALS[entry.rank];
            return <View key={entry.players[0].user_id} style={[styles.row, { paddingVertical: 26 * k, paddingHorizontal: 34 * k, borderRadius: 34 * k, gap: 28 * k, borderWidth: 3 * k }, medal ? { backgroundColor: medal.soft, borderColor: medal.color } : null]}>
              <Text style={[styles.rank, { fontSize: 54 * k, width: 70 * k, color: medal?.color || '#a5a8ae' }]}>{entry.rank}</Text>
              <Text numberOfLines={1} style={[styles.rowName, { fontSize: 48 * k }]}>{entryName(entry)}</Text>
              <Text style={[styles.rowPoints, { fontSize: 58 * k }]}>{entry.points}</Text>
              <Text style={[styles.rowUnit, { fontSize: 26 * k }]}>PTS</Text>
            </View>;
          })}
        </View>
        <View style={{ flex: 1 }}/>
        <Text style={[styles.cta, { fontSize: 42 * k, marginBottom: 100 * k }]}>Crea tu liga con amigos en EasyFutbol</Text>
      </View> : null}
    </View>
  );
}

export default function FriendLeagueShareModal({ visible, onClose, league, standings }) {
  return (
    <ShareCardModal
      visible={visible}
      onClose={onClose}
      title="Comparte la clasificación"
      dialogTitle="Compartir la clasificación"
      fallbackMessage={`⚽ ${league.name}: ${standings.slice(0, 3).map((entry) => `${entry.rank}º ${entryName(entry)} (${entry.points})`).join(', ')}`}
      renderCard={(cardRef, cardWidth) => <LeagueCard cardRef={cardRef} cardWidth={cardWidth} league={league} standings={standings}/>}
    />
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', aspectRatio: CARD_WIDTH / CARD_HEIGHT, backgroundColor: '#08090b', overflow: 'hidden' },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  brandText: { color: '#fff', fontWeight: '900' },
  title: { color: '#fff', fontWeight: '900', textAlign: 'center' },
  subtitle: { color: '#ff8b4b', fontWeight: '800', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,.07)', borderColor: 'transparent' },
  rank: { fontWeight: '900' },
  rowName: { flex: 1, color: '#fff', fontWeight: '800' },
  rowPoints: { color: '#fff', fontWeight: '900' },
  rowUnit: { color: '#a5a8ae', fontWeight: '900' },
  cta: { color: '#c9cbd0', fontWeight: '800', textAlign: 'center' },
});
