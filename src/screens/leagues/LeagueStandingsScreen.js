import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Crest, FormDots, L, LeagueScreen, PageTitle, pressedFx, Segmented, withLiveLeague } from '../../components/leagues/LeagueUI';
import { getTeam } from '../../data/leaguePreviewData';
import { useTeamProfiles } from '../../data/leagueTeamProfiles';

const VIEWS = [['short', 'Resumen'], ['full', 'Completa'], ['form', 'Forma']];

function LeagueStandingsScreen({ navigation, league }) {
  const { standings, playedRounds } = league;
  useTeamProfiles();
  const [view, setView] = useState('short');
  const columns = view === 'full'
    ? [['PJ', 'played'], ['G', 'won'], ['E', 'drawn'], ['P', 'lost'], ['GF', 'goalsFor'], ['GC', 'goalsAgainst']]
    : view === 'short' ? [['PJ', 'played'], ['DG', 'goalDiff']] : [];

  return (
    <LeagueScreen>
      <PageTitle title="Clasificación" subtitle={`Actualizada tras la jornada ${playedRounds}. Los 4 primeros juegan la Final Four.`} />
      <Segmented options={VIEWS} value={view} onChange={setView} style={styles.segmented} />
      <Card style={styles.table}>
        <View style={[styles.row, styles.header]}>
          <Text style={[styles.pos, styles.headText, styles.headPos]}>#</Text>
          <Text style={[styles.team, styles.headText]}>Equipo</Text>
          {view === 'form' && <Text style={[styles.headText, styles.formHead]}>Últimos</Text>}
          {columns.map(([label]) => <Text key={label} style={[styles.num, styles.headText]}>{label}</Text>)}
          <Text style={[styles.pts, styles.headText]}>PTS</Text>
        </View>
        {standings.map((row) => {
          const team = getTeam(row.teamId);
          return (
            <Pressable key={row.teamId} onPress={() => navigation.navigate('LeagueTeam', { teamId: row.teamId })} style={({ pressed }) => [styles.row, row.position === 4 && styles.cut, pressed && pressedFx]}>
              <View style={[styles.zone, row.position <= 4 && styles.zoneOn]} />
              <View style={[styles.posBadge, row.position <= 4 && styles.posBadgeOn, row.position === 1 && styles.posBadgeFirst]}>
                <Text style={[styles.pos, row.position <= 4 && { color: L.text }]}>{row.position}</Text>
              </View>
              <View style={styles.team}>
                <Crest teamId={row.teamId} size={24} />
                <Text numberOfLines={1} style={styles.teamName}>{view === 'full' ? team.short : team.name}</Text>
              </View>
              {view === 'form' && <View style={styles.formCell}><FormDots form={row.form} size={9} /></View>}
              {columns.map(([label, key]) => (
                <Text key={label} style={styles.num}>{key === 'goalDiff' && row[key] > 0 ? `+${row[key]}` : row[key]}</Text>
              ))}
              <Text style={styles.pts}>{row.points}</Text>
            </Pressable>
          );
        })}
      </Card>
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.legendBar, { backgroundColor: L.accent }]} /><Text style={styles.legendText}>Final Four</Text></View>
        {view === 'form' && ['W', 'D', 'L'].map((key) => (
          <View key={key} style={styles.legendItem}><FormDots form={[key]} size={7} /><Text style={styles.legendText}>{{ W: 'Victoria', D: 'Empate', L: 'Derrota' }[key]}</Text></View>
        ))}
      </View>
      <Text style={styles.foot}>Victoria 3 puntos · Empate 1 · Desempate por diferencia de goles y goles a favor.</Text>
    </LeagueScreen>
  );
}

export default withLiveLeague(LeagueStandingsScreen);

const styles = StyleSheet.create({
  segmented: { marginBottom: 14 },
  table: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingRight: 12, borderTopWidth: 1, borderTopColor: L.line },
  header: { minHeight: 36, borderTopWidth: 0, backgroundColor: 'rgba(255,255,255,0.02)' },
  cut: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,90,0,0.35)' },
  zone: { width: 3, alignSelf: 'stretch', marginRight: 8 },
  zoneOn: { backgroundColor: L.accent },
  headText: { color: L.subtle, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  pos: { color: L.muted, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  headPos: { width: 35, paddingLeft: 11, textAlign: 'center' },
  posBadge: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  posBadgeOn: { backgroundColor: 'rgba(255,90,0,0.16)' },
  posBadgeFirst: { backgroundColor: L.accent },
  team: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, marginLeft: 8, minWidth: 0 },
  teamName: { flexShrink: 1, color: L.text, fontSize: 14, fontWeight: '700' },
  formHead: { width: 70, textAlign: 'center' },
  formCell: { width: 70, alignItems: 'center' },
  num: { width: 28, color: L.soft, fontSize: 13, fontWeight: '600', textAlign: 'center', fontVariant: ['tabular-nums'] },
  pts: { width: 34, color: L.text, fontSize: 15, fontWeight: '800', textAlign: 'right', fontVariant: ['tabular-nums'] },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 14, paddingHorizontal: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendBar: { width: 3, height: 12, borderRadius: 2 },
  legendText: { color: L.muted, fontSize: 12 },
  foot: { color: L.subtle, fontSize: 11, lineHeight: 16, marginTop: 10, paddingHorizontal: 4 },
});
