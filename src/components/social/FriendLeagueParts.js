// Piezas visuales de una liga entre amigos: cabecera, podio, filas de la
// clasificación y reglas.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import PlayerCard from '../profile/PlayerCard';
import { SocialAvatar } from './SocialComponents';
import { CARD_TIERS } from '../../utils/profileTheme';
import { RULE_FIELDS, entryName, leaderGapText, playerShortName } from '../../utils/friendLeagueRules';

export const MEDALS = {
  1: { color: '#F4C95D', soft: 'rgba(244,201,93,.20)' },
  2: { color: '#C8CDD4', soft: 'rgba(200,205,212,.16)' },
  3: { color: '#D08C5B', soft: 'rgba(208,140,91,.18)' },
};
const NEUTRAL = { color: '#8d9097', soft: 'rgba(255,255,255,.07)' };
const medalFor = (rank) => MEDALS[rank] || NEUTRAL;
const percent = (value, total) => `${Math.min(100, Math.max(0, total ? (value / total) * 100 : 0))}%`;

export function ProgressBar({ value, total, color = '#ff5a00', height = 6 }) {
  return <View style={[styles.track, { height, borderRadius: height / 2 }]}>
    <View style={[styles.fill, { width: percent(value, total), backgroundColor: color, borderRadius: height / 2 }]}/>
  </View>;
}

export function RankBadge({ rank, size = 30 }) {
  const medal = medalFor(rank);
  return <View style={[styles.rankBadge, { width: size, height: size, borderRadius: size / 2, backgroundColor: medal.soft, borderColor: medal.color }]}>
    <Text style={[styles.rankBadgeText, { color: medal.color, fontSize: size * 0.46 }]}>{rank}</Text>
  </View>;
}

const STATUS = {
  draft: { label: 'SIN EMPEZAR', color: '#a5a8ae', colors: ['#24242a', '#17171a'] },
  active: { label: 'EN JUEGO', color: '#70c98a', colors: ['#4a1f07', '#1b1411'] },
  finished: { label: 'TERMINADA', color: '#F4C95D', colors: ['#4a3710', '#191610'] },
};

// Lo primero que ves: cómo vas tú, o quién ha ganado si la liga ha terminado.
export function LeagueHero({ league, myEntry, myLine, standings, acceptedCount, invitedCount }) {
  const status = STATUS[league.status] || STATUS.draft;
  const champions = standings.filter((entry) => entry.rank === 1);
  const elapsed = league.duration_days - (league.days_left ?? league.duration_days);
  const isTeam = league.team_size > 1;

  return <LinearGradient colors={status.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
    <View style={styles.heroPills}>
      <View style={styles.pill}><View style={[styles.pillDot, { backgroundColor: status.color }]}/><Text style={[styles.pillText, { color: status.color }]}>{status.label}</Text></View>
      {league.demo ? <View style={styles.demoPill}><Text style={styles.demoPillText}>EJEMPLO</Text></View> : null}
    </View>

    {league.status === 'finished' && champions.length ? <>
      <Text style={styles.heroEmoji}>🏆</Text>
      <Text style={styles.heroKicker}>{champions.length > 1 ? 'CAMPEONES' : 'CAMPEÓN'}</Text>
      <Text style={styles.heroTitle}>{champions.map(entryName).join(' · ')}</Text>
      <Text style={styles.heroBody}>{champions[0].points} puntos{myEntry && myEntry.rank > 1 ? ` · ${isTeam ? 'Tu equipo acabó' : 'Acabaste'} ${myEntry.rank}º` : ''}</Text>
    </> : null}

    {league.status === 'active' && myEntry ? <>
      <View style={styles.heroMain}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroKicker}>{isTeam ? 'TU EQUIPO VA' : 'VAS'}</Text>
          <Text style={styles.heroRank}>{myEntry.rank}º</Text>
          <Text style={styles.heroBody}>{leaderGapText(myEntry, standings)}</Text>
        </View>
        <View style={styles.heroPoints}>
          <Text style={styles.heroPointsValue}>{myEntry.points}</Text>
          <Text style={styles.heroPointsLabel}>PUNTOS</Text>
        </View>
      </View>
      <Meter icon="football-outline" label="Tus partidos" value={`${myLine.matches} de ${league.matches_goal}`} current={myLine.matches} total={league.matches_goal}/>
      <Meter icon="time-outline" label="Tiempo" value={league.days_left === 1 ? 'Queda 1 día' : `Quedan ${league.days_left} días`} current={elapsed} total={league.duration_days} color="#d4d4d7"/>
    </> : null}

    {league.status === 'draft' ? <>
      <Text style={styles.heroTitle}>{acceptedCount} {acceptedCount === 1 ? 'jugador listo' : 'jugadores listos'}</Text>
      <Text style={styles.heroBody}>{invitedCount ? `${invitedCount === 1 ? 'Falta 1 invitación' : `Faltan ${invitedCount} invitaciones`} por responder.` : 'Nadie tiene invitaciones por responder.'}</Text>
    </> : null}
  </LinearGradient>;
}

function Meter({ icon, label, value, current, total, color }) {
  return <View style={styles.meter}>
    <View style={styles.meterRow}>
      <Ionicons name={icon} color="#c9cbd0" size={14}/>
      <Text style={styles.meterLabel}>{label}</Text>
      <Text style={styles.meterValue}>{value}</Text>
    </View>
    <ProgressBar value={current} total={total} color={color}/>
  </View>;
}

// Podio con las cartas: el primero en el centro y más grande.
export function LeaguePodium({ standings, myUserId, onOpenPlayer }) {
  const { width } = useWindowDimensions();
  const top = standings.slice(0, 3);
  const ordered = top.length === 3 ? [top[1], top[0], top[2]] : top;
  const unit = (width - 32 - 16) / 3.24;

  return <View style={styles.podium}>
    {ordered.map((entry) => {
      const isFirst = entry === top[0];
      const cardWidth = isFirst ? unit * 1.24 : unit;
      const medal = medalFor(entry.rank);
      const mine = entry.players.some((item) => item.user_id === myUserId);
      const [solo] = entry.players;
      return <View key={solo.user_id} style={[styles.podiumColumn, { width: cardWidth }]}>
        {entry.players.length === 1
          ? <TouchableOpacity activeOpacity={0.85} disabled={!onOpenPlayer} onPress={() => onOpenPlayer?.(solo.user_id)} accessibilityRole="button" accessibilityLabel={`Ver perfil de ${solo.name}`}>
            <PlayerCard compact card={solo.card} name={solo.name} nickname={solo.nickname} avatarUrl={solo.avatar_url} nameColor={solo.is_plus ? '#F4C95D' : undefined} width={cardWidth}/>
          </TouchableOpacity>
          : <View style={styles.podiumTeam}>
            <View style={styles.teamAvatars}>{entry.players.map((item, index) => <View key={item.user_id} style={[styles.teamAvatar, { borderColor: medal.color }, index > 0 && styles.teamAvatarOverlap]}><SocialAvatar uri={item.avatar_url} name={item.name} size={isFirst ? 46 : 38}/></View>)}</View>
            <Text numberOfLines={2} style={styles.podiumTeamName}>{entryName(entry)}</Text>
          </View>}
        <LinearGradient colors={[medal.soft, 'rgba(255,255,255,.02)']} style={[styles.pedestal, { height: isFirst ? 66 : entry.rank === 2 ? 52 : 42, borderColor: mine ? '#ff5a00' : medal.soft }]}>
          <Text style={[styles.pedestalRank, { color: medal.color }]}>{entry.rank}º</Text>
          <Text style={styles.pedestalPoints}>{entry.points} pts</Text>
        </LinearGradient>
      </View>;
    })}
  </View>;
}

export function StandingRow({ entry, mine, open, onToggle, teamSize }) {
  const [first] = entry.players;
  const tier = CARD_TIERS[first.card?.tier];
  return <View>
    <TouchableOpacity style={[styles.row, mine && styles.rowMine]} onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }}>
      <RankBadge rank={entry.rank}/>
      <View style={styles.rowAvatars}>
        {entry.players.map((item, index) => <View key={item.user_id} style={index ? styles.rowAvatarOverlap : null}><SocialAvatar uri={item.avatar_url} name={item.name} size={38}/></View>)}
        {teamSize === 1 && first.card ? <View style={[styles.overall, { borderColor: tier?.glow || '#555' }]}><Text style={styles.overallText}>{first.card.overall}</Text></View> : null}
      </View>
      <View style={styles.rowCopy}>
        <View style={styles.rowTitle}>
          <Text numberOfLines={1} style={[styles.rowName, first.is_plus && teamSize === 1 ? styles.plusName : null]}>{entryName(entry)}</Text>
          {entry.rival_wins ? <View style={styles.flash}><Ionicons name="flash" color="#ffb020" size={10}/><Text style={styles.flashText}>{entry.rival_wins}</Text></View> : null}
        </View>
        <View style={styles.rowProgress}>
          <View style={styles.rowBar}><ProgressBar value={entry.matches} total={entry.matches_target} height={4} color={mine ? '#ff5a00' : '#6d7077'}/></View>
          <Text style={styles.rowMatches}>{entry.matches}/{entry.matches_target}</Text>
        </View>
      </View>
      <View style={styles.rowPoints}>
        <Text style={styles.rowPointsValue}>{entry.points}</Text>
        <Text style={styles.rowPointsLabel}>PTS</Text>
      </View>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} color="#666" size={15}/>
    </TouchableOpacity>
    {open ? entry.players.map((item) => <Breakdown key={item.user_id} player={item} showName={entry.players.length > 1}/>) : null}
  </View>;
}

function Breakdown({ player, showName }) {
  const items = [
    ['V', player.wins], ['E', player.draws], ['D', player.losses], ['Goles', player.goals],
    ['Asist.', player.assists], ['Par.', player.saves], ['MVP', player.mvps],
  ];
  return <View style={styles.breakdown}>
    {showName ? <Text style={styles.breakdownName}>{playerShortName(player)} · {player.points} pts · {player.matches} partidos</Text> : null}
    <View style={styles.breakdownRow}>
      {items.map(([label, value]) => <View key={label} style={styles.breakdownItem}>
        <Text style={[styles.breakdownValue, !value && styles.breakdownZero]}>{value}</Text>
        <Text style={styles.breakdownLabel}>{label}</Text>
      </View>)}
    </View>
  </View>;
}

export function LeagueRules({ rules, matchesGoal }) {
  return <View style={styles.rulesCard}>
    <View style={styles.rules}>
      {RULE_FIELDS.map((field) => {
        const value = rules[field.key];
        return <View key={field.key} style={[styles.rule, value === 0 && styles.ruleOff]}>
          <Ionicons name={field.icon} color={value < 0 ? '#e5484d' : '#ff7a32'} size={18}/>
          <Text style={[styles.ruleValue, value < 0 && styles.ruleNegative]}>{value === 0 ? '0' : value > 0 ? `+${value}` : value}</Text>
          <Text style={styles.ruleLabel}>{field.label}</Text>
        </View>;
      })}
    </View>
    {rules.double_vs_rivals ? <View style={styles.doubleRule}>
      <View style={styles.doubleIcon}><Ionicons name="flash" color="#ffb020" size={15}/></View>
      <Text style={styles.doubleText}>La victoria vale doble contra un rival de la liga que juega enfrente.</Text>
    </View> : null}
    <View style={[styles.doubleRule, rules.double_vs_rivals && styles.ruleDivider]}>
      <View style={styles.doubleIcon}><Ionicons name="football-outline" color="#c9cbd0" size={15}/></View>
      <Text style={styles.doubleText}>Cuentan los primeros {matchesGoal} partidos de cada jugador desde el inicio, con el resultado cerrado.</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  track: { width: '100%', backgroundColor: 'rgba(255,255,255,.11)', overflow: 'hidden' },
  fill: { height: '100%' },
  rankBadge: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  rankBadgeText: { fontWeight: '900' },

  hero: { borderRadius: 24, padding: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,.09)', marginBottom: 16 },
  heroPills: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 11, backgroundColor: 'rgba(0,0,0,.32)' },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  demoPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 11, backgroundColor: '#ff5a00' },
  demoPillText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  heroEmoji: { fontSize: 38, textAlign: 'center' },
  heroKicker: { color: '#d9c9bd', fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  heroTitle: { color: '#fff', fontSize: 23, fontWeight: '900', marginTop: 2 },
  heroBody: { color: '#d4d0cc', fontSize: 13, fontWeight: '600', marginTop: 3 },
  heroMain: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 },
  heroCopy: { flex: 1 },
  heroRank: { color: '#fff', fontSize: 50, lineHeight: 56, fontWeight: '900' },
  heroPoints: { alignItems: 'flex-end' },
  heroPointsValue: { color: '#ff8b4b', fontSize: 38, lineHeight: 42, fontWeight: '900' },
  heroPointsLabel: { color: '#d9c9bd', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  meter: { marginTop: 11 },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  meterLabel: { flex: 1, color: '#c9cbd0', fontSize: 12, fontWeight: '700' },
  meterValue: { color: '#fff', fontSize: 12, fontWeight: '800' },

  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8 },
  podiumColumn: { alignItems: 'center' },
  podiumTeam: { alignItems: 'center', width: '100%' },
  teamAvatars: { flexDirection: 'row' },
  teamAvatar: { borderWidth: 2, borderRadius: 30, backgroundColor: '#000' },
  teamAvatarOverlap: { marginLeft: -13 },
  podiumTeamName: { color: '#fff', fontSize: 13, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  pedestal: { width: '100%', marginTop: 8, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pedestalRank: { fontSize: 17, fontWeight: '900' },
  pedestalPoints: { color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 1 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  rowMine: { backgroundColor: 'rgba(255,90,0,.11)' },
  rowAvatars: { flexDirection: 'row' },
  rowAvatarOverlap: { marginLeft: -13 },
  overall: { position: 'absolute', right: -7, bottom: -5, minWidth: 23, paddingHorizontal: 3, paddingVertical: 1, borderRadius: 8, borderWidth: 1, backgroundColor: '#0d0d10', alignItems: 'center' },
  overallText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  rowCopy: { flex: 1, marginLeft: 3 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { flexShrink: 1, color: '#fff', fontSize: 14, fontWeight: '900' },
  plusName: { color: '#F4C95D' },
  flash: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 7, backgroundColor: 'rgba(255,176,32,.14)' },
  flashText: { color: '#ffb020', fontSize: 10, fontWeight: '900' },
  rowProgress: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  rowBar: { flex: 1 },
  rowMatches: { color: '#85878d', fontSize: 10, fontWeight: '700' },
  rowPoints: { alignItems: 'flex-end', minWidth: 32 },
  rowPointsValue: { color: '#fff', fontSize: 20, lineHeight: 23, fontWeight: '900' },
  rowPointsLabel: { color: '#85878d', fontSize: 8, fontWeight: '900' },
  breakdown: { paddingHorizontal: 12, paddingBottom: 13, paddingTop: 2, backgroundColor: '#131316' },
  breakdownName: { color: '#c9cbd0', fontSize: 12, fontWeight: '800', paddingTop: 10 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10 },
  breakdownItem: { alignItems: 'center', minWidth: 36 },
  breakdownValue: { color: '#fff', fontSize: 15, fontWeight: '900' },
  breakdownZero: { color: '#55575d' },
  breakdownLabel: { color: '#85878d', fontSize: 9, fontWeight: '700', marginTop: 2 },

  rulesCard: { backgroundColor: '#17171a', borderRadius: 18, borderWidth: 1, borderColor: '#26262b', padding: 12 },
  rules: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  rule: { width: '23%', flexGrow: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 13, backgroundColor: '#212125' },
  ruleOff: { opacity: 0.4 },
  ruleValue: { color: '#fff', fontSize: 17, fontWeight: '900', marginTop: 4 },
  ruleNegative: { color: '#e5484d' },
  ruleLabel: { color: '#a5a8ae', fontSize: 10, fontWeight: '700', marginTop: 1 },
  doubleRule: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 11, marginTop: 4 },
  ruleDivider: { marginTop: 7, borderTopWidth: 1, borderTopColor: '#26262b' },
  doubleIcon: { width: 28, height: 28, borderRadius: 10, backgroundColor: '#212125', alignItems: 'center', justifyContent: 'center' },
  doubleText: { flex: 1, color: '#a5a8ae', fontSize: 12, lineHeight: 17 },
});
