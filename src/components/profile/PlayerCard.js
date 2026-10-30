// Carta de jugador con forma de escudo: fondo negro con llamas naranjas y un
// borde metálico que cambia según el nivel (bronce, plata, oro, élite). Los
// números vienen del backend (playerCardService.computePlayerCard). El dibujo
// usa un viewBox de 200x290 y el contenido se coloca en proporción al ancho.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { SocialAvatar } from '../social/SocialComponents';
import { CARD_TIERS, POSITION_SHORT } from '../../utils/profileTheme';

export const CARD_RATIO = 290 / 200;

// Escudo: cresta ondulada arriba, laterales rectos y punta abajo.
const SHIELD = 'M18 16 Q40 16 58 5 Q79 -4 100 7 Q121 -4 142 5 Q160 16 182 16 L196 26 L196 226 Q196 246 177 255 L109 285 Q100 289 91 285 L23 255 Q4 246 4 226 L4 26 Z';
const INNER = 'M20 22 Q42 22 59 12 Q79 3 100 13 Q121 3 141 12 Q158 22 180 22 L191 29 L191 225 Q191 242 174 250 L108 280 Q100 284 92 280 L26 250 Q9 242 9 225 L9 29 Z';
// Llamas: lenguas que suben en diagonal desde abajo a la izquierda.
const FLAMES = [
  'M-10 300 C 20 220 0 170 55 110 C 40 175 85 200 72 300 Z',
  'M35 300 C 65 225 55 175 112 120 C 96 190 140 220 128 300 Z',
  'M95 300 C 125 235 140 185 196 140 C 172 205 212 240 212 300 Z',
  'M150 300 C 162 255 185 225 215 195 L215 300 Z',
];
// Núcleos amarillos, más cortos, para que el fuego tenga profundidad.
const FLAME_CORES = [
  'M20 300 C 35 255 30 225 58 190 C 52 230 70 250 66 300 Z',
  'M85 300 C 100 260 98 230 125 200 C 118 240 140 260 132 300 Z',
  'M150 300 C 162 265 170 245 192 225 C 182 255 200 275 198 300 Z',
];
const STREAKS = ['M-20 200 L120 -20 L132 -20 L-8 200 Z', 'M30 230 L190 -20 L198 -20 L38 230 Z', 'M110 290 L230 70 L236 70 L116 290 Z'];

export default function PlayerCard({ card, name, nickname, avatarUrl, shirtNumber, width = 230 }) {
  if (!card) return null;
  const tier = CARD_TIERS[card.tier] || CARD_TIERS.bronze;
  const height = width * CARD_RATIO;
  const u = width / 200; // 1 unidad del viewBox en píxeles
  const half = Math.ceil(card.attributes.length / 2);
  const columns = [card.attributes.slice(0, half), card.attributes.slice(half)];
  const displayName = (nickname || name || '').toUpperCase();
  const avatarSize = 78 * u;
  const id = `pc-${card.tier}`;

  return (
    <View style={[styles.shadow, { width, height, shadowColor: tier.glow }]}>
      <Svg width={width} height={height} viewBox="0 0 200 290" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
            {tier.rim.map((color, i) => <Stop key={i} offset={i / (tier.rim.length - 1)} stopColor={color} />)}
          </LinearGradient>
          <RadialGradient id={`${id}-base`} cx="62%" cy="30%" r="80%">
            <Stop offset="0" stopColor="#5a1d05" />
            <Stop offset="0.45" stopColor="#1c0a04" />
            <Stop offset="1" stopColor="#050505" />
          </RadialGradient>
          <LinearGradient id={`${id}-flame`} x1="0" y1="1" x2="0.4" y2="0">
            <Stop offset="0" stopColor="#ffb347" stopOpacity="0.95" />
            <Stop offset="0.35" stopColor="#ff5a00" stopOpacity="0.85" />
            <Stop offset="1" stopColor="#ff2d00" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id={`${id}-core`} x1="0" y1="1" x2="0.3" y2="0">
            <Stop offset="0" stopColor="#fff2b0" stopOpacity="0.95" />
            <Stop offset="0.4" stopColor="#ffb347" stopOpacity="0.7" />
            <Stop offset="1" stopColor="#ff7a1a" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#050505" stopOpacity="0" />
            <Stop offset="0.25" stopColor="#050505" stopOpacity="0.35" />
            <Stop offset="1" stopColor="#050505" stopOpacity="0.15" />
          </LinearGradient>
          <RadialGradient id={`${id}-halo`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#ff7a1a" stopOpacity="0.75" />
            <Stop offset="0.6" stopColor="#ff4d00" stopOpacity="0.18" />
            <Stop offset="1" stopColor="#ff4d00" stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id={`${id}-shine`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <Stop offset="0.5" stopColor="#ffffff" stopOpacity="0.16" />
            <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#ff5a00" stopOpacity="0" />
            <Stop offset="0.5" stopColor="#ff8a3d" stopOpacity="1" />
            <Stop offset="1" stopColor="#ff5a00" stopOpacity="0" />
          </LinearGradient>
          <ClipPath id={`${id}-clip`}><Path d={INNER} /></ClipPath>
        </Defs>

        <Path d={SHIELD} fill={`url(#${id}-rim)`} />
        <Path d={INNER} fill={`url(#${id}-base)`} />
        <G clipPath={`url(#${id}-clip)`}>
          <Rect x="70" y="18" width="140" height="140" fill={`url(#${id}-halo)`} />
          {FLAMES.map((d, i) => <Path key={i} d={d} fill={`url(#${id}-flame)`} opacity={i % 2 ? 0.7 : 0.95} />)}
          {FLAME_CORES.map((d, i) => <Path key={`c${i}`} d={d} fill={`url(#${id}-core)`} opacity={0.75} />)}
          {/* Sombra tras los atributos para que se lean encima del fuego */}
          <Rect x="0" y="146" width="200" height="90" fill={`url(#${id}-shade)`} />
          {STREAKS.map((d, i) => <Path key={`s${i}`} d={d} fill={`url(#${id}-shine)`} />)}
          <Rect x="30" y="151" width="140" height="1.2" fill={`url(#${id}-line)`} />
        </G>
        <Path d={INNER} fill="none" stroke={tier.rim[1]} strokeOpacity="0.6" strokeWidth="0.6" />
      </Svg>

      {/* Media, posición y dorsal */}
      <View style={[styles.rating, { left: 24 * u, top: 34 * u }]}>
        <Text style={[styles.overall, { fontSize: 46 * u, lineHeight: 50 * u }]}>{card.provisional ? '–' : card.overall}</Text>
        <Text style={[styles.position, { fontSize: 16 * u }]}>{POSITION_SHORT[card.position] || 'JUG'}</Text>
        <View style={[styles.miniLine, { width: 28 * u, marginTop: 5 * u }]} />
      </View>

      {/* Foto */}
      <View style={[styles.avatar, { right: 26 * u, top: 38 * u, borderRadius: avatarSize, padding: 1.5 * u, backgroundColor: tier.rim[1] }]}>
        <SocialAvatar uri={avatarUrl} name={name} size={avatarSize} />
        {shirtNumber ? (
          <View style={[styles.shirtBadge, { minWidth: 26 * u, height: 26 * u, borderRadius: 13 * u, borderColor: tier.rim[1], left: -6 * u, bottom: -4 * u }]}>
            <Text style={[styles.shirt, { fontSize: 12 * u }]}>{shirtNumber}</Text>
          </View>
        ) : null}
      </View>

      {/* Nombre */}
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.name, { top: 127 * u, left: 16 * u, right: 16 * u, fontSize: 19 * u }]}>{displayName}</Text>

      {/* Atributos */}
      <View style={[styles.attributes, { top: 158 * u, left: 26 * u, right: 26 * u }]}>
        {columns.map((column, index) => (
          <View key={index} style={[styles.column, index === 1 && { borderLeftWidth: 1, borderLeftColor: 'rgba(255,138,61,.35)' }]}>
            {column.map((attribute) => (
              <View key={attribute.key} style={[styles.attribute, { paddingVertical: 1.5 * u }]}>
                <Text style={[styles.attributeValue, { fontSize: 16 * u, minWidth: 24 * u }]}>{card.provisional ? '–' : attribute.value}</Text>
                <Text style={[styles.attributeLabel, { fontSize: 11 * u }]}>{attribute.label}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* Pie: nivel y partidos, en la punta del escudo */}
      <Text style={[styles.footer, { top: 236 * u, fontSize: 8 * u, letterSpacing: 1.6 * u }]}>
        {card.provisional ? `EN JUEGO · ${card.matches_played}/3` : `${tier.label} · ${card.matches_played} PJ`}
      </Text>
      <Text style={[styles.brand, { top: 250 * u, fontSize: 7 * u, letterSpacing: 2 * u }]}>EASYFUTBOL</Text>
    </View>
  );
}

const glow = { textShadowColor: 'rgba(255,90,0,.85)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 };

const styles = StyleSheet.create({
  shadow: { alignSelf: 'center', shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  rating: { position: 'absolute', alignItems: 'center' },
  overall: { color: '#fff', fontWeight: '900', ...glow },
  position: { color: '#ffb07a', fontWeight: '900', letterSpacing: 1.5 },
  miniLine: { height: 1.5, backgroundColor: '#ff7a32', borderRadius: 1 },
  shirtBadge: { position: 'absolute', backgroundColor: '#ff5a00', borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  shirt: { color: '#fff', fontWeight: '900' },
  avatar: { position: 'absolute' },
  name: { position: 'absolute', color: '#fff', fontWeight: '900', textAlign: 'center', letterSpacing: 1.2, ...glow },
  attributes: { position: 'absolute', flexDirection: 'row' },
  column: { flex: 1, paddingHorizontal: 8 },
  attribute: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  attributeValue: { color: '#fff', fontWeight: '900' },
  attributeLabel: { color: '#ffb07a', fontWeight: '800' },
  footer: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: '#ffd2b0', fontWeight: '900', opacity: 0.9 },
  brand: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: '#0b0b0d', fontWeight: '900' },
});
