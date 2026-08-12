import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import { EmptyState, FriendCard, SocialAvatar } from '../components/social/SocialComponents';

const TABS = [
  ['search', 'Buscar'],
  ['friends', 'Amigos'],
  ['matches', 'Partidos'],
  ['invitations', 'Invitaciones'],
  ['stats', 'Estadísticas'],
  ['requests', 'Solicitudes'],
];

const matchDate = (value) => new Date(value).toLocaleString('es-ES', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

export default function SocialScreen({ navigation, route }) {
  const [tab, setTab] = useState(route.params?.tab || 'friends');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [inviteCount, setInviteCount] = useState(0);

  const loadSummary = useCallback(async () => {
    try {
      const response = await api.get('/social/summary');
      setInviteCount(Number(response.data?.match_invitations || 0));
    } catch (_) {
      setInviteCount(0);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      let url = '/social/friends';
      if (tab === 'matches') url = '/social/friends/matches';
      if (tab === 'invitations') url = '/social/match-invitations';
      if (tab === 'stats') url = '/social/friends/stats';
      if (tab === 'requests') url = '/social/requests/received';
      if (tab === 'search') {
        url = query.trim().length < 2
          ? '/social/frequent-players?limit=12'
          : `/social/users/search?q=${encodeURIComponent(query.trim())}`;
      }
      const response = await api.get(url);
      setData(response.data?.items || []);
      if (tab === 'invitations') await loadSummary();
    } catch (error) {
      Alert.alert('Amigos', error.response?.data?.msg || 'No se pudo cargar esta sección');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab, query, loadSummary]);

  useFocusEffect(useCallback(() => { load(); loadSummary(); }, [load, loadSummary]));
  useEffect(() => {
    if (tab !== 'search') return undefined;
    const timer = setTimeout(load, 350);
    return () => clearTimeout(timer);
  }, [query, tab, load]);

  const act = async (path, method = 'patch', body) => {
    try { await api[method](path, body); await load(); }
    catch (error) { Alert.alert('Amigos', error.response?.data?.msg || 'No se pudo completar'); }
  };

  const renderItem = (item) => {
    if (tab === 'invitations') {
      const active = ['pending', 'viewed'].includes(item.status);
      const remaining = Math.max(Number(item.capacity || 0) - Number(item.spots_taken || 0), 0);
      const openInvitation = async () => {
        if (item.status === 'pending') {
          try { await api.patch(`/social/match-invitations/${item.id}/view`); }
          catch (_) {}
        }
        navigation.navigate('Match', { id:item.match_id, matchId:item.match_id, invitationId:item.id });
      };
      return <View key={item.id} style={[styles.invitationCard, !active && styles.invitationInactive]}>
        <View style={styles.invitationTop}>
          <SocialAvatar uri={item.sender_avatar} name={item.sender_name} size={46}/>
          <View style={{flex:1}}><Text style={styles.invitationEyebrow}>{active ? 'TE INVITA A JUGAR' : 'INVITACIÓN CERRADA'}</Text><Text style={styles.friendName}>{item.sender_name}</Text></View>
          {item.status === 'pending' ? <View style={styles.newPill}><Text style={styles.newPillText}>NUEVA</Text></View> : null}
        </View>
        <View style={styles.invitationMatch}>
          <Text style={styles.invitationTitle}>{item.title}</Text>
          <Text style={styles.matchDate}>{matchDate(item.starts_at)}</Text>
          <View style={styles.invitationCapacity}><Ionicons name="people-outline" color={remaining ? '#70c98a' : '#d46d6d'} size={15}/><Text style={[styles.capacityText,!remaining&&{color:'#d46d6d'}]}>{remaining ? `${remaining} plazas libres` : 'Partido completo'}</Text></View>
        </View>
        {active ? <View style={styles.invitationActions}>
          <TouchableOpacity disabled={!remaining} style={[styles.openInvite,!remaining&&{opacity:.4}]} onPress={openInvitation}><Text style={styles.openInviteText}>Ver partido</Text><Ionicons name="arrow-forward" color="#080808" size={17}/></TouchableOpacity>
          <TouchableOpacity style={styles.declineInvite} onPress={() => Alert.alert('Rechazar invitación','Esta invitación dejará de aparecer como pendiente.',[{text:'Cancelar',style:'cancel'},{text:'Rechazar',style:'destructive',onPress:()=>act(`/social/match-invitations/${item.id}/decline`)}])}><Text style={styles.declineInviteText}>Rechazar</Text></TouchableOpacity>
        </View> : <Text style={styles.closedStatus}>{item.status === 'declined' ? 'Rechazada' : item.status === 'expired' ? 'Caducada' : 'Vista'}</Text>}
      </View>;
    }
    if (tab === 'matches') {
      return (
        <TouchableOpacity key={`${item.match_id}-${item.friend_id}`} style={styles.matchCard} onPress={() => navigation.navigate('Match', { id:item.match_id, matchId:item.match_id })}>
          <SocialAvatar uri={item.friend_avatar} name={item.friend_name} size={46} />
          <View style={styles.matchCopy}>
            <Text style={styles.friendName}>{item.friend_name}</Text>
            <Text style={styles.matchTitle}>{item.title}</Text>
            <Text style={styles.matchDate}>{matchDate(item.starts_at)}</Text>
          </View>
          <Ionicons name="chevron-forward" color="#777" size={20} />
        </TouchableOpacity>
      );
    }
    if (tab === 'stats') {
      return (
        <TouchableOpacity key={item.id} style={styles.statsCard} onPress={() => navigation.navigate('PlayerSocialProfile', { userId:item.id })}>
          <View style={styles.statsIdentity}><SocialAvatar uri={item.avatar_url} name={item.name} size={48} /><Text style={styles.friendName} numberOfLines={1}>{item.name}</Text></View>
          <View style={styles.metrics}>
            <Metric icon="football-outline" label="Goles" value={item.goals} />
            <Metric icon="git-merge-outline" label="Asist." value={item.assists} />
            <Metric icon="trophy-outline" label="Ganados" value={item.wins} />
          </View>
        </TouchableOpacity>
      );
    }
    if (tab === 'requests') return <FriendCard key={item.friendship_id} item={item} actionLabel="Aceptar" onAction={() => act(`/social/requests/${item.friendship_id}/accept`)} secondaryLabel="Rechazar" onSecondary={() => act(`/social/requests/${item.friendship_id}/reject`)} />;
    if (tab === 'search' && query.trim().length < 2) {
      const status=item.friendship_status;
      return <TouchableOpacity key={item.id} style={styles.frequentCard} onPress={()=>navigation.navigate('PlayerSocialProfile',{userId:item.id})} activeOpacity={.82}>
        <SocialAvatar uri={item.avatar_url} name={item.name} size={48}/>
        <View style={styles.frequentCopy}><Text style={styles.friendName} numberOfLines={1}>{item.name}</Text><View style={styles.playedTogether}><Ionicons name="football-outline" color="#ff7a32" size={14}/><Text style={styles.playedText}>{item.matches_together} {item.matches_together===1?'partido':'partidos'} contigo</Text></View>{item.preferred_location?<Text style={styles.frequentLocation}>{item.preferred_location}</Text>:null}</View>
        {status==='none'?<TouchableOpacity style={styles.addFrequent} onPress={()=>act('/social/requests','post',{user_id:item.id})}><Text style={styles.addFrequentText}>Añadir</Text></TouchableOpacity>:status==='friends'?<View style={styles.friendPill}><Ionicons name="checkmark" color="#6fd28b" size={13}/><Text style={styles.friendPillText}>Amigo</Text></View>:<View style={styles.friendPill}><Text style={styles.friendPillText}>{status==='sent'?'Enviada':'Pendiente'}</Text></View>}
      </TouchableOpacity>;
    }
    const status = item.friendship_status;
    return <FriendCard key={item.id} item={item} onPress={() => navigation.navigate('PlayerSocialProfile', { userId:item.id })} actionLabel={tab === 'search' && status === 'none' ? 'Añadir' : null} onAction={() => act('/social/requests', 'post', { user_id:item.id })} />;
  };

  const emptyCopy = tab === 'matches'
    ? ['Ningún amigo está apuntado', 'Aquí verás los próximos partidos en los que juegan tus amigos.']
    : tab === 'invitations'
      ? ['No tienes invitaciones', 'Cuando un amigo o una cuadrilla te invite a jugar, aparecerá aquí.']
    : tab === 'stats'
      ? ['Aún no hay estadísticas', 'Añade amigos para comparar goles, asistencias y partidos ganados.']
      : tab === 'requests'
        ? ['Sin solicitudes pendientes', 'Cuando alguien quiera añadirte aparecerá aquí.']
        : tab === 'search'
          ? query.trim().length<2?['Aún no hay jugadores habituales', 'Cuando coincidas con otros jugadores en partidos aparecerán aquí.']:['Sin resultados', 'Prueba con otro nombre o correo.']
          : ['Todavía no tienes amigos', 'Busca jugadores y crea tu grupo habitual de EasyFutbol.'];

  return (
    <View style={styles.page}>
      <ScreenHeader eyebrow="TU EQUIPO" title="Amigos" description="Encuentra a los tuyos, mira dónde juegan y compara sus números." action={<TouchableOpacity accessibilityLabel="Privacidad social" style={styles.privacyButton} onPress={()=>navigation.navigate('SocialPrivacy')}><Ionicons name="shield-checkmark-outline" color="#fff" size={20}/></TouchableOpacity>} />
      <View style={[styles.search,tab==='search'&&styles.searchActive]}><Ionicons name="search" color={tab==='search'?'#ff6a1a':'#777'} size={20}/><TextInput value={query} onFocus={()=>setTab('search')} onChangeText={value=>{setQuery(value);setTab('search');}} placeholder="Buscar por nombre o correo" placeholderTextColor="#666" style={styles.input} autoCapitalize="none" returnKeyType="search" />{query?<TouchableOpacity onPress={()=>setQuery('')} hitSlop={8}><Ionicons name="close-circle" color="#777" size={20}/></TouchableOpacity>:null}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        {TABS.map(([key, label]) => <TouchableOpacity key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabOn]}><Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}{key === 'invitations' && inviteCount ? ` · ${inviteCount}` : ''}</Text></TouchableOpacity>)}
      </ScrollView>
      <ScrollView style={styles.list} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#ff5a00" />}>
        {tab==='search'&&!loading?<View style={styles.resultsHeading}><Text style={styles.resultsTitle}>{query.trim().length<2?'Jugadores habituales':'Resultados'}</Text><Text style={styles.resultsHint}>{query.trim().length<2?'Personas con las que más has coincidido':'Jugadores encontrados por nombre o correo'}</Text></View>:null}
        {loading ? <ActivityIndicator color="#ff5a00" style={styles.loading} /> : data.length ? data.map(renderItem) : <EmptyState title={emptyCopy[0]} body={emptyCopy[1]} />}
      </ScrollView>
    </View>
  );
}

function Metric({ icon, label, value }) {
  return <View style={styles.metric}><Ionicons name={icon} color="#ff7a32" size={16} /><Text style={styles.metricValue}>{Number(value || 0)}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#0b0b0d'}, tabsScroll:{flexGrow:0,maxHeight:58}, tabs:{paddingHorizontal:16,paddingVertical:10,gap:8}, tab:{height:38,paddingHorizontal:15,borderRadius:19,backgroundColor:'#19191c',justifyContent:'center'}, tabOn:{backgroundColor:'#ff5a00'}, tabText:{color:'#999',fontWeight:'800',fontSize:12}, tabTextOn:{color:'#fff'}, search:{marginHorizontal:16,marginTop:2,marginBottom:4,backgroundColor:'#18181b',borderRadius:16,height:50,flexDirection:'row',alignItems:'center',paddingHorizontal:14,gap:9,borderWidth:1,borderColor:'#28282d'},searchActive:{borderColor:'rgba(255,90,0,.55)',backgroundColor:'#1d1815'}, input:{flex:1,color:'#fff',fontSize:15}, list:{flex:1}, content:{padding:16,paddingTop:8,paddingBottom:110},resultsHeading:{marginBottom:12},resultsTitle:{color:'#fff',fontSize:17,fontWeight:'900'},resultsHint:{color:'#77777e',fontSize:11,marginTop:3},frequentCard:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'rgba(255,255,255,.055)',borderColor:'rgba(255,255,255,.09)',borderWidth:1,borderRadius:18,padding:13,marginBottom:10},frequentCopy:{flex:1},playedTogether:{flexDirection:'row',alignItems:'center',gap:5,marginTop:4},playedText:{color:'#ff8b4b',fontSize:11,fontWeight:'800'},frequentLocation:{color:'#77777e',fontSize:10,marginTop:3},addFrequent:{backgroundColor:'#ff5a00',borderRadius:11,paddingHorizontal:12,paddingVertical:9},addFrequentText:{color:'#fff',fontSize:11,fontWeight:'900'},friendPill:{flexDirection:'row',alignItems:'center',gap:3,backgroundColor:'#202b23',borderRadius:10,paddingHorizontal:9,paddingVertical:7},friendPillText:{color:'#7bcb90',fontSize:9,fontWeight:'900'}, loading:{marginTop:50}, matchCard:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'rgba(255,255,255,.055)',borderColor:'rgba(255,255,255,.09)',borderWidth:1,borderRadius:18,padding:13,marginBottom:10}, matchCopy:{flex:1}, friendName:{color:'#fff',fontSize:16,fontWeight:'900'}, matchTitle:{color:'#d4d4d7',fontSize:13,fontWeight:'700',marginTop:3}, matchDate:{color:'#ff7a32',fontSize:11,fontWeight:'800',marginTop:4,textTransform:'capitalize'}, statsCard:{backgroundColor:'rgba(255,255,255,.055)',borderColor:'rgba(255,255,255,.09)',borderWidth:1,borderRadius:18,padding:14,marginBottom:10}, statsIdentity:{flexDirection:'row',alignItems:'center',gap:12}, metrics:{flexDirection:'row',marginTop:14,paddingTop:12,borderTopWidth:1,borderTopColor:'rgba(255,255,255,.08)'}, metric:{flex:1,alignItems:'center'}, metricValue:{color:'#fff',fontSize:20,fontWeight:'900',marginTop:3}, metricLabel:{color:'#888',fontSize:10,fontWeight:'700',marginTop:1}, invitationCard:{backgroundColor:'#17191e',borderRadius:21,borderWidth:1,borderColor:'#30343d',padding:15,marginBottom:11},invitationInactive:{opacity:.58},invitationTop:{flexDirection:'row',alignItems:'center',gap:11},invitationEyebrow:{color:'#ff6a1a',fontSize:8,fontWeight:'900',letterSpacing:1,marginBottom:3},newPill:{backgroundColor:'#ff5a00',borderRadius:9,paddingHorizontal:8,paddingVertical:5},newPillText:{color:'#fff',fontSize:8,fontWeight:'900'},invitationMatch:{marginTop:13,padding:13,borderRadius:15,backgroundColor:'#101216'},invitationTitle:{color:'#fff',fontSize:15,fontWeight:'900'},invitationCapacity:{flexDirection:'row',alignItems:'center',gap:5,marginTop:9},capacityText:{color:'#70c98a',fontSize:10,fontWeight:'800'},invitationActions:{flexDirection:'row',gap:8,marginTop:12},openInvite:{flex:1,minHeight:43,borderRadius:13,backgroundColor:'#ff5a00',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},openInviteText:{color:'#080808',fontWeight:'900',fontSize:12},declineInvite:{minHeight:43,paddingHorizontal:15,borderRadius:13,borderWidth:1,borderColor:'#3b3e46',alignItems:'center',justifyContent:'center'},declineInviteText:{color:'#a8abb2',fontWeight:'800',fontSize:11},closedStatus:{color:'#777b84',fontSize:11,fontWeight:'800',marginTop:12,textAlign:'right'},
  privacyButton:{width:42,height:42,borderRadius:14,backgroundColor:'#202024',alignItems:'center',justifyContent:'center'},
});
