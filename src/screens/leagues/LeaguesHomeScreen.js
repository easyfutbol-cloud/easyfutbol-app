import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { LeagueHeader, leagueScreenStyles as base } from '../../components/leagues/LeagueUI';
import { leagueMatches, leagueNews, weeklySeven } from '../../data/leaguePreviewData';
import LeaguePlayerAvatar from '../../components/leagues/LeaguePlayerAvatar';

export default function LeaguesHomeScreen({ navigation }) {
  const next = leagueMatches[0];
  return <View style={base.screen}><ScrollView contentContainerStyle={[base.content, styles.homeContent]} showsVerticalScrollIndicator={false}>
    <LeagueHeader title="Tu liga, en un solo lugar" subtitle="Sigue la temporada, tu equipo y cada jornada desde EasyFutbol." />
    <LinearGradient colors={['#1a1d24', '#101217']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.heroTop}><View style={styles.calendarIcon}><Ionicons name="calendar-outline" size={18} color="#ff6a17" /></View><Text style={styles.overline}>PRÓXIMO PARTIDO · JORNADA {next.round}</Text></View>
      <View style={styles.fixture}><Text style={styles.teams}>{next.home}</Text><View style={styles.vsPill}><Text style={styles.vs}>VS</Text></View><Text style={[styles.teams, styles.away]}>{next.away}</Text></View>
      <Text style={styles.meta}>{next.date} · {next.venue}</Text>
      <Pressable style={styles.action} onPress={() => navigation.navigate('LeagueCalendar')}><Text style={styles.actionText}>Ver calendario</Text><Ionicons name="arrow-forward" size={15} color="#ff6a17" /></Pressable>
    </LinearGradient>
    <Text style={base.sectionTitle}>La competición</Text>
    <View style={styles.quickRow}>
      <Quick value="3º" label="Posición" /><Quick value="11" label="Puntos" /><Quick value="6" label="Jugados" />
    </View>
    <Text style={base.sectionTitle}>7 de la semana</Text>
    <WeeklySeven />
    <Text style={base.sectionTitle}>Noticias</Text>
    {leagueNews.map((item) => <View key={item.id} style={base.card}><View style={styles.newsTop}><Text style={styles.tag}>{item.tag}</Text><Text style={styles.date}>{item.date}</Text></View><Text style={styles.newsTitle}>{item.title}</Text><Text style={base.muted}>{item.text}</Text></View>)}
  </ScrollView></View>;
}
function Quick({ value, label }) { return <View style={styles.quick}><Text style={styles.quickValue}>{value}</Text><Text style={styles.quickLabel}>{label}</Text></View>; }
function WeeklySeven() {
  const rows = ['forward', 'midfield', 'defence', 'goalkeeper'];
  return <View style={styles.weeklyCard}>
    <View style={styles.weeklyTop}><View><Text style={styles.weeklyKicker}>JORNADA {weeklySeven.round}</Text><Text style={styles.weeklyTitle}>Equipo ideal</Text></View><View style={styles.formation}><Text style={styles.formationText}>{weeklySeven.formation}</Text></View></View>
    <View style={styles.pitch}>
      <View style={styles.halfway}/><View style={styles.circle}/><View style={styles.boxTop}/><View style={styles.boxBottom}/>
      {rows.map((row) => <View key={row} style={styles.pitchRow}>{weeklySeven.players.filter((player) => player.row === row).map((player) => <View key={player.id} style={styles.weeklyPlayer}><View><LeaguePlayerAvatar name={player.name} photoUrl={player.leaguePhotoUrl} size={42} featured={player.name === weeklySeven.featuredPlayer}/>{player.name === weeklySeven.featuredPlayer && <View style={styles.star}><Ionicons name="star" size={8} color="#141414"/></View>}</View><Text numberOfLines={1} style={styles.playerShortName}>{player.name.split(' ')[0]}</Text><Text style={styles.playerPosition}>{player.position}</Text></View>)}</View>)}
    </View>
    <View style={styles.weeklyFooter}><Ionicons name="star-outline" size={15} color="#ff6a17"/><Text style={styles.weeklyFooterText}><Text style={styles.weeklyStrong}>{weeklySeven.featuredPlayer}</Text> · jugador destacado de la jornada</Text></View>
  </View>;
}
const styles = StyleSheet.create({
  homeContent: { paddingTop: 58 },
  hero: { padding: 18, borderRadius: 22, marginBottom: 16, borderWidth: 1, borderColor: '#2b2e37', overflow: 'hidden' }, heroTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, calendarIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,90,0,.1)' }, overline: { color: '#a6a9b1', fontSize: 9, fontWeight: '900', letterSpacing: .7 }, fixture: { flexDirection: 'row', alignItems: 'center', marginTop: 20 }, teams: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '900' }, away: { textAlign: 'right' }, vsPill: { width: 34, height: 25, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#242730', marginHorizontal: 8 }, vs: { color: '#ff6a17', fontSize: 9, fontWeight: '900' }, meta: { color: '#858993', fontSize: 11, marginTop: 15 }, action: { marginTop: 17, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, paddingVertical: 5 }, actionText: { color: '#e9e9ec', fontWeight: '800', fontSize: 12 },
  quickRow: { flexDirection: 'row', gap: 8 }, quick: { flex: 1, padding: 14, borderRadius: 16, backgroundColor: '#12141a', borderWidth: 1, borderColor: '#20232b' }, quickValue: { color: '#fff', fontSize: 23, fontWeight: '900' }, quickLabel: { color: '#818188', fontSize: 11, marginTop: 3 }, newsTop: { flexDirection: 'row', justifyContent: 'space-between' }, tag: { color: '#ff6a17', fontSize: 9, fontWeight: '900', letterSpacing: .7 }, date: { color: '#696970', fontSize: 11 }, newsTitle: { color: '#fff', fontSize: 17, fontWeight: '900', marginVertical: 8 },
  weeklyCard: { padding: 14, borderRadius: 20, backgroundColor: '#12141a', borderWidth: 1, borderColor: '#23262e' }, weeklyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, weeklyKicker: { color: '#ff6a17', fontSize: 8, fontWeight: '900', letterSpacing: .8 }, weeklyTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 3 }, formation: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: '#22252d' }, formationText: { color: '#a7aab2', fontSize: 9, fontWeight: '900' }, pitch: { position: 'relative', height: 360, paddingVertical: 14, justifyContent: 'space-between', borderRadius: 16, overflow: 'hidden', backgroundColor: '#182921', borderWidth: 1, borderColor: '#294236' }, halfway: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,.14)' }, circle: { position: 'absolute', top: '50%', left: '50%', width: 74, height: 74, marginLeft: -37, marginTop: -37, borderRadius: 37, borderWidth: 1, borderColor: 'rgba(255,255,255,.14)' }, boxTop: { position: 'absolute', top: 0, left: '27%', right: '27%', height: 42, borderWidth: 1, borderTopWidth: 0, borderColor: 'rgba(255,255,255,.14)' }, boxBottom: { position: 'absolute', bottom: 0, left: '27%', right: '27%', height: 42, borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,.14)' }, pitchRow: { minHeight: 70, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 6 }, weeklyPlayer: { width: 74, alignItems: 'center' }, star: { position: 'absolute', top: -5, right: -5, width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ff7a2f' }, playerShortName: { maxWidth: 72, color: '#fff', fontSize: 10, fontWeight: '900', marginTop: 4 }, playerPosition: { color: '#a5aaa7', fontSize: 7, fontWeight: '900', marginTop: 1 }, weeklyFooter: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 12 }, weeklyFooterText: { flex: 1, color: '#797d86', fontSize: 10 }, weeklyStrong: { color: '#d9dade', fontWeight: '900' },
});
