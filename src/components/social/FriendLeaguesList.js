import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SocialAvatar } from './SocialComponents';
import { ProgressBar, RankBadge } from './FriendLeagueParts';
import { formatLabel } from '../../utils/friendLeagueRules';

const statusLine = (item) => {
  if (item.my_status === 'invited') return `${item.owner_name || 'Un amigo'} te ha invitado`;
  if (item.status === 'draft') return `${item.members_count} ${item.members_count === 1 ? 'jugador' : 'jugadores'} · Sin empezar`;
  if (item.status === 'finished') return item.my_rank === 1 ? '¡Has ganado esta liga!' : `Terminada · Acabaste ${item.my_rank}º`;
  return item.days_left === 1 ? 'Queda 1 día' : `Quedan ${item.days_left} días`;
};

const publicStatusLine = (item) => {
  if (item.status === 'finished') return item.leader_name ? `Terminada · Ganó ${item.leader_name}` : 'Terminada';
  if (item.status === 'draft') return 'Empieza pronto · Únete ya';
  return item.leader_name ? `Va líder ${item.leader_name} con ${item.leader_points} pts · Únete` : 'En juego · Únete';
};

// Pestaña "Ligas" de Social: tus ligas entre amigos y crear otra. Sin onOpenDemo no se ofrece el ejemplo.
export default function FriendLeaguesList({ items, publicItems = [], onOpen, onCreate, onOpenDemo }) {
  return <>
    <TouchableOpacity activeOpacity={0.88} onPress={onCreate} accessibilityRole="button">
      <LinearGradient colors={['#ff6a1a', '#c94400']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.create}>
        <View style={styles.createIcon}><Ionicons name="trophy" color="#ff5a00" size={21}/></View>
        <View style={styles.copy}>
          <Text style={styles.createTitle}>Crea tu liga</Text>
          <Text style={styles.createBody}>Compite con tus amigos en tus partidos de siempre, con tus reglas.</Text>
        </View>
        <Ionicons name="add-circle" color="#fff" size={26}/>
      </LinearGradient>
    </TouchableOpacity>

    {publicItems.length ? <>
      <Text style={styles.section}>LIGAS PÚBLICAS</Text>
      {publicItems.map((item) => <TouchableOpacity key={item.id} activeOpacity={0.85} style={[styles.card, styles.cardPublic]} onPress={() => onOpen(item.id)} accessibilityRole="button">
        <View style={styles.publicIcon}><Ionicons name="earth" color="#7fb0ff" size={20}/></View>
        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.meta}>{item.members_count} {item.members_count === 1 ? 'jugador' : 'jugadores'} · {item.matches_goal} partidos{item.days_left !== null ? ` · ${item.days_left} días` : ''}</Text>
          <Text style={styles.status} numberOfLines={1}>{publicStatusLine(item)}</Text>
        </View>
        <Ionicons name="chevron-forward" color="#666" size={18}/>
      </TouchableOpacity>)}
      {items.length ? <Text style={styles.section}>TUS LIGAS</Text> : null}
    </> : null}

    {!items.length ? <View style={styles.explainer}>
      <Line icon="options-outline" text="Decide cuánto vale cada victoria, gol, asistencia, parada y MVP."/>
      <Line icon="people-outline" text="Juega solo, en parejas o en tríos, los partidos que elijáis."/>
      <Line icon="flash-outline" text="Ganar a alguien de tu liga puede valer el doble."/>
    </View> : null}

    {items.map((item) => {
      const playing = item.status !== 'draft' && item.my_status === 'accepted';
      const finished = item.status === 'finished';
      return <TouchableOpacity key={item.id} activeOpacity={0.85} style={[styles.card, item.my_status === 'invited' && styles.cardInvited]} onPress={() => onOpen(item.id)} accessibilityRole="button">
        {playing
          ? <RankBadge rank={item.my_rank} size={42}/>
          : <View style={styles.leagueIcon}><Ionicons name={item.my_status === 'invited' ? 'mail' : 'hourglass-outline'} color="#ff7a32" size={19}/></View>}
        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            {item.is_public ? <Ionicons name="earth" color="#7fb0ff" size={14}/> : null}
            {item.my_status === 'invited' ? <View style={styles.newPill}><Text style={styles.newPillText}>NUEVA</Text></View> : null}
          </View>
          <Text style={styles.meta}>{formatLabel(item.team_size)} · {item.matches_goal} partidos</Text>
          {playing && !finished ? <View style={styles.progress}>
            <View style={styles.bar}><ProgressBar value={item.my_matches} total={item.matches_goal} height={4}/></View>
            <Text style={styles.progressText}>{item.my_matches}/{item.matches_goal}</Text>
          </View> : null}
          <Text style={[styles.status, finished && item.my_rank === 1 && styles.statusWon]}>{statusLine(item)}</Text>
        </View>
        {playing
          ? <View style={styles.points}><Text style={styles.pointsValue}>{item.my_points}</Text><Text style={styles.pointsLabel}>PTS</Text></View>
          : <View style={styles.avatars}>{item.avatars.slice(0, 3).map((player, index) => <View key={player.id} style={index ? styles.avatarOverlap : null}><SocialAvatar uri={player.avatar_url} name={player.name} size={28}/></View>)}</View>}
      </TouchableOpacity>;
    })}

    {onOpenDemo ? <TouchableOpacity style={styles.demo} onPress={onOpenDemo} accessibilityRole="button">
      <Ionicons name="eye-outline" color="#ff7a32" size={18}/>
      <Text style={styles.demoText}>Ver una liga de ejemplo</Text>
      <Ionicons name="chevron-forward" color="#ff7a32" size={16}/>
    </TouchableOpacity> : null}
  </>;
}

function Line({ icon, text }) {
  return <View style={styles.line}><View style={styles.lineIcon}><Ionicons name={icon} color="#ff7a32" size={16}/></View><Text style={styles.lineText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  create: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 20, marginBottom: 12 },
  createIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  createTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  createBody: { color: 'rgba(255,255,255,.88)', fontSize: 12, lineHeight: 16, marginTop: 3 },
  copy: { flex: 1 },
  explainer: { backgroundColor: '#17171a', borderRadius: 18, borderWidth: 1, borderColor: '#26262b', padding: 14, gap: 11, marginBottom: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,90,0,.13)', alignItems: 'center', justifyContent: 'center' },
  lineText: { flex: 1, color: '#c9cbd0', fontSize: 13, lineHeight: 17 },
  section: { color: '#9b9ba1', fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginTop: 6, marginBottom: 9 },
  cardPublic: { borderColor: 'rgba(127,176,255,.35)' },
  publicIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(127,176,255,.14)', alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 19, backgroundColor: '#17171a', borderWidth: 1, borderColor: '#26262b', marginBottom: 10 },
  cardInvited: { borderColor: 'rgba(255,90,0,.6)', backgroundColor: 'rgba(255,90,0,.07)' },
  leagueIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,90,0,.13)', alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { flexShrink: 1, color: '#fff', fontSize: 16, fontWeight: '900' },
  newPill: { backgroundColor: '#ff5a00', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3 },
  newPillText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  meta: { color: '#85878d', fontSize: 11, fontWeight: '700', marginTop: 2 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
  bar: { flex: 1 },
  progressText: { color: '#a5a8ae', fontSize: 10, fontWeight: '800' },
  status: { color: '#ff8b4b', fontSize: 11, fontWeight: '800', marginTop: 6 },
  statusWon: { color: '#F4C95D' },
  points: { alignItems: 'flex-end', minWidth: 38 },
  pointsValue: { color: '#fff', fontSize: 23, lineHeight: 26, fontWeight: '900' },
  pointsLabel: { color: '#85878d', fontSize: 8, fontWeight: '900' },
  avatars: { flexDirection: 'row' },
  avatarOverlap: { marginLeft: -9 },
  demo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,122,50,.45)', marginTop: 2 },
  demoText: { color: '#ff8b4b', fontSize: 13, fontWeight: '900' },
});
