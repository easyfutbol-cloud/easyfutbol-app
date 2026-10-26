import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Chips, Crest, Divider, L, LeagueScreen, MatchRow, PageTitle, withLiveLeague } from '../../components/leagues/LeagueUI';
import { getTeam } from '../../data/leaguePreviewData';
import { useLeague } from '../../data/leagueCity';
import { useTeamProfiles } from '../../data/leagueTeamProfiles';

const FINAL_FOUR = 'ff';

function LeagueCalendarScreen({ navigation, route, league }) {
  useTeamProfiles();
  const { nextRound, playedRounds, totalRounds, roundWeekend } = league;
  const [round, setRound] = useState(route.params?.round || nextRound);
  useEffect(() => { if (route.params?.round) setRound(route.params.round); }, [route.params?.round]);
  // Al cambiar de ciudad, vuelve a su próxima jornada.
  const cityRef = useRef(league.id);
  useEffect(() => {
    if (cityRef.current !== league.id) {
      cityRef.current = league.id;
      setRound(nextRound);
    }
  }, [league.id, nextRound]);

  const options = [
    ...Array.from({ length: totalRounds }, (_, index) => {
      const number = index + 1;
      return [number, `J${number}`, number <= playedRounds ? 'Jugada' : number === nextRound ? 'Próxima' : roundWeekend(number).split(' ')[0]];
    }),
    [FINAL_FOUR, 'Final Four', league.finalFourWeekend],
  ];

  return (
    <LeagueScreen>
      <PageTitle title="Calendario" subtitle={`${totalRounds} jornadas · sábados y domingos a las 20:00 y 21:00`} />
      <Chips options={options} value={round} onChange={setRound} />
      <View style={styles.body}>
        {round === FINAL_FOUR ? <FinalFour /> : <Round round={round} onOpen={(match) => navigation.navigate('LeagueMatchDetail', { matchId: match.id })} />}
      </View>
    </LeagueScreen>
  );
}

function Round({ round, onOpen }) {
  const { roundMatches, playedRounds, nextRound, venue } = useLeague();
  const games = roundMatches(round);
  const days = [...new Set(games.map((match) => match.day))];
  const played = round <= playedRounds;
  return (
    <>
      <View style={styles.roundHead}>
        <Text style={styles.roundTitle}>Jornada {round}</Text>
        <View style={[styles.status, played ? styles.statusDone : round === nextRound && styles.statusNext]}>
          <Text style={[styles.statusText, round === nextRound && !played && { color: L.accent }]}>{played ? 'Finalizada' : round === nextRound ? 'Próxima' : 'Programada'}</Text>
        </View>
      </View>
      {days.map((day) => (
        <View key={day} style={styles.day}>
          <Text style={styles.dayLabel}>{day.toUpperCase()} · {venue.toUpperCase()}</Text>
          <Card style={styles.list}>
            {games.filter((match) => match.day === day).map((match, index) => (
              <View key={match.id}>
                {index > 0 && <Divider />}
                <MatchRow match={match} onPress={() => onOpen(match)} showMeta={false} />
              </View>
            ))}
          </Card>
        </View>
      ))}
      <View style={styles.note}>
        <Ionicons name="videocam-outline" size={15} color={L.muted} />
        <Text style={styles.noteText}>{played ? 'Todos los partidos de esta jornada están disponibles en YouTube.' : 'Todos los partidos se graban y se publican en YouTube.'}</Text>
      </View>
    </>
  );
}

function FinalFour() {
  const { standings, finalFourDays } = useLeague();
  const seeds = standings.slice(0, 4);
  const pairs = [[seeds[0], seeds[3]], [seeds[1], seeds[2]]];
  return (
    <>
      <View style={styles.roundHead}>
        <Text style={styles.roundTitle}>Final Four</Text>
        <View style={styles.status}><Text style={styles.statusText}>Provisional</Text></View>
      </View>
      <Text style={styles.ffIntro}>Los cuatro primeros al terminar la fase regular se juegan el título en un fin de semana. Cruces según la clasificación actual.</Text>
      {pairs.map((pair, index) => (
        <View key={index} style={styles.day}>
          <Text style={styles.dayLabel}>SEMIFINAL {index + 1} · {finalFourDays[0]} · {index === 0 ? '20:00' : '21:00'}</Text>
          <Card style={styles.list}>
            {pair.map((row, rowIndex) => (
              <View key={row.teamId}>
                {rowIndex > 0 && <Divider />}
                <View style={styles.seed}>
                  <Text style={styles.seedPos}>{row.position}º</Text>
                  <Crest teamId={row.teamId} size={28} />
                  <Text style={styles.seedName}>{getTeam(row.teamId).name}</Text>
                  <Text style={styles.seedPts}>{row.points} pts</Text>
                </View>
              </View>
            ))}
          </Card>
        </View>
      ))}
      <View style={styles.day}>
        <Text style={styles.dayLabel}>FINAL · {finalFourDays[1]} · 21:00</Text>
        <Card style={styles.final}>
          <Ionicons name="trophy" size={28} color={L.gold} />
          <Text style={styles.finalTitle}>Ganador SF1 vs Ganador SF2</Text>
          <Text style={styles.finalText}>Partido retransmitido y con entrega de trofeos al terminar.</Text>
        </Card>
      </View>
    </>
  );
}

export default withLiveLeague(LeagueCalendarScreen);

const styles = StyleSheet.create({
  body: { marginTop: 20 },
  roundHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  roundTitle: { color: L.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  status: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: L.raised },
  statusDone: { backgroundColor: 'rgba(52,211,153,0.12)' },
  statusNext: { backgroundColor: L.accentSoft },
  statusText: { color: L.soft, fontSize: 11, fontWeight: '800' },
  day: { marginBottom: 18 },
  dayLabel: { color: L.subtle, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  list: { paddingVertical: 2, paddingHorizontal: 14 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  noteText: { flex: 1, color: L.muted, fontSize: 12, lineHeight: 17 },
  ffIntro: { color: L.muted, fontSize: 13, lineHeight: 19, marginBottom: 18 },
  seed: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  seedPos: { width: 24, color: L.accent, fontSize: 13, fontWeight: '800' },
  seedName: { flex: 1, color: L.text, fontSize: 14, fontWeight: '700' },
  seedPts: { color: L.muted, fontSize: 12, fontWeight: '700' },
  final: { alignItems: 'center', paddingVertical: 22, borderColor: 'rgba(251,191,36,0.25)' },
  finalTitle: { color: L.text, fontSize: 16, fontWeight: '800', marginTop: 10 },
  finalText: { color: L.muted, fontSize: 12, marginTop: 4, textAlign: 'center' },
});
