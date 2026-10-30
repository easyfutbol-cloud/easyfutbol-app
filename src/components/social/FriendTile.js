// Tarjeta de amigo para la cuadrícula de Social: banda con su color, avatar
// con marco y dorsal, posición, media de su carta (si la enseña), partidos
// juntos y su próximo partido.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { FramedAvatar } from '../engagement/Cosmetics';
import { SocialAvatar } from './SocialComponents';
import { CARD_TIERS, POSITION_SHORT, accentFor, withAlpha } from '../../utils/profileTheme';

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** "Hoy 19:00", "Mañana 19:00", "Sáb 19:00" o "12 nov". */
export function shortMatchDate(value, now = new Date()) {
  const date = new Date(value);
  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(date) - startOf(now)) / 86400000);
  if (days === 0) return `Hoy ${time}`;
  if (days === 1) return `Mañana ${time}`;
  if (days > 1 && days < 7) return `${WEEKDAYS[date.getDay()]} ${time}`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
}

export default function FriendTile({ friend, onPress, onOpenMatch, style }) {
  const accent = accentFor(friend.profile_accent);
  const tier = friend.card ? CARD_TIERS[friend.card.tier] : null;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.tile, { borderColor: withAlpha(accent.color, 0.28) }, style]} accessibilityRole="button" accessibilityLabel={`Ver perfil de ${friend.name}`}>
      <LinearGradient colors={accent.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.band} />
      <View style={styles.avatarWrap}>
        <FramedAvatar frame={friend.cosmetics?.frame} size={62} ring={3}>
          <SocialAvatar uri={friend.avatar_url} name={friend.name} size={62} />
        </FramedAvatar>
        {friend.shirt_number ? <View style={[styles.shirt, { backgroundColor: accent.color }]}><Text style={styles.shirtText}>{friend.shirt_number}</Text></View> : null}
      </View>

      <Text numberOfLines={1} style={[styles.name, friend.is_plus && styles.plusName]}>{friend.name}</Text>
      {friend.nickname ? <Text numberOfLines={1} style={[styles.nickname, { color: accent.color }]}>«{friend.nickname}»</Text> : <View style={styles.nicknameSpacer} />}

      <View style={styles.chips}>
        {friend.primary_position ? <View style={styles.chip}><Text style={styles.chipText}>{POSITION_SHORT[friend.primary_position]}</Text></View> : null}
        {friend.card ? (
          <LinearGradient colors={[tier.rim[0], tier.rim[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.overall}>
            <Text style={styles.overallText}>{friend.card.overall}</Text>
          </LinearGradient>
        ) : null}
      </View>

      <Text style={styles.together}>
        {friend.matches_together ? `${friend.matches_together} ${friend.matches_together === 1 ? 'partido' : 'partidos'} juntos` : 'Aún no habéis jugado'}
      </Text>

      {friend.next_match ? (
        <TouchableOpacity onPress={() => onOpenMatch?.(friend.next_match)} style={[styles.next, { backgroundColor: withAlpha(accent.color, 0.14) }]} accessibilityRole="button" accessibilityLabel={`Ver su próximo partido: ${friend.next_match.title}`}>
          <Ionicons name="football" size={12} color={accent.color} />
          <Text numberOfLines={1} style={[styles.nextText, { color: accent.color }]}>{shortMatchDate(friend.next_match.starts_at)}</Text>
        </TouchableOpacity>
      ) : <View style={styles.nextSpacer} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 22, backgroundColor: '#141417', borderWidth: 1, overflow: 'hidden', alignItems: 'center', paddingBottom: 12 },
  band: { position: 'absolute', top: 0, left: 0, right: 0, height: 46, opacity: 0.9 },
  avatarWrap: { marginTop: 14 },
  shirt: { position: 'absolute', right: -4, bottom: -2, minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#141417' },
  shirtText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  name: { color: '#fff', fontSize: 14, fontWeight: '900', marginTop: 9, paddingHorizontal: 10, maxWidth: '100%' },
  plusName: { color: '#F4C95D' },
  nickname: { fontSize: 11, fontWeight: '800', marginTop: 1, paddingHorizontal: 10 },
  nicknameSpacer: { height: 14 },
  chips: { flexDirection: 'row', gap: 6, marginTop: 8, minHeight: 22, alignItems: 'center' },
  chip: { backgroundColor: '#222327', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  chipText: { color: '#c9cbd0', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  overall: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  overallText: { color: '#141417', fontSize: 11, fontWeight: '900' },
  together: { color: '#8d9097', fontSize: 10, fontWeight: '700', marginTop: 8 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, maxWidth: '90%' },
  nextText: { fontSize: 10, fontWeight: '900' },
  nextSpacer: { height: 27 },
});
