import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, Crest, Divider, L, LeagueScreen, pressedFx, Section, Stat } from '../../components/leagues/LeagueUI';
import LeaguePlayerAvatar from '../../components/leagues/LeaguePlayerAvatar';
import ProfileRequestPanel from '../../components/leagues/ProfileRequestPanel';
import { getPlayer, getTeam, leagueOfTeam, playerStats } from '../../data/leaguePreviewData';
import { DEMO_PLAYER_ID, useTeamProfiles } from '../../data/leagueTeamProfiles';

export const POSITION_NAMES = { POR: 'Portero', DEF: 'Defensa', MED: 'Centrocampista', DEL: 'Delantero' };

export default function LeaguePlayerScreen({ route, navigation }) {
  useTeamProfiles();
  const player = getPlayer(route.params?.playerId) || getPlayer(DEMO_PLAYER_ID);
  const team = getTeam(player.teamId);
  const stats = playerStats[player.id];
  const keeper = player.position === 'POR';
  const isMe = player.id === DEMO_PLAYER_ID;
  const appearances = playerMatches(player);
  const hasAbout = player.bio || player.foot || player.instagram;

  return (
    <LeagueScreen tint={team.color} onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('LeagueTeam', { teamId: team.id }))} backLabel="Atrás">
      <View style={styles.hero}>
        <LinearGradient colors={[`${team.color}55`, `${team.color}14`, L.surface]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={StyleSheet.absoluteFill} />
        <Text style={[styles.bigNumber, { color: `${team.color}33` }]}>{player.number}</Text>
        <LeaguePlayerAvatar name={player.name} playerId={player.id} size={92} featured />
        <Text style={styles.name}>{player.name}</Text>
        {!!player.nickname && <Text style={styles.nickname}>“{player.nickname}”</Text>}
        <View style={styles.tags}>
          <Tag text={`#${player.number}`} />
          <Tag text={POSITION_NAMES[player.position]} />
          {player.captain && <Tag text="Capitán" accent />}
        </View>
        <Pressable onPress={() => navigation.navigate('LeagueTeam', { teamId: team.id })} style={styles.team}>
          <Crest teamId={team.id} size={22} />
          <Text style={styles.teamName}>{team.name}</Text>
          <Ionicons name="chevron-forward" size={14} color={L.muted} />
        </Pressable>
      </View>

      {isMe && (
        <ProfileRequestPanel
          kind="player"
          targetId={player.id}
          icon="person-circle-outline"
          title="Tu perfil de jugador"
          subtitle="Así te ven el resto de equipos de la liga."
          editLabel="Editar mi perfil"
          onEdit={() => navigation.navigate('LeaguePlayerEdit', { playerId: player.id })}
          onReview={() => navigation.navigate('LeagueTeamRequests')}
        />
      )}

      <View style={styles.stats}>
        <Stat value={stats.played} label="Partidos" />
        {keeper ? (
          <>
            <Stat value={stats.cleanSheets} label="Port. a cero" />
            <Stat value={stats.played ? (stats.conceded / stats.played).toFixed(1) : '0'} label="GE/partido" />
          </>
        ) : (
          <>
            <Stat value={stats.goals} label="Goles" />
            <Stat value={stats.assists} label="Asist." />
          </>
        )}
        <Stat value={stats.mvps} label="MVP" accent={stats.mvps > 0} />
      </View>

      {hasAbout && (
        <Section title="Sobre mí">
          <Card>
            {!!player.bio && <Text style={styles.bio}>{player.bio}</Text>}
            {(!!player.foot || !!player.instagram) && (
              <View style={[styles.facts, !!player.bio && styles.factsSpaced]}>
                {!!player.foot && (
                  <View style={styles.fact}>
                    <Ionicons name="footsteps-outline" size={15} color={L.muted} />
                    <Text style={styles.factText}>{player.foot}</Text>
                  </View>
                )}
                {!!player.instagram && (
                  <Pressable onPress={() => Linking.openURL(`https://instagram.com/${player.instagram}`)} style={styles.fact}>
                    <Ionicons name="logo-instagram" size={15} color={L.muted} />
                    <Text style={[styles.factText, { color: L.text }]}>@{player.instagram}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </Card>
        </Section>
      )}

      <Section title="Partidos">
        {appearances.length ? (
          <Card style={styles.list}>
            {appearances.map(({ match, opponentId, own, other, goals, assists, mvp, yellow, starter }, index) => {
              const result = own > other ? 'V' : own < other ? 'D' : 'E';
              return (
                <View key={match.id}>
                  {index > 0 && <Divider />}
                  <Pressable onPress={() => navigation.navigate('LeagueMatchDetail', { matchId: match.id })} style={({ pressed }) => [styles.match, pressed && pressedFx]}>
                    <View style={[styles.result, styles[`result${result}`]]}><Text style={styles.resultText}>{result}</Text></View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.opponent}>
                        <Text style={styles.vs}>vs</Text>
                        <Crest teamId={opponentId} size={18} />
                        <Text numberOfLines={1} style={styles.opponentName}>{getTeam(opponentId).name}</Text>
                      </View>
                      <Text style={styles.matchMeta}>Jornada {match.round} · {own}-{other} · {starter ? 'Titular' : 'Suplente'}</Text>
                    </View>
                    <View style={styles.marks}>
                      {Array.from({ length: goals }).map((_, i) => <Ionicons key={`g${i}`} name="football" size={13} color={L.soft} />)}
                      {assists > 0 && <Text style={styles.assist}>A{assists > 1 ? assists : ''}</Text>}
                      {yellow && <View style={styles.card} />}
                      {mvp && <Ionicons name="star" size={13} color={L.gold} />}
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </Card>
        ) : (
          <Text style={styles.empty}>Todavía no ha disputado ningún partido.</Text>
        )}
      </Section>
    </LeagueScreen>
  );
}

function playerMatches(player) {
  return leagueOfTeam(player.teamId).finishedMatches.flatMap((match) => {
    const side = match.homeId === player.teamId ? 'home' : match.awayId === player.teamId ? 'away' : null;
    if (!side) return [];
    const lineup = match.lineups[side];
    const starter = lineup.starters.some((item) => item.id === player.id);
    const sub = lineup.bench.slice(0, 2).some((item) => item.id === player.id);
    if (!starter && !sub) return [];
    const own = side === 'home' ? match.homeScore : match.awayScore;
    const other = side === 'home' ? match.awayScore : match.homeScore;
    return [{
      match,
      starter,
      own,
      other,
      opponentId: side === 'home' ? match.awayId : match.homeId,
      goals: match.events.filter((event) => event.type === 'goal' && event.playerId === player.id).length,
      assists: match.events.filter((event) => event.type === 'goal' && event.assistId === player.id).length,
      yellow: match.events.some((event) => event.type === 'yellow' && event.playerId === player.id),
      mvp: match.mvpId === player.id,
    }];
  }).reverse();
}

function Tag({ text, accent }) {
  return <View style={[styles.tag, accent && styles.tagAccent]}><Text style={[styles.tagText, accent && { color: L.accent }]}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: 24, paddingBottom: 18, paddingHorizontal: 16, borderRadius: 22, overflow: 'hidden', backgroundColor: L.surface, borderWidth: 1, borderColor: L.line, marginTop: 4 },
  bigNumber: { position: 'absolute', right: 14, top: -10, fontSize: 120, fontWeight: '900', letterSpacing: -4 },
  name: { color: L.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginTop: 12, textAlign: 'center' },
  nickname: { color: L.soft, fontSize: 14, fontStyle: 'italic', marginTop: 2 },
  tags: { flexDirection: 'row', gap: 6, marginTop: 10 },
  tag: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  tagAccent: { backgroundColor: L.accentSoft },
  tagText: { color: L.soft, fontSize: 11, fontWeight: '800' },
  team: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.25)' },
  teamName: { color: L.text, fontSize: 13, fontWeight: '700' },
  stats: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 26 },
  bio: { color: L.soft, fontSize: 14, lineHeight: 21 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  factsSpaced: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: L.line },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factText: { color: L.muted, fontSize: 13, fontWeight: '600' },
  list: { paddingVertical: 2, paddingHorizontal: 14 },
  match: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  result: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  resultV: { backgroundColor: 'rgba(52,211,153,0.15)' },
  resultE: { backgroundColor: 'rgba(156,163,175,0.15)' },
  resultD: { backgroundColor: 'rgba(248,113,113,0.15)' },
  resultText: { color: L.text, fontSize: 12, fontWeight: '800' },
  opponent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  vs: { color: L.subtle, fontSize: 11, fontWeight: '700' },
  opponentName: { flexShrink: 1, color: L.text, fontSize: 14, fontWeight: '700' },
  matchMeta: { color: L.subtle, fontSize: 11, marginTop: 3 },
  marks: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  assist: { color: L.soft, fontSize: 11, fontWeight: '800' },
  card: { width: 9, height: 12, borderRadius: 2, backgroundColor: '#FACC15' },
  empty: { color: L.muted, fontSize: 13 },
});
