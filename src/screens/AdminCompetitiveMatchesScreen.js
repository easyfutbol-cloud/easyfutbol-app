import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { colors, layout, radii, spacing, typography } from '../theme';
import ScreenHeader from '../components/ScreenHeader';

const STATUS = {
  pending:{ label:'Pendiente', color:'#FFB14A', icon:'time-outline' },
  partial:{ label:'Parcial', color:'#62B6FF', icon:'sync-outline' },
  completed:{ label:'Completado', color:'#55D68B', icon:'checkmark-circle-outline' },
};

const formatDate = (value) => new Date(value).toLocaleString('es-ES', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });

export default function AdminCompetitiveMatchesScreen({ navigation }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [scoring, setScoring] = useState(false);
  const [season, setSeason] = useState(null);

  const load = useCallback(async (refresh = false) => {
    try {
      refresh ? setRefreshing(true) : setLoading(true);
      setError('');
      const [response,seasonResponse] = await Promise.all([api.get('/admin/competitive/matches'),api.get('/admin/competitive/seasons')]);
      setMatches(response.data?.data || []); setSeason((seasonResponse.data?.data || []).find((item) => ['active','scoring'].includes(item.status)) || null);
    } catch (requestError) { setError(requestError?.response?.data?.msg || 'No se pudieron cargar los partidos.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const scoreDueWeeks = async () => {
    try {
      setScoring(true);
      const response = await api.post('/admin/competitive/weeks/score-due');
      const results = response.data?.data || [];
      const blocked = results.filter((item) => item.error);
      await load(true);
      Alert.alert(
        blocked.length ? 'Cierre parcialmente pendiente' : 'Semanas actualizadas',
        blocked.length ? blocked.map((item) => item.error).join('\n') : results.length ? 'La clasificación se ha recalculado correctamente.' : 'No hay semanas pendientes de cierre.'
      );
    } catch (requestError) { Alert.alert('No se pudo actualizar', requestError?.response?.data?.msg || 'Inténtalo de nuevo.'); }
    finally { setScoring(false); }
  };
  const completeSeason = () => Alert.alert('Cerrar temporada', 'Se calcularán ascensos, descensos, insignias y recompensas. Esta acción solo estará disponible cuando las cuatro semanas estén puntuadas.', [{ text:'Cancelar',style:'cancel' },{ text:'Cerrar temporada',onPress:async()=>{ try { setScoring(true); const response=await api.post(`/admin/competitive/seasons/${season.id}/complete`); const result=response.data?.data; Alert.alert('Temporada completada',`${result.processed} jugadores · ${result.promoted} ascensos · ${result.relegated} descensos`); await load(true); } catch(e) { Alert.alert('No se puede cerrar',e?.response?.data?.msg || 'Revisa el estado de las semanas.'); } finally { setScoring(false); } } }]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.orange} /></View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.orange} />}>
      <ScreenHeader eyebrow="ADMIN · COMPETITIVO" title="Partidos por valorar" description="El partido no puntuará hasta que todos sus jugadores competitivos estén resueltos." />
      <View style={styles.summary}>
        <Ionicons name="clipboard-outline" size={24} color={colors.orange} />
        <View><Text style={styles.summaryValue}>{matches.filter((item) => item.status !== 'completed').length}</Text><Text style={styles.summaryLabel}>partidos abiertos</Text></View>
      </View>
      <TouchableOpacity style={styles.scoreWeeksButton} disabled={scoring} onPress={scoreDueWeeks}><Ionicons name="refresh" size={18} color="#171109" /><Text style={styles.scoreWeeksText}>{scoring ? 'Actualizando clasificación…' : 'Cerrar semanas disponibles'}</Text></TouchableOpacity>
      {season ? <TouchableOpacity style={styles.completeButton} disabled={scoring} onPress={completeSeason}><Ionicons name="trophy-outline" size={18} color="#FFD45A" /><Text style={styles.completeText}>Finalizar temporada</Text></TouchableOpacity> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {matches.length ? matches.map((match) => {
        const status = STATUS[match.status] || STATUS.pending;
        const progress = Number(match.eligible_players) ? Number(match.resolved_players) / Number(match.eligible_players) : 0;
        return (
          <TouchableOpacity key={match.id} style={styles.card} activeOpacity={0.85} onPress={() => navigation.navigate('AdminCompetitiveEvaluation', { matchId:match.match_id })}>
            <View style={styles.cardTop}><Text style={styles.week}>SEMANA {match.week_number} · {match.season_name}</Text><View style={[styles.status,{ borderColor:status.color }]}><Ionicons name={status.icon} size={13} color={status.color} /><Text style={[styles.statusText,{ color:status.color }]}>{status.label}</Text></View></View>
            <Text style={styles.field}>{match.field_name || 'Campo por confirmar'}</Text>
            <Text style={styles.date}>{formatDate(match.starts_at)}</Text>
            <View style={styles.progressRow}><Text style={styles.progressText}>{match.resolved_players} de {match.eligible_players} jugadores</Text><Text style={styles.progressText}>{Math.round(progress * 100)}%</Text></View>
            <View style={styles.track}><View style={[styles.fill,{ width:`${progress * 100}%`, backgroundColor:status.color }]} /></View>
            <View style={styles.openRow}><Text style={styles.openText}>{match.status === 'completed' ? 'Revisar valoraciones' : 'Continuar valoración'}</Text><Ionicons name="arrow-forward" size={18} color={colors.orange} /></View>
          </TouchableOpacity>
        );
      }) : <View style={styles.empty}><Ionicons name="checkmark-done-circle-outline" size={42} color="#55D68B" /><Text style={styles.emptyTitle}>Todo al día</Text><Text style={styles.emptyText}>No hay partidos competitivos pendientes de valorar.</Text></View>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:{ flex:1, backgroundColor:colors.background }, content:{ width:'100%', maxWidth:layout.maxContentWidth, alignSelf:'center', padding:layout.screenPadding, paddingBottom:spacing(6) },
  center:{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:colors.background }, summary:{ flexDirection:'row', gap:spacing(1.25), alignItems:'center', padding:spacing(1.5), borderRadius:radii.medium, backgroundColor:colors.surface, borderWidth:1, borderColor:colors.border, marginBottom:spacing(1.5) },
  summaryValue:{ color:colors.white, ...typography.heading }, summaryLabel:{ color:colors.textMuted, ...typography.caption }, card:{ backgroundColor:colors.surface, borderRadius:radii.large, borderWidth:1, borderColor:colors.border, padding:spacing(1.5), marginBottom:spacing(1.25) },
  cardTop:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:8 }, week:{ flex:1, color:colors.textSubtle, ...typography.overline }, status:{ flexDirection:'row', gap:4, alignItems:'center', borderWidth:1, borderRadius:99, paddingHorizontal:9, paddingVertical:5 }, statusText:{ fontSize:11, fontWeight:'800' },
  field:{ color:colors.white, ...typography.heading, marginTop:spacing(1) }, date:{ color:colors.textMuted, ...typography.body, marginTop:4 }, progressRow:{ flexDirection:'row', justifyContent:'space-between', marginTop:spacing(1.5) }, progressText:{ color:colors.textSubtle, ...typography.caption }, track:{ height:7, borderRadius:99, backgroundColor:'#2A2D31', overflow:'hidden', marginTop:7 }, fill:{ height:'100%', borderRadius:99 },
  openRow:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', borderTopWidth:1, borderTopColor:colors.border, marginTop:spacing(1.5), paddingTop:spacing(1.25) }, openText:{ color:colors.orange, ...typography.bodyStrong }, error:{ color:colors.danger, textAlign:'center', marginBottom:spacing(1) }, empty:{ alignItems:'center', backgroundColor:colors.surface, borderRadius:radii.large, borderWidth:1, borderColor:colors.border, padding:spacing(3) }, emptyTitle:{ color:colors.white, ...typography.heading, marginTop:spacing(1) }, emptyText:{ color:colors.textMuted, ...typography.body, textAlign:'center', marginTop:4 },
  scoreWeeksButton:{ minHeight:48,backgroundColor:'#FFD45A',borderRadius:radii.medium,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center',marginBottom:spacing(1.5) },scoreWeeksText:{ color:'#171109',...typography.bodyStrong,fontWeight:'900' },
  completeButton:{ minHeight:48,borderRadius:radii.medium,borderWidth:1,borderColor:'rgba(255,212,90,.35)',flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center',marginBottom:spacing(1.5) },completeText:{ color:'#FFD45A',...typography.bodyStrong,fontWeight:'900' },
});
