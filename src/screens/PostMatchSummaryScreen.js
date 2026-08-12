import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import { SocialAvatar } from '../components/social/SocialComponents';
import { colors, radii, spacing } from '../theme';

const teamName = { white: 'Equipo blanco', black: 'Equipo negro' };
const resultName = { win: 'Victoria', loss: 'Derrota', draw: 'Empate' };

function PlayerRow({ player, dark }) {
  return <View style={[styles.player, dark && styles.playerDark]}>
    <SocialAvatar name={player.name} uri={player.avatar_url} size={38}/>
    <View style={styles.playerCopy}>
      <Text style={[styles.playerName, !dark && styles.playerNameLight]} numberOfLines={1}>{player.name}</Text>
      <Text style={[styles.playerStats, !dark && styles.playerStatsLight]}>{player.goals} G · {player.assists} A</Text>
    </View>
    {player.is_mvp ? <View style={styles.mvpPill}><Ionicons name="star" size={11} color="#050505"/><Text style={styles.mvpPillText}>MVP</Text></View> : null}
  </View>;
}

function TeamCard({ type, players }) {
  const dark = type === 'black';
  return <View style={[styles.teamCard, dark ? styles.blackTeam : styles.whiteTeam]}>
    <View style={styles.teamHeader}>
      <View style={[styles.shirt, dark ? styles.blackShirt : styles.whiteShirt]}><Ionicons name="shirt" size={17} color={dark ? '#fff' : '#111'}/></View>
      <Text style={[styles.teamTitle, !dark && styles.teamTitleLight]}>{teamName[type]}</Text>
      <Text style={[styles.teamCount, !dark && styles.teamCountLight]}>{players.length}</Text>
    </View>
    {players.length ? players.map(player => <PlayerRow key={player.user_id} player={player} dark={dark}/>) : <Text style={[styles.empty, !dark && styles.playerStatsLight]}>Acta todavía sin jugadores.</Text>}
  </View>;
}

export default function PostMatchSummaryScreen({ route, navigation }) {
  const matchId = route.params?.matchId;
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);

  const load=useCallback(async(silent=false)=>{try{if(!silent)setLoading(true);const response=await api.get(`/matches/${matchId}/post-match`);setData(response.data?.data||null);}catch(error){Alert.alert('Resumen no disponible',error?.response?.data?.msg||'Todavía no se ha publicado el acta del partido.');}finally{setLoading(false);setRefreshing(false);}},[matchId]);
  useEffect(()=>{load();},[load]);

  const share=async()=>{if(!data)return;const {match,score,personal,mvp}=data;const own=personal?`${resultName[personal.result]||'Partido completado'} · ${personal.goals} goles · ${personal.assists} asistencias${personal.is_mvp?' · MVP':''}`:null;await Share.share({title:'Resumen EasyFutbol',message:[`⚽ ${match.title}`,`⚪ ${score.white} - ${score.black} ⚫`,mvp?`⭐ MVP: ${mvp.name}`:null,own,'Juega con EasyFutbol'].filter(Boolean).join('\n')});};

  if(loading)return <View style={styles.loading}><ActivityIndicator size="large" color={colors.orange}/><Text style={styles.loadingText}>Preparando el acta…</Text></View>;
  if(!data)return <View style={styles.loading}><Text style={styles.loadingText}>El acta aún no está disponible.</Text><TouchableOpacity style={styles.retry} onPress={()=>load()}><Text style={styles.retryText}>Reintentar</Text></TouchableOpacity></View>;
  const {match,score,mvp,personal,teams}=data;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load(true);}} tintColor={colors.orange}/>}>
    <ScreenHeader eyebrow="ACTA DEL PARTIDO" title="Resumen final" description={`${match.field_name||match.city||'EasyFutbol'} · ${new Date(match.starts_at).toLocaleDateString('es-ES',{day:'numeric',month:'long'})}`} action={<TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver" style={styles.back} onPress={()=>navigation.goBack()}><Ionicons name="chevron-back" size={22} color="#fff"/></TouchableOpacity>}/>
    <LinearGradient colors={['#22170f','#111318']} style={styles.scoreCard}>
      <Text style={styles.matchTitle}>{match.title}</Text>
      <View style={styles.scoreRow}><View style={styles.scoreTeam}><View style={[styles.bigShirt,styles.whiteShirt]}><Ionicons name="shirt" size={25} color="#111"/></View><Text style={styles.scoreLabel}>BLANCOS</Text></View><Text style={styles.score}>{score.white}<Text style={styles.dash}> — </Text>{score.black}</Text><View style={styles.scoreTeam}><View style={[styles.bigShirt,styles.blackShirt]}><Ionicons name="shirt" size={25} color="#fff"/></View><Text style={styles.scoreLabel}>NEGROS</Text></View></View>
      {mvp?<View style={styles.mvpHero}><SocialAvatar name={mvp.name} uri={mvp.avatar_url} size={46}/><View style={{flex:1}}><Text style={styles.eyebrow}>MVP DEL PARTIDO</Text><Text style={styles.mvpName}>{mvp.name}</Text><Text style={styles.mvpStats}>{mvp.goals} goles · {mvp.assists} asistencias</Text></View><Ionicons name="star" size={26} color={colors.orange}/></View>:<Text style={styles.pending}>MVP pendiente de publicar</Text>}
    </LinearGradient>
    {personal?<View style={styles.personalCard}><Text style={styles.eyebrow}>TU ACTUACIÓN</Text><Text style={styles.personalResult}>{resultName[personal.result]||'Partido completado'}</Text><View style={styles.personalStats}><View><Text style={styles.personalValue}>{personal.goals}</Text><Text style={styles.personalLabel}>GOLES</Text></View><View><Text style={styles.personalValue}>{personal.assists}</Text><Text style={styles.personalLabel}>ASISTENCIAS</Text></View><View><Text style={styles.personalValue}>{personal.is_mvp?'Sí':'—'}</Text><Text style={styles.personalLabel}>MVP</Text></View></View></View>:null}
    <Text style={styles.sectionTitle}>Alineaciones y estadísticas</Text>
    <TeamCard type="white" players={teams.white}/><TeamCard type="black" players={teams.black}/>
    {teams.pending?.length?<View><Text style={styles.pendingTitle}>Sin color registrado</Text>{teams.pending.map(player=><PlayerRow key={player.user_id} player={player} dark/>)}</View>:null}
    <TouchableOpacity style={styles.share} onPress={share}><Ionicons name="share-social" size={19} color="#090909"/><Text style={styles.shareText}>Compartir resumen</Text></TouchableOpacity>
  </ScrollView>;
}

const styles=StyleSheet.create({screen:{flex:1,backgroundColor:colors.background},content:{padding:spacing(2),paddingBottom:120},back:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'#191c22',borderWidth:1,borderColor:'#30343c'},loading:{flex:1,backgroundColor:colors.background,alignItems:'center',justifyContent:'center',gap:12,padding:24},loadingText:{color:colors.textMuted,fontWeight:'700'},retry:{backgroundColor:colors.orange,paddingHorizontal:20,paddingVertical:11,borderRadius:12},retryText:{color:'#080808',fontWeight:'900'},scoreCard:{borderRadius:26,padding:20,borderWidth:1,borderColor:'rgba(255,106,23,.3)',marginBottom:14},matchTitle:{color:'#fff',fontSize:15,fontWeight:'800',textAlign:'center'},scoreRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginVertical:24},scoreTeam:{alignItems:'center',gap:7},bigShirt:{width:48,height:48,borderRadius:16,alignItems:'center',justifyContent:'center'},whiteShirt:{backgroundColor:'#f5f5f3',borderWidth:1,borderColor:'#d6d6d2'},blackShirt:{backgroundColor:'#08090b',borderWidth:1,borderColor:'#393b42'},scoreLabel:{color:'#989ba3',fontSize:9,fontWeight:'900',letterSpacing:.8},score:{color:'#fff',fontSize:38,fontWeight:'900'},dash:{color:'#5c5f66',fontWeight:'500'},mvpHero:{flexDirection:'row',alignItems:'center',gap:12,paddingTop:16,borderTopWidth:1,borderTopColor:'#34302d'},eyebrow:{color:colors.orange,fontSize:9,fontWeight:'900',letterSpacing:1},mvpName:{color:'#fff',fontSize:17,fontWeight:'900',marginTop:2},mvpStats:{color:'#96989e',fontSize:11,marginTop:2},pending:{color:'#777',textAlign:'center',fontSize:12},personalCard:{backgroundColor:'#15171c',borderRadius:20,padding:18,borderWidth:1,borderColor:'#252830',marginBottom:22},personalResult:{color:'#fff',fontSize:22,fontWeight:'900',marginTop:5},personalStats:{flexDirection:'row',justifyContent:'space-between',marginTop:18},personalValue:{color:'#fff',fontSize:24,fontWeight:'900'},personalLabel:{color:'#70737a',fontSize:8,fontWeight:'900',marginTop:2},sectionTitle:{color:'#fff',fontSize:20,fontWeight:'900',marginBottom:12},teamCard:{borderRadius:20,padding:14,marginBottom:12,borderWidth:1},whiteTeam:{backgroundColor:'#eeefec',borderColor:'#fff'},blackTeam:{backgroundColor:'#111318',borderColor:'#292c34'},teamHeader:{flexDirection:'row',alignItems:'center',gap:9,marginBottom:8},shirt:{width:32,height:32,borderRadius:10,alignItems:'center',justifyContent:'center'},teamTitle:{flex:1,color:'#fff',fontSize:14,fontWeight:'900'},teamTitleLight:{color:'#111'},teamCount:{color:'#90939a',fontWeight:'900'},teamCountLight:{color:'#555'},player:{flexDirection:'row',alignItems:'center',gap:10,minHeight:55,borderTopWidth:1,borderTopColor:'#282b32'},playerDark:{borderTopColor:'#282b32'},playerCopy:{flex:1},playerName:{color:'#fff',fontSize:13,fontWeight:'800'},playerNameLight:{color:'#151515'},playerStats:{color:'#85888f',fontSize:10,marginTop:2},playerStatsLight:{color:'#666'},mvpPill:{flexDirection:'row',alignItems:'center',gap:3,backgroundColor:colors.orange,paddingHorizontal:8,paddingVertical:5,borderRadius:10},mvpPillText:{color:'#050505',fontSize:8,fontWeight:'900'},empty:{color:'#777',fontSize:11,paddingVertical:12},pendingTitle:{color:'#8b8e95',fontSize:11,fontWeight:'900',margin:10},share:{height:54,borderRadius:radii.medium,backgroundColor:colors.orange,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,marginTop:12},shareText:{color:'#090909',fontWeight:'900',fontSize:14}});
