import React from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, Crest, Divider, FormDots, L, LeagueScreen, MatchRow, pressedFx, Section, Stat } from '../../components/leagues/LeagueUI';
import LeaguePlayerAvatar from '../../components/leagues/LeaguePlayerAvatar';
import { getTeam, leagueOfTeam, playerStats, standingOf, teamMatches, teamPlayers } from '../../data/leaguePreviewData';
import ProfileRequestPanel from '../../components/leagues/ProfileRequestPanel';
import { DEMO_CAPTAIN_TEAM_ID, DEMO_PLAYER_ID, useTeamProfiles } from '../../data/leagueTeamProfiles';

const GROUPS = [['POR', 'Porteros'], ['DEF', 'Defensas'], ['MED', 'Centrocampistas'], ['DEL', 'Delanteros']];

export default function LeagueTeamScreen({ route, navigation }) {
  useTeamProfiles();
  const team = getTeam(route.params?.teamId) || getTeam('nar');
  const city = leagueOfTeam(team.id);
  const row = standingOf(team.id);
  const games = teamMatches(team.id);
  const played = games.filter((match) => match.status === 'finished').reverse();
  const upcoming = games.filter((match) => match.status !== 'finished');
  const squad = teamPlayers(team.id);
  const captain = squad.find((player) => player.captain);
  const topScorer = squad.slice().sort((a, b) => playerStats[b.id].goals - playerStats[a.id].goals)[0];
  const openMatch = (match) => navigation.navigate('LeagueMatchDetail', { matchId: match.id });
  const isCaptain = team.id === DEMO_CAPTAIN_TEAM_ID;
  const hasAbout = team.bio || team.founded || team.instagram;

  return (
    <LeagueScreen tint={team.color} onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('LeagueStandings'))} backLabel="Atrás">
      <View style={styles.hero}>
        <View style={styles.banner}>
          {team.bannerUri ? (
            <Image source={{ uri: team.bannerUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient colors={[`${team.color}AA`, `${team.color}33`, L.surface]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={['transparent', 'rgba(19,21,25,0.95)']} style={styles.bannerFade} />
        </View>
        <View style={styles.identity}>
          <View style={styles.crestRing}><Crest teamId={team.id} size={76} /></View>
          <Text style={styles.name}>{team.name}</Text>
          {!!team.motto && <Text style={styles.motto}>“{team.motto}”</Text>}
          <View style={styles.metaRow}>
            <View style={[styles.colorDot, { backgroundColor: team.color }]} />
            <Text style={styles.meta}>{city.name} · {squad.length} jugadores{captain ? ` · Capitán: ${captain.name}` : ''}</Text>
          </View>
          <View style={styles.formRow}><FormDots form={row.form} size={9} /></View>
        </View>
      </View>

      {isCaptain && (
        <ProfileRequestPanel
          kind="team"
          targetId={team.id}
          icon="shield-half-outline"
          title="Zona del capitán"
          subtitle={`Estás viendo este equipo como ${captain?.name || 'capitán'}.`}
          editLabel="Personalizar equipo"
          onEdit={() => navigation.navigate('LeagueTeamEdit', { teamId: team.id })}
          onReview={() => navigation.navigate('LeagueTeamRequests')}
        />
      )}

      <View style={styles.stats}>
        <Stat value={`${row.position}º`} label="Posición" accent={row.position <= 4} />
        <Stat value={row.points} label="Puntos" />
        <Stat value={`${row.won}-${row.drawn}-${row.lost}`} label="G-E-P" />
        <Stat value={row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff} label="Dif." />
      </View>

      {hasAbout && (
        <Section title="Sobre el equipo">
          <Card>
            {!!team.bio && <Text style={styles.bio}>{team.bio}</Text>}
            {(!!team.founded || !!team.instagram) && (
              <View style={[styles.facts, !!team.bio && styles.factsSpaced]}>
                {!!team.founded && (
                  <View style={styles.fact}>
                    <Ionicons name="flag-outline" size={15} color={L.muted} />
                    <Text style={styles.factText}>Fundado en {team.founded}</Text>
                  </View>
                )}
                {!!team.instagram && (
                  <Pressable onPress={() => Linking.openURL(`https://instagram.com/${team.instagram}`)} style={styles.fact}>
                    <Ionicons name="logo-instagram" size={15} color={L.muted} />
                    <Text style={[styles.factText, { color: L.text }]}>@{team.instagram}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </Card>
        </Section>
      )}

      {!!upcoming.length && (
        <Section title="Próximos partidos">
          <Card style={styles.list}>
            {upcoming.map((match, index) => (
              <View key={match.id}>
                {index > 0 && <Divider />}
                <Text style={styles.matchLabel}>JORNADA {match.round} · {match.day.toUpperCase()}</Text>
                <MatchRow match={match} onPress={() => openMatch(match)} showMeta={false} highlightTeamId={team.id} />
              </View>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Resultados">
        <Card style={styles.list}>
          {played.map((match, index) => (
            <View key={match.id}>
              {index > 0 && <Divider />}
              <Text style={styles.matchLabel}>JORNADA {match.round}</Text>
              <MatchRow match={match} onPress={() => openMatch(match)} showMeta={false} highlightTeamId={team.id} />
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Plantilla">
        {GROUPS.map(([position, label]) => (
          <View key={position} style={styles.group}>
            <Text style={styles.groupLabel}>{label.toUpperCase()}</Text>
            <Card style={styles.list}>
              {squad.filter((player) => player.position === position).map((player, index) => {
                const stats = playerStats[player.id];
                return (
                  <View key={player.id}>
                    {index > 0 && <Divider />}
                    <Pressable onPress={() => navigation.navigate('LeaguePlayer', { playerId: player.id })} style={({ pressed }) => [styles.player, pressed && pressedFx]}>
                      <Text style={styles.number}>{player.number}</Text>
                      <LeaguePlayerAvatar name={player.name} playerId={player.id} size={34} featured={player.id === topScorer.id && stats.goals > 0} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.playerName}>{player.name}{player.captain ? '  (C)' : ''}{player.id === DEMO_PLAYER_ID ? '  · Tú' : ''}</Text>
                        <Text style={styles.playerMeta}>{player.nickname ? `“${player.nickname}” · ` : ''}{stats.played} PJ{stats.mvps ? ` · ${stats.mvps} MVP` : ''}</Text>
                      </View>
                      {position === 'POR' ? (
                        <PlayerStat value={stats.cleanSheets} label="P0" />
                      ) : (
                        <>
                          <PlayerStat value={stats.goals} label="G" />
                          <PlayerStat value={stats.assists} label="A" />
                        </>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </Card>
          </View>
        ))}
      </Section>
    </LeagueScreen>
  );
}

function PlayerStat({ value, label }) {
  return (
    <View style={styles.playerStat}>
      <Text style={[styles.playerStatValue, !value && { color: L.subtle }]}>{value}</Text>
      <Text style={styles.playerStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 22, backgroundColor: L.surface, borderWidth: 1, borderColor: L.line, overflow: 'hidden', marginTop: 4 },
  banner: { height: 150, backgroundColor: L.raised },
  bannerFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 70 },
  identity: { alignItems: 'center', paddingHorizontal: 18, paddingBottom: 20, marginTop: -46 },
  crestRing: { padding: 4, borderRadius: 30, backgroundColor: L.surface },
  name: { color: L.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginTop: 10, textAlign: 'center' },
  motto: { color: L.soft, fontSize: 14, fontStyle: 'italic', marginTop: 4, textAlign: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  colorDot: { width: 8, height: 8, borderRadius: 4 },
  meta: { color: L.muted, fontSize: 12 },
  formRow: { marginTop: 12 },
  bio: { color: L.soft, fontSize: 14, lineHeight: 21 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  factsSpaced: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: L.line },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factText: { color: L.muted, fontSize: 13, fontWeight: '600' },
  stats: { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 26 },
  list: { paddingVertical: 2, paddingHorizontal: 14 },
  matchLabel: { color: L.subtle, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, marginTop: 10, marginBottom: -4 },
  group: { marginBottom: 14 },
  groupLabel: { color: L.subtle, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 7 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  number: { width: 20, color: L.subtle, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  playerName: { color: L.text, fontSize: 14, fontWeight: '700' },
  playerMeta: { color: L.subtle, fontSize: 11, marginTop: 1 },
  playerStat: { width: 30, alignItems: 'center' },
  playerStatValue: { color: L.text, fontSize: 15, fontWeight: '800' },
  playerStatLabel: { color: L.subtle, fontSize: 9, fontWeight: '800' },
});
