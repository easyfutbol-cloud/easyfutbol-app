import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, Crest, Divider, FormDots, L, LeagueScreen, MatchRow, pressedFx, Section, SponsorSlot } from '../../components/leagues/LeagueUI';
import LeaguePlayerAvatar from '../../components/leagues/LeaguePlayerAvatar';
import { getPlayer, getTeam, leagueOfTeam } from '../../data/leaguePreviewData';
import { useLeague } from '../../data/leagueCity';
import CityPreview from './CityPreview';
import { DEMO_PLAYER_ID, useTeamProfiles } from '../../data/leagueTeamProfiles';

export default function LeaguesHomeScreen({ navigation }) {
  useTeamProfiles();
  const league = useLeague();
  if (league.status !== 'live') return <CityPreview city={league} navigation={navigation} />;
  return <LiveHome league={league} navigation={navigation} />;
}

function LiveHome({ league, navigation }) {
  const {
    nextRound, playedRounds, totalRounds, rankings, roundMatches, roundWeekend,
    seasonTotals, standings, weeklySeven, news,
  } = league;
  const next = roundMatches(nextRound);
  const last = roundMatches(playedRounds);
  const openMatch = (match) => navigation.navigate('LeagueMatchDetail', { matchId: match.id });
  const openTeam = (teamId) => navigation.navigate('LeagueTeam', { teamId });
  const openPlayer = (playerId) => navigation.navigate('LeaguePlayer', { playerId });
  const me = getPlayer(DEMO_PLAYER_ID);
  const isMyCity = leagueOfTeam(me.teamId).id === league.id;

  return (
    <LeagueScreen onExit={() => navigation.navigate('AdminPanel')}>
      <LinearGradient colors={['#FF7A2E', '#E8500A', '#7A2A06']} locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Ionicons name="trophy" size={190} color="rgba(255,255,255,0.08)" style={styles.heroTrophy} />
        <View style={styles.heroBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.heroBadgeText}>{league.season.toUpperCase()} · {league.city.toUpperCase()}</Text>
        </View>
        <Text style={styles.heroTitle}>La liga ya está{'\n'}en juego</Text>
        <View style={styles.heroStats}>
          <HeroStat value={`${playedRounds}/${totalRounds}`} label="Jornadas" />
          <HeroStat value={seasonTotals.goals} label="Goles" />
          <HeroStat value={league.finalFourDate.replace('Sáb ', '')} label="Final Four" />
        </View>
        <View style={styles.progressTrack}>
          {Array.from({ length: totalRounds + 1 }).map((_, index) => (
            <View key={index} style={[styles.progressStep, index < playedRounds && styles.progressDone, index === totalRounds && styles.progressFinal]} />
          ))}
        </View>
      </LinearGradient>

      {isMyCity && (
        <Pressable onPress={() => openPlayer(me.id)} style={({ pressed }) => [styles.me, pressed && pressedFx]}>
          <LeaguePlayerAvatar name={me.name} playerId={me.id} size={38} />
          <View style={{ flex: 1 }}>
            <Text style={styles.meName}>{me.name}</Text>
            <Text style={styles.meMeta}>{getTeam(me.teamId).name} · #{me.number}</Text>
          </View>
          <Text style={styles.meLink}>Mi perfil</Text>
          <Ionicons name="chevron-forward" size={15} color={L.muted} />
        </Pressable>
      )}

      <SponsorSlot compact />

      <Section title={`Jornada ${nextRound}`} action="Calendario" onAction={() => navigation.navigate('LeagueCalendar')} style={styles.firstSection}>
        <Text style={styles.sectionHint}>{roundWeekend(nextRound)} · {league.venue}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fixtures}>
          {next.map((match) => (
            <Pressable key={match.id} onPress={() => openMatch(match)} style={({ pressed }) => [styles.fixture, pressed && pressedFx]}>
              <LinearGradient colors={[getTeam(match.homeId).color, getTeam(match.awayId).color]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fixtureStripe} />
              <View style={styles.fixtureWhenRow}>
                <Text style={styles.fixtureWhen}>{match.day.split(' ')[0].toUpperCase()}</Text>
                <View style={styles.fixtureTime}><Text style={styles.fixtureTimeText}>{match.time}</Text></View>
              </View>
              {[match.homeId, match.awayId].map((teamId) => (
                <View key={teamId} style={styles.fixtureTeam}>
                  <Crest teamId={teamId} size={24} />
                  <Text numberOfLines={1} style={styles.fixtureName}>{getTeam(teamId).name}</Text>
                </View>
              ))}
            </Pressable>
          ))}
        </ScrollView>
      </Section>

      <Section title="Clasificación" action="Completa" onAction={() => navigation.navigate('LeagueStandings')}>
        <Card style={styles.flush}>
          {standings.slice(0, 5).map((row, index) => (
            <View key={row.teamId}>
              {index === 4 && <View style={styles.cutLine}><Text style={styles.cutText}>ZONA FINAL FOUR ↑</Text></View>}
              <Pressable onPress={() => openTeam(row.teamId)} style={({ pressed }) => [styles.tableRow, pressed && pressedFx]}>
                <Text style={[styles.pos, row.position <= 4 && styles.posQualified]}>{row.position}</Text>
                <Crest teamId={row.teamId} size={24} />
                <Text numberOfLines={1} style={styles.tableTeam}>{getTeam(row.teamId).name}</Text>
                <FormDots form={row.form} size={6} />
                <Text style={styles.tablePts}>{row.points}</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Líderes" action="Estadísticas" onAction={() => navigation.navigate('LeagueRankings')}>
        <View style={styles.leaders}>
          <Leader label="Goles" row={rankings.goals[0]} onPress={openPlayer} />
          <Leader label="Asistencias" row={rankings.assists[0]} onPress={openPlayer} />
          <Leader label="MVP" row={rankings.mvps[0]} onPress={openPlayer} />
        </View>
      </Section>

      <Section title={`7 de la jornada ${weeklySeven.round}`}>
        <WeeklySeven weeklySeven={weeklySeven} />
      </Section>

      <Section title={`Resultados · Jornada ${playedRounds}`} action="Todos" onAction={() => navigation.navigate('LeagueCalendar', { round: playedRounds })}>
        <Card style={styles.listCard}>
          {last.map((match, index) => (
            <View key={match.id}>
              {index > 0 && <Divider />}
              <MatchRow match={match} onPress={() => openMatch(match)} />
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Actualidad">
        {news.map((item) => (
          <Card key={item.id} style={styles.news}>
            <View style={styles.newsTop}>
              <Text style={styles.newsTag}>{item.tag}</Text>
              <Text style={styles.newsDate}>{item.date}</Text>
            </View>
            <Text style={styles.newsTitle}>{item.title}</Text>
            <Text style={styles.newsText}>{item.text}</Text>
          </Card>
        ))}
      </Section>

      <Pressable onPress={() => navigation.navigate('LeagueAbout')} style={({ pressed }) => [styles.about, pressed && pressedFx]}>
        <View style={styles.aboutIcon}><Ionicons name="sparkles-outline" size={20} color={L.accent} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.aboutTitle}>Conoce el proyecto</Text>
          <Text style={styles.aboutText}>Formato, producción audiovisual y oportunidades para marcas.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={L.muted} />
      </Pressable>
    </LeagueScreen>
  );
}

function HeroStat({ value, label }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function Leader({ label, row, onPress }) {
  if (!row) return null;
  return (
    <Pressable onPress={() => onPress(row.player.id)} style={({ pressed }) => [styles.leader, pressed && pressedFx]}>
      <LeaguePlayerAvatar name={row.player.name} playerId={row.player.id} size={40} />
      <Text style={styles.leaderValue}>{row.value}</Text>
      <Text style={styles.leaderLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.leaderName}>{row.player.name}</Text>
      <Text numberOfLines={1} style={styles.leaderTeam}>{getTeam(row.player.teamId).short}</Text>
    </Pressable>
  );
}

function WeeklySeven({ weeklySeven }) {
  const rows = ['forward', 'midfield', 'defence', 'goalkeeper'];
  const featured = getPlayer(weeklySeven.featuredId);
  return (
    <View style={styles.weeklyCard}>
      <View style={styles.pitch}>
        {Array.from({ length: 8 }).map((_, index) => (
          <View key={index} style={[styles.stripe, { top: `${index * 12.5}%` }, index % 2 === 1 && styles.stripeAlt]} />
        ))}
        <View style={styles.halfway} />
        <View style={styles.circle} />
        <View style={styles.boxTop} />
        <View style={styles.boxBottom} />
        {rows.map((row) => (
          <View key={row} style={styles.pitchRow}>
            {weeklySeven.lineup[row].map(({ player }) => {
              const star = player.id === weeklySeven.featuredId;
              return (
                <View key={player.id} style={styles.pitchPlayer}>
                  <View>
                    <LeaguePlayerAvatar name={player.name} playerId={player.id} size={40} featured={star} />
                    {star && <View style={styles.star}><Ionicons name="star" size={8} color={L.bg} /></View>}
                  </View>
                  <Text numberOfLines={1} style={styles.pitchName}>{player.name.split(' ')[0]}</Text>
                  <Text style={styles.pitchTeam}>{getTeam(player.teamId).short}</Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.weeklyFooter}>
        <Ionicons name="star" size={13} color={L.gold} />
        <Text style={styles.weeklyFooterText}><Text style={styles.weeklyStrong}>{featured.name}</Text> · mejor jugador de la jornada</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 26, padding: 20, marginTop: 4, marginBottom: 12, overflow: 'hidden', shadowColor: '#FF5A00', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  heroTrophy: { position: 'absolute', right: -30, top: -14, transform: [{ rotate: '-12deg' }] },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.22)' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  heroBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#fff', fontSize: 34, lineHeight: 37, fontWeight: '900', letterSpacing: -1.2, marginTop: 14 },
  heroStats: { flexDirection: 'row', gap: 8, marginTop: 20, marginBottom: 14 },
  heroStat: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.2)' },
  heroStatValue: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: -0.4 },
  heroStatLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', marginTop: 1 },
  progressTrack: { flexDirection: 'row', gap: 4 },
  progressStep: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.25)' },
  progressDone: { backgroundColor: '#fff' },
  progressFinal: { flex: 1.6, backgroundColor: 'rgba(251,191,36,0.55)' },

  me: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 20, backgroundColor: L.surface, borderWidth: 1, borderColor: L.line, marginBottom: 12 },
  meName: { color: L.text, fontSize: 14, fontWeight: '800' },
  meMeta: { color: L.muted, fontSize: 12, marginTop: 1 },
  meLink: { color: L.accent, fontSize: 12, fontWeight: '800' },
  firstSection: { marginTop: 24 },
  sectionHint: { color: L.muted, fontSize: 12, marginTop: -6, marginBottom: 12 },
  fixtures: { gap: 10, paddingRight: 16 },
  fixture: { width: 176, padding: 14, paddingTop: 16, gap: 11, borderRadius: 20, overflow: 'hidden', backgroundColor: L.surface, borderWidth: 1, borderColor: L.line, borderTopColor: L.highlight },
  fixtureStripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  fixtureWhenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fixtureTime: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: L.accentSoft },
  fixtureTimeText: { color: L.accentLight, fontSize: 12, fontWeight: '800' },
  fixtureWhen: { color: L.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  fixtureTeam: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fixtureName: { flex: 1, color: L.text, fontSize: 13, fontWeight: '700' },

  flush: { paddingVertical: 4, paddingHorizontal: 14 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  pos: { width: 16, color: L.muted, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  posQualified: { color: L.accent },
  tableTeam: { flex: 1, color: L.text, fontSize: 14, fontWeight: '700' },
  tablePts: { width: 28, color: L.text, fontSize: 15, fontWeight: '800', textAlign: 'right', fontVariant: ['tabular-nums'] },
  cutLine: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,90,0,0.35)', paddingTop: 4, marginTop: 2 },
  cutText: { color: 'rgba(255,138,76,0.7)', fontSize: 8, fontWeight: '800', letterSpacing: 1 },

  leaders: { flexDirection: 'row', gap: 8 },
  leader: { flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8, borderRadius: 20, backgroundColor: L.surface, borderWidth: 1, borderColor: L.line, borderTopColor: L.highlight },
  leaderValue: { color: L.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.8, marginTop: 8 },
  leaderLabel: { color: L.accentLight, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  leaderName: { color: L.soft, fontSize: 12, fontWeight: '700', marginTop: 8 },
  leaderTeam: { color: L.subtle, fontSize: 10, fontWeight: '700', marginTop: 1 },

  weeklyCard: { padding: 10, borderRadius: 24, backgroundColor: L.surface, borderWidth: 1, borderColor: L.line },
  pitch: { height: 350, paddingVertical: 12, justifyContent: 'space-between', borderRadius: 18, overflow: 'hidden', backgroundColor: '#0F2A1D' },
  stripe: { position: 'absolute', left: 0, right: 0, height: '12.5%' },
  stripeAlt: { backgroundColor: 'rgba(255,255,255,0.03)' },
  halfway: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  circle: { position: 'absolute', top: '50%', left: '50%', width: 76, height: 76, marginLeft: -38, marginTop: -38, borderRadius: 38, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  boxTop: { position: 'absolute', top: 0, left: '28%', right: '28%', height: 40, borderWidth: 1, borderTopWidth: 0, borderColor: 'rgba(255,255,255,0.12)' },
  boxBottom: { position: 'absolute', bottom: 0, left: '28%', right: '28%', height: 40, borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.12)' },
  pitchRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 8 },
  pitchPlayer: { width: 78, alignItems: 'center' },
  star: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: L.gold },
  pitchName: { maxWidth: 76, color: L.text, fontSize: 11, fontWeight: '800', marginTop: 4 },
  pitchTeam: { color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: '800', marginTop: 1 },
  weeklyFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingTop: 10, paddingBottom: 2 },
  weeklyFooterText: { flex: 1, color: L.muted, fontSize: 12 },
  weeklyStrong: { color: L.text, fontWeight: '800' },

  listCard: { paddingVertical: 2, paddingHorizontal: 14 },

  news: { marginBottom: 10 },
  newsTop: { flexDirection: 'row', justifyContent: 'space-between' },
  newsTag: { color: L.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  newsDate: { color: L.subtle, fontSize: 11 },
  newsTitle: { color: L.text, fontSize: 16, fontWeight: '800', marginTop: 8, marginBottom: 4 },
  newsText: { color: L.muted, fontSize: 13, lineHeight: 19 },

  about: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 22, backgroundColor: L.accentSoft, borderWidth: 1, borderColor: 'rgba(255,90,0,0.25)' },
  aboutIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,90,0,0.15)' },
  aboutTitle: { color: L.text, fontSize: 15, fontWeight: '800' },
  aboutText: { color: L.soft, fontSize: 12, lineHeight: 17, marginTop: 2 },
});
