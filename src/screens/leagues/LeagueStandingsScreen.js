import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LeagueHeader, leagueScreenStyles as base } from '../../components/leagues/LeagueUI';
import { standings } from '../../data/leaguePreviewData';
export default function LeagueStandingsScreen() { return <View style={base.screen}><ScrollView contentContainerStyle={base.content}>
  <LeagueHeader title="Clasificación" subtitle="La tabla se actualizará después de cada jornada." />
  <View style={styles.table}><Row header data={['#','Equipo','PJ','G','E','P','PTS']} />{standings.map((t,i)=><Row key={t[0]} data={[i+1,...t]} highlight={i===2} />)}</View>
  <Text style={styles.note}>Los datos mostrados pertenecen a la vista previa de la temporada piloto.</Text>
  </ScrollView></View>; }
function Row({ data, header, highlight }) { return <View style={[styles.row, header && styles.header, highlight && styles.highlight]}>{data.map((v,i)=><Text key={i} numberOfLines={1} style={[styles.cell, i===1 && styles.team, header && styles.headerText]}>{v}</Text>)}</View>; }
const styles = StyleSheet.create({ table: { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#29292e', backgroundColor: '#141417' }, row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#242429', paddingHorizontal: 8 }, header: { minHeight: 38, backgroundColor: '#1d1d21' }, highlight: { backgroundColor: 'rgba(255,90,0,.09)', borderLeftWidth: 3, borderLeftColor: '#ff5a00' }, cell: { width: 28, color: '#bdbdc3', textAlign: 'center', fontSize: 11, fontWeight: '700' }, team: { flex: 1, width: 'auto', textAlign: 'left', color: '#fff', fontSize: 12 }, headerText: { color: '#717178', fontSize: 9, fontWeight: '900' }, note: { color: '#64646b', fontSize: 11, lineHeight: 16, marginTop: 12 } });
