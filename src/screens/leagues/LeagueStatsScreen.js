import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, Crest, Divider, L, LeagueScreen, PageTitle, pressedFx, Segmented, SponsorSlot, Stat, withLiveLeague } from '../../components/leagues/LeagueUI';
import LeaguePlayerAvatar from '../../components/leagues/LeaguePlayerAvatar';
import { getTeam } from '../../data/leaguePreviewData';
import { useLeague } from '../../data/leagueCity';
import { useTeamProfiles } from '../../data/leagueTeamProfiles';

const TABS = [['goals', 'Goles'], ['assists', 'Asist.'], ['mvps', 'MVP'], ['goalkeepers', 'Porteros'], ['teams', 'Equipos']];
const UNIT = { goals: 'goles', assists: 'asistencias', mvps: 'MVP', goalkeepers: 'porterías a cero' };

function LeagueStatsScreen({ navigation, league }) {
  const { playedRounds, seasonTotals } = league;
  useTeamProfiles();
  const [tab, setTab] = useState('goals');
  const openTeam = (teamId) => navigation.navigate('LeagueTeam', { teamId });
  const openPlayer = (playerId) => navigation.navigate('LeaguePlayer', { playerId });

  return (
    <LeagueScreen>
      <PageTitle title="Estadísticas" subtitle={`Datos oficiales tras ${playedRounds} jornadas.`} />
      <View style={styles.totals}>
        <Stat value={seasonTotals.matches} label="Partidos" />
        <Stat value={seasonTotals.goals} label="Goles" />
        <Stat value={(seasonTotals.goals / seasonTotals.matches).toFixed(1)} label="Goles/partido" />
      </View>
      <Segmented options={TABS} value={tab} onChange={setTab} style={styles.segmented} />
      {tab === 'teams' ? <TeamStats onOpen={openTeam} /> : <PlayerRanking tab={tab} onOpen={openPlayer} />}
    </LeagueScreen>
  );
}

function PlayerRanking({ tab, onOpen }) {
  const { rankings } = useLeague();
  const rows = rankings[tab].slice(0, 10);
  const [leader, ...rest] = rows;
  const keeper = tab === 'goalkeepers';
  return (
    <>
      {tab === 'mvps' && <SponsorSlot label="Premio MVP presentado por" compact />}
      <Pressable onPress={() => onOpen(leader.player.id)} style={({ pressed }) => [styles.leader, tab === 'mvps' && { marginTop: 12 }, pressed && pressedFx]}>
        <LinearGradient colors={['rgba(255,122,46,0.30)', 'rgba(255,90,0,0.08)', 'rgba(18,20,25,0.4)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Ionicons name="trophy" size={110} color="rgba(255,255,255,0.05)" style={styles.leaderTrophy} />
        <LeaguePlayerAvatar name={leader.player.name} playerId={leader.player.id} size={58} featured />
        <View style={{ flex: 1 }}>
          <Text style={styles.leaderKicker}>LÍDER</Text>
          <Text style={styles.leaderName}>{leader.player.name}</Text>
          <View style={styles.leaderTeam}>
            <Crest teamId={leader.player.teamId} size={18} />
            <Text style={styles.leaderTeamText}>{getTeam(leader.player.teamId).name}</Text>
          </View>
        </View>
        <View style={styles.leaderValueBox}>
          <Text style={styles.leaderValue}>{leader.value}</Text>
          <Text style={styles.leaderUnit}>{UNIT[tab]}</Text>
        </View>
      </Pressable>
      <Card style={styles.list}>
        {keeper && (
          <View style={styles.listHead}>
            <Text style={[styles.headText, { flex: 1 }]}>Jugador</Text>
            <Text style={[styles.headText, styles.metric]}>P0</Text>
            <Text style={[styles.headText, styles.metric]}>GE/P</Text>
          </View>
        )}
        {rest.map((row, index) => (
          <View key={row.player.id}>
            {(index > 0 || keeper) && <Divider />}
            <Pressable onPress={() => onOpen(row.player.id)} style={({ pressed }) => [styles.row, pressed && pressedFx]}>
              <Text style={styles.pos}>{index + 2}</Text>
              <LeaguePlayerAvatar name={row.player.name} playerId={row.player.id} size={34} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.name}>{row.player.name}</Text>
                <Text style={styles.team}>{getTeam(row.player.teamId).name} · {row.stats.played} PJ</Text>
              </View>
              {keeper ? (
                <>
                  <Text style={[styles.value, styles.metric]}>{row.value}</Text>
                  <Text style={[styles.valueSoft, styles.metric]}>{row.perMatch.toFixed(2)}</Text>
                </>
              ) : (
                <Text style={styles.value}>{row.value}</Text>
              )}
            </Pressable>
          </View>
        ))}
      </Card>
      {keeper && <Text style={styles.help}>P0: porterías a cero · GE/P: goles encajados por partido.</Text>}
    </>
  );
}

function TeamStats({ onOpen }) {
  const { standings } = useLeague();
  const blocks = [
    ['Más goleador', [...standings].sort((a, b) => b.goalsFor - a.goalsFor), (row) => row.goalsFor, 'GF'],
    ['Menos goleado', [...standings].sort((a, b) => a.goalsAgainst - b.goalsAgainst), (row) => row.goalsAgainst, 'GC'],
    ['Mejor diferencia', [...standings].sort((a, b) => b.goalDiff - a.goalDiff), (row) => (row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff), 'DG'],
  ];
  return blocks.map(([title, rows, value, unit]) => (
    <View key={title} style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      <Card style={styles.list}>
        {rows.slice(0, 3).map((row, index) => (
          <View key={row.teamId}>
            {index > 0 && <Divider />}
            <Pressable onPress={() => onOpen(row.teamId)} style={({ pressed }) => [styles.row, pressed && pressedFx]}>
              <Text style={styles.pos}>{index + 1}</Text>
              <Crest teamId={row.teamId} size={30} />
              <Text style={[styles.name, { flex: 1 }]}>{getTeam(row.teamId).name}</Text>
              <Text style={styles.value}>{value(row)}</Text>
              <Text style={styles.unit}>{unit}</Text>
            </Pressable>
          </View>
        ))}
      </Card>
    </View>
  ));
}

export default withLiveLeague(LeagueStatsScreen);

const styles = StyleSheet.create({
  totals: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  segmented: { marginBottom: 16 },
  leader: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: 24, overflow: 'hidden', backgroundColor: L.surface, borderWidth: 1, borderColor: 'rgba(255,90,0,0.3)', marginBottom: 12 },
  leaderTrophy: { position: 'absolute', right: -14, bottom: -24, transform: [{ rotate: '-12deg' }] },
  leaderKicker: { color: L.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  leaderName: { color: L.text, fontSize: 18, fontWeight: '800', marginTop: 3 },
  leaderTeam: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  leaderTeamText: { color: L.soft, fontSize: 12, fontWeight: '600' },
  leaderValueBox: { alignItems: 'flex-end' },
  leaderValue: { color: L.text, fontSize: 42, fontWeight: '900', letterSpacing: -1.5 },
  leaderUnit: { color: L.muted, fontSize: 10, fontWeight: '700' },
  list: { paddingVertical: 2, paddingHorizontal: 14 },
  listHead: { flexDirection: 'row', paddingTop: 10, paddingBottom: 8 },
  headText: { color: L.subtle, fontSize: 10, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10 },
  pos: { width: 18, color: L.muted, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  name: { color: L.text, fontSize: 14, fontWeight: '700' },
  team: { color: L.subtle, fontSize: 11, marginTop: 2 },
  value: { color: L.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  valueSoft: { color: L.soft, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  metric: { width: 44, textAlign: 'center' },
  unit: { width: 22, color: L.subtle, fontSize: 10, fontWeight: '800' },
  help: { color: L.subtle, fontSize: 11, marginTop: 10, textAlign: 'center' },
  block: { marginBottom: 18 },
  blockTitle: { color: L.muted, fontSize: 12, fontWeight: '800', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
});
