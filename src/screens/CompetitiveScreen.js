import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../api/client';
import { colors, layout, radii, spacing, typography } from '../theme';
import ScreenHeader from '../components/ScreenHeader';

export default function CompetitiveScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [meResult, divisionResult, leaderboardResult, performanceResult] = await Promise.all([
        api.get('/competitive/me'),
        api.get('/competitive/divisions'),
        api.get('/competitive/leaderboard'),
        api.get('/competitive/me/performance'),
      ]);
      setData(meResult.data?.data || null);
      setDivisions(divisionResult.data?.data || []);
      setLeaderboard(leaderboardResult.data?.data || []);
      setPerformance(performanceResult.data?.data || null);
    } catch (requestError) {
      setError(requestError?.response?.data?.msg || 'No se pudo cargar el modo competitivo.');
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.orange} /></View>;

  const access = data?.access;
  const player = data?.player;
  const season = access?.season;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader eyebrow="MODO COMPETITIVO" title="Tu camino empieza aquí" description="Cuatro semanas. Tu mejor partido de cada semana. Una división por conquistar." />

      <LinearGradient colors={access?.has_access ? ['#251B05','#0D1117'] : ['#191919','#0B0B0D']} style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name={access?.has_access ? 'trophy' : 'lock-closed'} size={30} color={access?.has_access ? '#FFD45A' : colors.textSubtle} /></View>
        <Text style={styles.heroEyebrow}>{access?.has_access ? 'ACCESO COMPETITIVO ACTIVO' : 'ACCESO EXCLUSIVO'}</Text>
        <Text style={styles.heroTitle}>{season?.name || 'Próxima temporada'}</Text>
        <Text style={styles.heroText}>
          {access?.has_access
            ? `Acceso mediante ${access.source === 'pro' ? 'EasyFutbol Pro' : 'tu temporada de prueba Plus'}.`
            : season ? 'Necesitas EasyFutbol Pro o una prueba competitiva Plus activa.' : 'Estamos preparando la primera temporada competitiva.'}
        </Text>
        {!access?.has_access ? (
          <TouchableOpacity style={styles.cta} onPress={() => navigation.navigate('Plus')}><Text style={styles.ctaText}>Ver Plus y Pro</Text></TouchableOpacity>
        ) : null}
      </LinearGradient>

      {player ? (
        <View style={[styles.playerCard, { borderColor:player.color_hex || colors.border }]}>
          <Text style={styles.cardEyebrow}>TU DIVISIÓN INICIAL</Text>
          <Text style={[styles.divisionName, { color:player.color_hex || '#CD7F32' }]}>{player.division_name}</Text>
          <Text style={styles.cardText}>Estado provisional. La clasificación comenzará cuando se active el sistema de puntuación.</Text>
        </View>
      ) : null}

      {access?.has_access ? (
        <>
          <Text style={styles.sectionTitle}>Mi rendimiento</Text>
          <View style={styles.performanceHero}>
            <View><Text style={styles.cardEyebrow}>POSICIÓN ACTUAL</Text><Text style={styles.position}>{performance?.standing?.position ? `#${performance.standing.position}` : '—'}</Text></View>
            <View style={styles.performanceMetric}><Ionicons name={(performance?.standing?.position_change || 0) > 0 ? 'arrow-up' : (performance?.standing?.position_change || 0) < 0 ? 'arrow-down' : 'remove'} size={18} color={(performance?.standing?.position_change || 0) > 0 ? '#55D68B' : (performance?.standing?.position_change || 0) < 0 ? colors.danger : colors.textSubtle} /><Text style={styles.metricValue}>{Math.abs(performance?.standing?.position_change || 0)}</Text><Text style={styles.metricLabel}>puestos</Text></View>
            <View style={styles.performanceMetric}><Text style={styles.metricValue}>{Number(performance?.standing?.total_score || 0).toFixed(1)}</Text><Text style={styles.metricLabel}>puntos</Text></View>
          </View>
          <View style={styles.weekGrid}>
            {(performance?.weeks || []).map((week) => (
              <View key={week.week_number} style={[styles.weekCard, week.weekly_score != null && styles.weekCardScored]}>
                <Text style={styles.weekLabel}>SEMANA {week.week_number}</Text>
                <Text style={styles.weekScore}>{week.weekly_score == null ? '—' : Number(week.weekly_score).toFixed(1)}</Text>
                <Text numberOfLines={1} style={styles.weekField}>{week.field_name || (week.status === 'scored' ? 'Sin partido puntuable' : 'Pendiente')}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Clasificación de mi división</Text>
          <View style={styles.leaderboard}>
            {leaderboard.length ? leaderboard.map((entry) => {
              const own = Number(entry.user_id) === Number(player?.user_id);
              return <View key={entry.user_id} style={[styles.rankingRow, own && styles.ownRanking]}><Text style={[styles.rank, entry.position <= 3 && styles.topRank]}>#{entry.position}</Text><View style={{ flex:1 }}><Text style={[styles.rankingName, own && { color:'#FFD45A' }]}>{entry.name}{own ? ' · Tú' : ''}</Text><Text style={styles.rankingDivision}>{entry.division_name} · {entry.scored_weeks}/4 semanas</Text></View><View style={styles.change}><Ionicons name={entry.position_change > 0 ? 'caret-up' : entry.position_change < 0 ? 'caret-down' : 'remove'} size={14} color={entry.position_change > 0 ? '#55D68B' : entry.position_change < 0 ? colors.danger : colors.textSubtle} /><Text style={styles.changeText}>{Math.abs(entry.position_change || 0)}</Text></View><Text style={styles.points}>{Number(entry.total_score).toFixed(1)}</Text></View>;
            }) : <Text style={styles.emptyRanking}>La clasificación aparecerá tras el primer cierre semanal.</Text>}
          </View>
        </>
      ) : null}

      <TouchableOpacity style={styles.historyButton} onPress={() => navigation.navigate('CompetitiveHistory')}><View style={styles.historyIcon}><Ionicons name="ribbon-outline" size={22} color="#FFD45A" /></View><View style={{ flex:1 }}><Text style={styles.historyTitle}>Mi historial competitivo</Text><Text style={styles.historyText}>Temporadas, insignias y recompensas</Text></View><Ionicons name="chevron-forward" size={19} color={colors.textSubtle} /></TouchableOpacity>

      <Text style={styles.sectionTitle}>Divisiones</Text>
      <View style={styles.divisionList}>
        {divisions.map((division) => (
          <View key={division.code} style={styles.divisionCard}>
            <View style={[styles.divisionShield, { backgroundColor:`${division.color_hex}22`, borderColor:division.color_hex }]}>
              <Ionicons name={division.icon || 'shield-outline'} size={22} color={division.color_hex} />
            </View>
            <View style={{ flex:1 }}><Text style={[styles.divisionTitle, { color:division.color_hex }]}>{division.name}</Text><Text style={styles.divisionMeta}>{division.group_capacity} jugadores · {division.promotion_slots ? `${division.promotion_slots} ascienden` : 'División máxima'}</Text></View>
          </View>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:{ flex:1, backgroundColor:colors.background },
  content:{ width:'100%', maxWidth:layout.maxContentWidth, alignSelf:'center', padding:layout.screenPadding, paddingBottom:spacing(6) },
  center:{ flex:1, backgroundColor:colors.background, alignItems:'center', justifyContent:'center' },
  hero:{ borderRadius:radii.large, borderWidth:1, borderColor:'rgba(255,212,90,0.30)', padding:spacing(2), marginBottom:spacing(2) },
  heroIcon:{ width:58, height:58, borderRadius:19, backgroundColor:'rgba(255,212,90,0.10)', alignItems:'center', justifyContent:'center' },
  heroEyebrow:{ color:'#FFD45A', ...typography.overline, marginTop:spacing(1.5) },
  heroTitle:{ color:colors.white, ...typography.title, marginTop:spacing(0.5) },
  heroText:{ color:colors.textMuted, ...typography.body, marginTop:spacing(0.75) },
  cta:{ minHeight:50, backgroundColor:'#FFD45A', borderRadius:radii.medium, alignItems:'center', justifyContent:'center', marginTop:spacing(1.5) },
  ctaText:{ color:'#151109', ...typography.bodyStrong, fontWeight:'900' },
  playerCard:{ backgroundColor:colors.surface, borderRadius:radii.large, borderWidth:1, padding:spacing(2), marginBottom:spacing(2) },
  cardEyebrow:{ color:colors.textSubtle, ...typography.overline },
  divisionName:{ ...typography.display, marginTop:spacing(0.5) },
  cardText:{ color:colors.textMuted, ...typography.body, marginTop:spacing(0.5) },
  sectionTitle:{ color:colors.white, ...typography.heading, marginBottom:spacing(1.25) },
  performanceHero:{ flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#171A1F',borderRadius:radii.large,borderWidth:1,borderColor:'rgba(255,212,90,.28)',padding:spacing(1.5),marginBottom:spacing(1) },
  position:{ color:'#FFD45A',fontSize:38,fontWeight:'900',marginTop:3 },performanceMetric:{ alignItems:'center' },metricValue:{ color:colors.white,fontSize:20,fontWeight:'900' },metricLabel:{ color:colors.textSubtle,...typography.caption },
  weekGrid:{ flexDirection:'row',flexWrap:'wrap',gap:spacing(1),marginBottom:spacing(2) },weekCard:{ width:'48%',flexGrow:1,backgroundColor:colors.surface,borderRadius:radii.medium,borderWidth:1,borderColor:colors.border,padding:spacing(1.25) },weekCardScored:{ borderColor:'rgba(98,182,255,.35)' },weekLabel:{ color:colors.textSubtle,...typography.overline },weekScore:{ color:colors.white,fontSize:28,fontWeight:'900',marginTop:5 },weekField:{ color:colors.textMuted,...typography.caption,marginTop:4 },
  leaderboard:{ backgroundColor:colors.surface,borderRadius:radii.large,borderWidth:1,borderColor:colors.border,overflow:'hidden',marginBottom:spacing(2) },rankingRow:{ flexDirection:'row',alignItems:'center',gap:10,padding:spacing(1.25),borderBottomWidth:1,borderBottomColor:colors.border },ownRanking:{ backgroundColor:'rgba(255,212,90,.07)' },rank:{ width:33,color:colors.textMuted,fontWeight:'900' },topRank:{ color:'#FFD45A' },rankingName:{ color:colors.white,...typography.bodyStrong },rankingDivision:{ color:colors.textSubtle,...typography.caption,marginTop:2 },change:{ flexDirection:'row',alignItems:'center',minWidth:30 },changeText:{ color:colors.textMuted,fontSize:11 },points:{ minWidth:38,textAlign:'right',color:colors.white,fontWeight:'900' },emptyRanking:{ color:colors.textMuted,...typography.body,textAlign:'center',padding:spacing(2) },
  historyButton:{ flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#191A1F',borderRadius:radii.large,borderWidth:1,borderColor:'rgba(255,212,90,.25)',padding:spacing(1.25),marginBottom:spacing(2) },historyIcon:{ width:44,height:44,borderRadius:14,backgroundColor:'rgba(255,212,90,.10)',alignItems:'center',justifyContent:'center' },historyTitle:{ color:colors.white,...typography.bodyStrong },historyText:{ color:colors.textMuted,...typography.caption,marginTop:3 },
  divisionList:{ gap:spacing(1) },
  divisionCard:{ flexDirection:'row', alignItems:'center', gap:spacing(1.25), backgroundColor:colors.surface, borderRadius:radii.medium, borderWidth:1, borderColor:colors.border, padding:spacing(1.25) },
  divisionShield:{ width:48, height:48, borderRadius:15, borderWidth:1, alignItems:'center', justifyContent:'center' },
  divisionTitle:{ ...typography.bodyStrong, fontWeight:'900' },
  divisionMeta:{ color:colors.textSubtle, ...typography.caption, marginTop:3 },
  error:{ color:colors.danger, ...typography.caption, textAlign:'center', marginTop:spacing(2) },
});
