import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, Crest, Divider, FormDots, L, LeagueScreen, pressedFx, Segmented, SponsorSlot } from '../../components/leagues/LeagueUI';
import LeaguePlayerAvatar from '../../components/leagues/LeaguePlayerAvatar';
import { getMatch, getPlayer, getTeam, leagueOfTeam, playerStats, standingOf } from '../../data/leaguePreviewData';
import { useTeamProfiles } from '../../data/leagueTeamProfiles';

export default function LeagueMatchDetailScreen({ route, navigation }) {
  useTeamProfiles();
  const match = getMatch(route.params?.matchId) || getMatch('vll-r1-1');
  const finished = match.status === 'finished';
  const [tab, setTab] = useState('summary');
  const openTeam = (teamId) => navigation.navigate('LeagueTeam', { teamId });
  const openPlayer = (playerId) => navigation.navigate('LeaguePlayer', { playerId });

  return (
    <LeagueScreen tint={getTeam(match.homeId).color} onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('LeagueCalendar'))} backLabel="Atrás">
      <View style={styles.board}>
        <LinearGradient colors={[`${getTeam(match.homeId).color}40`, 'rgba(18,20,25,0)', `${getTeam(match.awayId).color}40`]} start={{ x: 0, y: 0.3 }} end={{ x: 1, y: 0.7 }} style={StyleSheet.absoluteFill} />
        <Text style={styles.boardMeta}>JORNADA {match.round} · {match.day.toUpperCase()}</Text>
        <View style={styles.boardRow}>
          <BoardTeam teamId={match.homeId} onPress={() => openTeam(match.homeId)} />
          <View style={styles.boardCenter}>
            {finished ? (
              <Text style={styles.score}>{match.homeScore}<Text style={styles.scoreDash}> – </Text>{match.awayScore}</Text>
            ) : (
              <Text style={styles.kickoff}>{match.time}</Text>
            )}
            <View style={[styles.state, finished && styles.stateDone]}>
              <Text style={[styles.stateText, finished && { color: L.soft }]}>{finished ? 'Finalizado' : 'Próximamente'}</Text>
            </View>
          </View>
          <BoardTeam teamId={match.awayId} onPress={() => openTeam(match.awayId)} />
        </View>
        {finished && <Scorers match={match} />}
        <View style={styles.venue}>
          <Ionicons name="location-outline" size={13} color={L.subtle} />
          <Text style={styles.venueText}>{match.venue}</Text>
        </View>
      </View>

      <Pressable
        onPress={() => Alert.alert('Vídeo del partido', finished ? 'En la liga real, este botón abre el partido completo en YouTube.' : 'El partido se publicará en YouTube al terminar.')}
        style={({ pressed }) => [styles.video, pressed && pressedFx]}
      >
        <View style={styles.play}><Ionicons name="play" size={16} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.videoTitle}>{finished ? 'Ver partido completo' : 'Partido grabado'}</Text>
          <Text style={styles.videoText}>{finished ? 'YouTube · 50 min · resumen incluido' : 'Disponible en YouTube tras el pitido final'}</Text>
        </View>
        <Ionicons name="logo-youtube" size={22} color={L.muted} />
      </Pressable>

      {finished ? (
        <>
          <Segmented options={[['summary', 'Resumen'], ['lineups', 'Alineaciones'], ['report', 'Acta']]} value={tab} onChange={setTab} style={styles.segmented} />
          {tab === 'summary' && <Summary match={match} onPlayer={openPlayer} />}
          {tab === 'lineups' && <Lineups match={match} onPlayer={openPlayer} />}
          {tab === 'report' && <Report match={match} />}
        </>
      ) : (
        <Preview match={match} onPlayer={openPlayer} />
      )}
    </LeagueScreen>
  );
}

function BoardTeam({ teamId, onPress }) {
  const team = getTeam(teamId);
  return (
    <Pressable onPress={onPress} style={styles.boardTeam}>
      <Crest teamId={teamId} size={54} />
      <Text numberOfLines={2} style={styles.boardName}>{team.name}</Text>
    </Pressable>
  );
}

function Scorers({ match }) {
  const goals = (side) => match.events.filter((event) => event.type === 'goal' && event.side === side);
  const line = (event) => `${getPlayer(event.playerId).name.split(' ')[0]} ${event.minute}'`;
  return (
    <View style={styles.scorers}>
      <Text style={styles.scorersText}>{goals('home').map(line).join('\n')}</Text>
      <Ionicons name="football-outline" size={12} color={L.subtle} style={{ marginTop: 2 }} />
      <Text style={[styles.scorersText, { textAlign: 'right' }]}>{goals('away').map(line).join('\n')}</Text>
    </View>
  );
}

function Summary({ match, onPlayer }) {
  const mvp = getPlayer(match.mvpId);
  const mvpGoals = match.events.filter((event) => event.type === 'goal' && event.playerId === mvp.id).length;
  const mvpAssists = match.events.filter((event) => event.type === 'goal' && event.assistId === mvp.id).length;
  return (
    <>
      <Pressable onPress={() => onPlayer(mvp.id)} style={({ pressed }) => [styles.mvp, pressed && pressedFx]}>
        <LeaguePlayerAvatar name={mvp.name} playerId={mvp.id} size={48} featured />
        <View style={{ flex: 1 }}>
          <Text style={styles.mvpKicker}>MVP DEL PARTIDO</Text>
          <Text style={styles.mvpName}>{mvp.name}</Text>
          <Text style={styles.mvpTeam}>{getTeam(mvp.teamId).name} · {mvp.position}</Text>
        </View>
        <View style={styles.mvpStat}><Text style={styles.mvpValue}>{mvpGoals}</Text><Text style={styles.mvpLabel}>GOLES</Text></View>
        <View style={styles.mvpStat}><Text style={styles.mvpValue}>{mvpAssists}</Text><Text style={styles.mvpLabel}>ASIST.</Text></View>
      </Pressable>
      <SponsorSlot label="MVP presentado por" compact />
      <Text style={styles.blockTitle}>Minuto a minuto</Text>
      <Card style={styles.timeline}>
        {match.events.map((event, index) => {
          const home = event.side === 'home';
          const player = getPlayer(event.playerId);
          const assist = event.assistId ? getPlayer(event.assistId) : null;
          return (
            <View key={index} style={[styles.event, !home && styles.eventAway]}>
              <Text style={styles.minute}>{event.minute}'</Text>
              <View style={[styles.eventIcon, event.type === 'yellow' && styles.yellowIcon]}>
                {event.type === 'goal' ? <Ionicons name="football" size={13} color={L.text} /> : <View style={styles.card} />}
              </View>
              <View style={[styles.eventCopy, !home && { alignItems: 'flex-end' }]}>
                <Text style={styles.eventPlayer}>{player.name}</Text>
                <Text style={styles.eventDetail}>{event.type === 'goal' ? (assist ? `Asistencia de ${assist.name}` : 'Gol') : 'Tarjeta amarilla'}</Text>
              </View>
            </View>
          );
        })}
      </Card>
    </>
  );
}

function Lineups({ match, onPlayer }) {
  const [side, setSide] = useState('home');
  const teamId = side === 'home' ? match.homeId : match.awayId;
  const lineup = match.lineups[side];
  return (
    <>
      <Segmented options={[['home', getTeam(match.homeId).short], ['away', getTeam(match.awayId).short]]} value={side} onChange={setSide} style={styles.subSegmented} />
      <Text style={styles.blockTitle}>Titulares · 2-3-1</Text>
      <Card style={styles.list}>
        {lineup.starters.map((player, index) => (
          <View key={player.id}>
            {index > 0 && <Divider />}
            <PlayerLine player={player} match={match} mvp={player.id === match.mvpId} onPlayer={onPlayer} />
          </View>
        ))}
      </Card>
      <Text style={styles.blockTitle}>Suplentes</Text>
      <Card style={styles.list}>
        {lineup.bench.map((player, index) => (
          <View key={player.id}>
            {index > 0 && <Divider />}
            <PlayerLine player={player} match={match} onPlayer={onPlayer} />
          </View>
        ))}
      </Card>
      <Text style={styles.foot}>{getTeam(teamId).name} · cambios ilimitados</Text>
    </>
  );
}

function PlayerLine({ player, match, mvp, onPlayer }) {
  const goals = match.events.filter((event) => event.type === 'goal' && event.playerId === player.id).length;
  const assists = match.events.filter((event) => event.type === 'goal' && event.assistId === player.id).length;
  const yellow = match.events.some((event) => event.type === 'yellow' && event.playerId === player.id);
  return (
    <Pressable onPress={() => onPlayer(player.id)} style={({ pressed }) => [styles.playerLine, pressed && pressedFx]}>
      <Text style={styles.number}>{player.number}</Text>
      <LeaguePlayerAvatar name={player.name} playerId={player.id} size={30} />
      <Text numberOfLines={1} style={styles.playerName}>{player.name}{player.captain ? '  (C)' : ''}</Text>
      <View style={styles.badges}>
        {Array.from({ length: goals }).map((_, i) => <Ionicons key={`g${i}`} name="football" size={13} color={L.soft} />)}
        {assists > 0 && <Text style={styles.assist}>A{assists > 1 ? assists : ''}</Text>}
        {yellow && <View style={styles.card} />}
        {mvp && <Ionicons name="star" size={13} color={L.gold} />}
      </View>
      <Text style={styles.position}>{player.position}</Text>
    </Pressable>
  );
}

function Report({ match }) {
  const yellows = match.events.filter((event) => event.type === 'yellow').length;
  const rows = [
    ['person-outline', 'Árbitro', match.report.referee],
    ['time-outline', 'Duración', match.report.duration],
    ['location-outline', 'Campo', match.venue],
    ['albums-outline', 'Tarjetas amarillas', String(yellows)],
  ];
  return (
    <Card>
      {rows.map(([icon, label, value], index) => (
        <View key={label}>
          {index > 0 && <Divider />}
          <View style={styles.reportRow}>
            <Ionicons name={icon} size={17} color={L.accent} />
            <Text style={styles.reportLabel}>{label}</Text>
            <Text style={styles.reportValue}>{value}</Text>
          </View>
        </View>
      ))}
      <Divider />
      <Text style={styles.notesLabel}>OBSERVACIONES</Text>
      <Text style={styles.notes}>{match.report.notes}</Text>
    </Card>
  );
}

function Preview({ match, onPlayer }) {
  const sides = [match.homeId, match.awayId];
  const top = (teamId) => leagueOfTeam(teamId).rankings.goals.find((row) => row.player.teamId === teamId);
  const rows = [
    ['Posición', (id) => `${standingOf(id).position}º`],
    ['Puntos', (id) => standingOf(id).points],
    ['Goles a favor', (id) => standingOf(id).goalsFor],
    ['Goles en contra', (id) => standingOf(id).goalsAgainst],
  ];
  return (
    <>
      <Text style={styles.blockTitle}>Cara a cara</Text>
      <Card style={styles.list}>
        <View style={styles.compareHead}>
          <FormDots form={standingOf(sides[0]).form} size={8} />
          <Text style={styles.compareLabel}>Forma</Text>
          <FormDots form={standingOf(sides[1]).form} size={8} />
        </View>
        {rows.map(([label, value]) => (
          <View key={label}>
            <Divider />
            <View style={styles.compareRow}>
              <Text style={styles.compareValue}>{value(sides[0])}</Text>
              <Text style={styles.compareLabel}>{label}</Text>
              <Text style={[styles.compareValue, { textAlign: 'right' }]}>{value(sides[1])}</Text>
            </View>
          </View>
        ))}
      </Card>
      <Text style={styles.blockTitle}>Jugadores a seguir</Text>
      <View style={styles.watch}>
        {sides.map((teamId) => {
          const row = top(teamId);
          if (!row) return <View key={teamId} style={styles.watchCard} />;
          return (
            <Pressable key={teamId} onPress={() => onPlayer(row.player.id)} style={styles.watchCard}>
              <LeaguePlayerAvatar name={row.player.name} playerId={row.player.id} size={44} />
              <Text numberOfLines={1} style={styles.watchName}>{row.player.name}</Text>
              <Text style={styles.watchMeta}>{playerStats[row.player.id].goals} goles · {getTeam(teamId).short}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  board: { padding: 18, borderRadius: 26, overflow: 'hidden', backgroundColor: L.surface, borderWidth: 1, borderColor: L.line, borderTopColor: L.highlight, marginTop: 4, marginBottom: 10 },
  boardMeta: { color: L.subtle, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textAlign: 'center' },
  boardRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  boardTeam: { flex: 1, alignItems: 'center', gap: 8 },
  boardName: { color: L.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  boardCenter: { alignItems: 'center', paddingHorizontal: 6 },
  score: { color: L.text, fontSize: 44, fontWeight: '900', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  scoreDash: { color: L.subtle, fontWeight: '500' },
  kickoff: { color: L.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  state: { marginTop: 6, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: L.accentSoft },
  stateDone: { backgroundColor: L.raised },
  stateText: { color: L.accent, fontSize: 10, fontWeight: '800' },
  scorers: { flexDirection: 'row', gap: 10, marginTop: 16 },
  scorersText: { flex: 1, color: L.muted, fontSize: 11, lineHeight: 17 },
  venue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 16 },
  venueText: { color: L.subtle, fontSize: 11 },

  video: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: L.surface, borderWidth: 1, borderColor: L.line, marginBottom: 18 },
  play: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E62117', paddingLeft: 2 },
  videoTitle: { color: L.text, fontSize: 14, fontWeight: '800' },
  videoText: { color: L.muted, fontSize: 11, marginTop: 2 },

  segmented: { marginBottom: 16 },
  subSegmented: { marginBottom: 6, alignSelf: 'center', width: 180 },
  blockTitle: { color: L.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },

  mvp: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: 'rgba(251,191,36,0.07)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.22)', marginBottom: 10 },
  mvpKicker: { color: L.gold, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  mvpName: { color: L.text, fontSize: 16, fontWeight: '800', marginTop: 2 },
  mvpTeam: { color: L.muted, fontSize: 11, marginTop: 2 },
  mvpStat: { alignItems: 'center', minWidth: 38 },
  mvpValue: { color: L.text, fontSize: 20, fontWeight: '800' },
  mvpLabel: { color: L.subtle, fontSize: 8, fontWeight: '800' },

  timeline: { paddingVertical: 6, paddingHorizontal: 12 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  eventAway: { flexDirection: 'row-reverse' },
  minute: { width: 30, color: L.muted, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  eventIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: L.raised },
  yellowIcon: { backgroundColor: 'rgba(250,204,21,0.12)' },
  card: { width: 9, height: 12, borderRadius: 2, backgroundColor: '#FACC15' },
  eventCopy: { flex: 1 },
  eventPlayer: { color: L.text, fontSize: 13, fontWeight: '700' },
  eventDetail: { color: L.subtle, fontSize: 11, marginTop: 1 },

  list: { paddingVertical: 2, paddingHorizontal: 12 },
  playerLine: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  number: { width: 20, color: L.subtle, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  playerName: { flex: 1, color: L.text, fontSize: 13, fontWeight: '600' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  assist: { color: L.soft, fontSize: 11, fontWeight: '800' },
  position: { width: 30, color: L.subtle, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  foot: { color: L.subtle, fontSize: 11, marginTop: 10, textAlign: 'center' },

  reportRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  reportLabel: { flex: 1, color: L.muted, fontSize: 13 },
  reportValue: { color: L.text, fontSize: 13, fontWeight: '700' },
  notesLabel: { color: L.subtle, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginTop: 14 },
  notes: { color: L.soft, fontSize: 13, lineHeight: 19, marginTop: 6 },

  compareHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  compareValue: { width: 60, color: L.text, fontSize: 15, fontWeight: '800' },
  compareLabel: { flex: 1, color: L.muted, fontSize: 12, textAlign: 'center' },
  watch: { flexDirection: 'row', gap: 10 },
  watchCard: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: L.surface, borderWidth: 1, borderColor: L.line },
  watchName: { color: L.text, fontSize: 13, fontWeight: '800', marginTop: 8 },
  watchMeta: { color: L.muted, fontSize: 11, marginTop: 2 },
});
