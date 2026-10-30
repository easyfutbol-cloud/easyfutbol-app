import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { resolveSocialAvatarUrl } from '../social/SocialComponents';
import { avatarSource } from '../../utils/defaultAvatar';
import ShareCardModal, { CARD_HEIGHT, CARD_WIDTH } from '../ShareCardModal';

const APP_LOGO = require('../../../assets/Logo.png');
const ORANGE = '#ff5a00';
export const FORM_COLORS = { win: '#3ec46d', draw: '#8d9097', loss: '#e5484d' };
export const FORM_LETTER = { win: 'V', draw: 'E', loss: 'D' };

// Tarjeta del perfil para historias (1080x1920). Todo se dibuja en píxeles de
// la tarjeta y se escala con `k`, igual que la tarjeta de estadísticas.
// stats: [{ label, value }] — solo las que el jugador enseña en su perfil.
export function ProfileCard({ cardRef, cardWidth, name, avatarUrl, frame, title, chips = [], stats = [], streak, form = [], shareUrl }) {
  const [width, setWidth] = useState(0);
  const k = width / CARD_WIDTH;
  const avatarUri = resolveSocialAvatarUrl(avatarUrl);
  const ringColors = frame?.colors?.length >= 2 ? frame.colors : [ORANGE, '#ff9a4d'];
  const avatarSize = 470 * k;
  const ring = 18 * k;

  return (
    <View ref={cardRef} collapsable={false} style={[styles.card, cardWidth ? { width: cardWidth } : null]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <LinearGradient colors={['#2b1407', '#0d0e11', '#08090b']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      {width > 0 ? (
        <View style={{ flex: 1, alignItems: 'center', paddingTop: 120 * k, paddingHorizontal: 80 * k }}>
          <View style={[styles.glow, { width: 900 * k, height: 900 * k, borderRadius: 450 * k, top: 180 * k }]} />

          <View style={[styles.brand, { gap: 18 * k }]}>
            <Image source={APP_LOGO} style={{ width: 70 * k, height: 70 * k, borderRadius: 16 * k }} />
            <Text style={[styles.brandText, { fontSize: 40 * k, letterSpacing: 6 * k }]}>EASYFUTBOL</Text>
          </View>

          <LinearGradient colors={ringColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ marginTop: 110 * k, width: avatarSize + ring * 2, height: avatarSize + ring * 2, borderRadius: (avatarSize + ring * 2) / 2, padding: ring }}>
            <Image source={avatarSource(avatarUri)} style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, backgroundColor: '#222' }} />
          </LinearGradient>

          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[styles.name, { fontSize: 104 * k, marginTop: 60 * k }]}>{name || 'Jugador'}</Text>
          {title?.label ? (
            <View style={[styles.title, { marginTop: 22 * k, paddingHorizontal: 30 * k, paddingVertical: 12 * k, borderRadius: 60 * k, borderWidth: 3 * k }]}>
              <Text style={[styles.titleText, { fontSize: 34 * k, letterSpacing: 4 * k }]}>{title.label.toUpperCase()}</Text>
            </View>
          ) : null}
          {chips.length ? <Text style={[styles.chips, { fontSize: 38 * k, marginTop: 26 * k }]} numberOfLines={1}>{chips.join('  ·  ')}</Text> : null}

          {streak?.current > 0 ? (
            <Text style={[styles.streak, { fontSize: 46 * k, marginTop: 44 * k }]}>🔥 {streak.current} {streak.current === 1 ? 'semana' : 'semanas'} seguidas jugando</Text>
          ) : null}

          {stats.length ? (
            <View style={[styles.stats, { marginTop: 60 * k, gap: 24 * k }]}>
              {stats.slice(0, 3).map((stat) => (
                <View key={stat.label} style={[styles.stat, { borderRadius: 40 * k, paddingVertical: 34 * k }]}>
                  <Text style={[styles.statValue, { fontSize: 96 * k }]}>{stat.value}</Text>
                  <Text style={[styles.statLabel, { fontSize: 28 * k, letterSpacing: 2 * k }]}>{stat.label.toUpperCase()}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {form.length ? (
            <View style={[styles.form, { marginTop: 50 * k, gap: 22 * k }]}>
              {[...form].reverse().map((m) => (
                <View key={m.match_id} style={{ width: 92 * k, height: 92 * k, borderRadius: 46 * k, backgroundColor: FORM_COLORS[m.result] || '#555', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 44 * k, fontWeight: '900' }}>{FORM_LETTER[m.result] || '·'}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ flex: 1 }} />
          <Text style={[styles.cta, { fontSize: 44 * k }]}>Mira mi perfil en EasyFutbol</Text>
          {shareUrl ? <Text style={[styles.link, { fontSize: 34 * k, marginTop: 12 * k, marginBottom: 110 * k }]} numberOfLines={1}>{shareUrl.replace(/^https?:\/\//, '')}</Text> : <View style={{ height: 110 * k }} />}
        </View>
      ) : null}
    </View>
  );
}

export default function ProfileShareModal({ visible, onClose, ...cardProps }) {
  return (
    <ShareCardModal
      visible={visible}
      onClose={onClose}
      title="Comparte tu perfil"
      dialogTitle="Compartir mi perfil"
      fallbackMessage={`⚽ Mira mi perfil en EasyFutbol${cardProps.shareUrl ? `: ${cardProps.shareUrl}` : ''}`}
      renderCard={(cardRef, cardWidth) => <ProfileCard cardRef={cardRef} cardWidth={cardWidth} {...cardProps} />}
    />
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', aspectRatio: CARD_WIDTH / CARD_HEIGHT, backgroundColor: '#08090b', overflow: 'hidden' },
  glow: { position: 'absolute', backgroundColor: 'rgba(255,90,0,.10)' },
  brand: { flexDirection: 'row', alignItems: 'center' },
  brandText: { color: '#fff', fontWeight: '900' },
  name: { color: '#fff', fontWeight: '900', textAlign: 'center' },
  title: { backgroundColor: 'rgba(255,90,0,.16)', borderColor: 'rgba(255,90,0,.55)' },
  titleText: { color: '#ff7a32', fontWeight: '900' },
  chips: { color: '#a5a8ae', fontWeight: '700' },
  streak: { color: '#ff7a32', fontWeight: '900' },
  stats: { flexDirection: 'row', alignSelf: 'stretch' },
  stat: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,.06)' },
  statValue: { color: '#fff', fontWeight: '900' },
  statLabel: { color: '#8d9097', fontWeight: '900', marginTop: 6 },
  form: { flexDirection: 'row' },
  cta: { color: '#fff', fontWeight: '800' },
  link: { color: ORANGE, fontWeight: '800' },
});
