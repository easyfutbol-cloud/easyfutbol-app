import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import { EmptyState, FriendCard, SocialAvatar } from '../components/social/SocialComponents';
import FriendTile, { shortMatchDate } from '../components/social/FriendTile';
import TopPlayers from '../components/social/TopPlayers';

// Social: tus amigos (cuadrícula), los tops de jugadores, invitaciones y
// solicitudes. Al escribir en el buscador se ven resultados en cualquier pestaña.
const TABS = [
  ['friends', 'Amigos', 'people'],
  ['top', 'Top jugadores', 'trophy'],
  ['invitations', 'Invitaciones', 'mail'],
  ['requests', 'Solicitudes', 'person-add'],
];
const PERIODS = [['month', 'Este mes'], ['season', 'Temporada']];
const SOON_MS = 7 * 24 * 60 * 60 * 1000;

const matchDate = (value) => new Date(value).toLocaleString('es-ES', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

export default function SocialScreen({ navigation, route }) {
  const [tab, setTab] = useState(route.params?.tab === 'requests' || route.params?.tab === 'invitations' || route.params?.tab === 'top' ? route.params.tab : 'friends');
  const [data, setData] = useState([]);
  const [friends, setFriends] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [inviteCount, setInviteCount] = useState(0);
  const [requestCount, setRequestCount] = useState(0);
  const [suggestions, setSuggestions] = useState([]);
  const [top, setTop] = useState(null);
  const [topPeriod, setTopPeriod] = useState('month');
  const [topScope, setTopScope] = useState('sede');
  const [topCategory, setTopCategory] = useState('goals');
  const [myId, setMyId] = useState(null);
  const searching = query.trim().length >= 2;

  useEffect(() => {
    AsyncStorage.getItem('user').then((raw) => setMyId(raw ? JSON.parse(raw)?.id ?? null : null)).catch(() => {});
  }, []);
  useEffect(() => {
    const tabParam = route.params?.tab;
    if (tabParam === 'requests' || tabParam === 'invitations' || tabParam === 'top') setTab(tabParam);
  }, [route.params?.tab]);

  const loadSummary = useCallback(async () => {
    try {
      const response = await api.get('/social/summary');
      setInviteCount(Number(response.data?.match_invitations || 0));
      setRequestCount(Number(response.data?.pending_requests || 0));
    } catch (_) {
      setInviteCount(0);
    }
  }, []);

  const loadSuggestions = useCallback(async () => {
    try {
      const response = await api.get('/social/suggestions?limit=15');
      setSuggestions((response.data?.items || []).map((item) => ({ ...item, sent: false })));
    } catch (_) {
      setSuggestions([]);
    }
  }, []);

  const addSuggestion = async (item) => {
    try {
      await api.post('/social/requests', { user_id: item.id });
      setSuggestions((prev) => prev.map((s) => (s.id === item.id ? { ...s, sent: true } : s)));
    } catch (error) { Alert.alert('Social', error.response?.data?.msg || 'No se pudo enviar la solicitud'); }
  };

  const shareInvite = async () => {
    try {
      const response = await api.get('/player-profile/me/share');
      await Share.share({ message: `⚽ Juega conmigo en EasyFutbol. Este es mi perfil: ${response.data.url}` });
    } catch (error) { Alert.alert('Invitar', error.response?.data?.msg || 'No se pudo preparar el enlace'); }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      if (tab === 'friends') {
        const response = await api.get('/social/friends/overview');
        setFriends(response.data?.items || []);
      } else if (tab === 'top') {
        const response = await api.get('/social/top', { params: { period: topPeriod, scope: topScope } });
        setTop(response.data);
        if (response.data?.scope && response.data.scope !== topScope) setTopScope(response.data.scope);
      } else {
        const response = await api.get(tab === 'invitations' ? '/social/match-invitations' : '/social/requests/received');
        setData(response.data?.items || []);
        if (tab === 'invitations') await loadSummary();
      }
    } catch (error) {
      Alert.alert('Social', error.response?.data?.msg || 'No se pudo cargar esta sección');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab, topPeriod, topScope, loadSummary]);

  useFocusEffect(useCallback(() => { load(); loadSummary(); }, [load, loadSummary]));
  useFocusEffect(useCallback(() => { loadSuggestions(); }, [loadSuggestions]));

  // Buscador: resultados con un pequeño retardo mientras se escribe.
  useEffect(() => {
    if (!searching) { setResults(null); return undefined; }
    const timer = setTimeout(async () => {
      try {
        const response = await api.get(`/social/users/search?q=${encodeURIComponent(query.trim())}`);
        setResults(response.data?.items || []);
      } catch (_) { setResults([]); }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, searching]);

  const act = async (path, method = 'patch', body) => {
    try { await api[method](path, body); await load(); await loadSummary(); }
    catch (error) { Alert.alert('Social', error.response?.data?.msg || 'No se pudo completar'); }
  };
  const addFromSearch = async (item) => {
    try {
      await api.post('/social/requests', { user_id: item.id });
      setResults((prev) => (prev || []).map((r) => (r.id === item.id ? { ...r, friendship_status: 'sent' } : r)));
    } catch (error) { Alert.alert('Social', error.response?.data?.msg || 'No se pudo enviar la solicitud'); }
  };

  const openPlayer = (userId) => navigation.navigate('PlayerSocialProfile', { userId });
  const openMatch = (match) => navigation.navigate('Match', { id: match.id, matchId: match.id });

  const playingSoon = useMemo(() => (friends || []).filter((f) => f.next_match && new Date(f.next_match.starts_at).getTime() - Date.now() < SOON_MS), [friends]);
  const category = top?.categories?.find((c) => c.key === topCategory) || top?.categories?.[0];
  const scopes = [['sede', top?.sede ? `Mi sede · ${top.sede}` : 'Mi sede'], ['all', 'Todas las sedes'], ['friends', 'Amigos']];

  const renderInvitation = (item) => {
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
  };

  const renderFriends = () => {
    if (!friends) return <ActivityIndicator color="#ff5a00" style={styles.loading} />;
    return <>
      <View style={styles.quickRow}>
        <QuickAction icon="qr-code-outline" label="Mi QR" onPress={()=>navigation.navigate('FriendQr',{mode:'code'})}/>
        <QuickAction icon="scan-outline" label="Escanear" onPress={()=>navigation.navigate('FriendQr',{mode:'scan'})}/>
        <QuickAction icon="paper-plane-outline" label="Invitar" onPress={shareInvite}/>
      </View>
      {requestCount>0?<TouchableOpacity style={styles.requestsBanner} onPress={()=>setTab('requests')} accessibilityRole="button">
        <View style={styles.requestsDot}><Text style={styles.requestsDotText}>{requestCount}</Text></View>
        <Text style={styles.requestsText}>{requestCount===1?'Tienes 1 solicitud de amistad':`Tienes ${requestCount} solicitudes de amistad`}</Text>
        <Ionicons name="chevron-forward" color="#ff7a32" size={18}/>
      </TouchableOpacity>:null}

      {playingSoon.length?<View style={styles.block}>
        <SectionHeading title="Juegan pronto" hint="Tus amigos con partido esta semana"/>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hRow}>
          {playingSoon.map(friend=><TouchableOpacity key={friend.id} style={styles.soonCard} onPress={()=>openMatch(friend.next_match)} activeOpacity={.85} accessibilityRole="button">
            <SocialAvatar uri={friend.avatar_url} name={friend.name} size={40}/>
            <View style={{flex:1}}>
              <Text numberOfLines={1} style={styles.soonName}>{friend.name.split(' ')[0]}</Text>
              <Text numberOfLines={1} style={styles.soonDate}>{shortMatchDate(friend.next_match.starts_at)}</Text>
              <Text numberOfLines={1} style={styles.soonTitle}>{friend.next_match.title}</Text>
            </View>
            <Ionicons name="chevron-forward" color="#ff7a32" size={16}/>
          </TouchableOpacity>)}
        </ScrollView>
      </View>:null}

      {suggestions.length?<View style={styles.block}>
        <SectionHeading title="Quizá conozcas" hint="Jugadores con los que has coincidido y amigos de tus amigos"/>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionRow}>
          {suggestions.map(item=><TouchableOpacity key={item.id} style={styles.suggestionCard} onPress={()=>openPlayer(item.id)} activeOpacity={.85}>
            <SocialAvatar uri={item.avatar_url} name={item.name} size={58}/>
            <Text style={[styles.suggestionName,item.is_plus&&styles.plusName]} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.suggestionReason} numberOfLines={2}>{suggestionReason(item)}</Text>
            <TouchableOpacity disabled={item.sent} onPress={()=>addSuggestion(item)} style={[styles.suggestionAdd,item.sent&&styles.suggestionSent]} accessibilityRole="button" accessibilityLabel={`Añadir a ${item.name}`}>
              <Ionicons name={item.sent?'checkmark':'person-add'} size={14} color={item.sent?'#7bcb90':'#fff'}/>
              <Text style={[styles.suggestionAddText,item.sent&&{color:'#7bcb90'}]}>{item.sent?'Enviada':'Añadir'}</Text>
            </TouchableOpacity>
          </TouchableOpacity>)}
        </ScrollView>
      </View>:null}

      <SectionHeading title={`Tus amigos${friends.length?` · ${friends.length}`:''}`} hint={friends.length?'Primero los que juegan pronto y con los que más has jugado':null}/>
      {friends.length?<View style={styles.grid}>
        {friends.map(friend=><FriendTile key={friend.id} friend={friend} style={styles.gridItem} onPress={()=>openPlayer(friend.id)} onOpenMatch={openMatch}/>)}
      </View>:<EmptyState title="Todavía no tienes amigos" body="Escanea el QR de alguien en el campo o añade a los jugadores que te sugerimos."/>}
    </>;
  };

  const renderTop = () => <>
    <View style={styles.filterRow}>
      {PERIODS.map(([key,label])=><Chip key={key} label={label} active={topPeriod===key} onPress={()=>setTopPeriod(key)}/>)}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
      {scopes.map(([key,label])=><Chip key={key} label={label} small active={topScope===key} onPress={()=>setTopScope(key)}/>)}
    </ScrollView>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
      {(top?.categories||[]).map(c=><TouchableOpacity key={c.key} onPress={()=>setTopCategory(c.key)} style={[styles.category,category?.key===c.key&&styles.categoryOn]} accessibilityRole="tab" accessibilityState={{selected:category?.key===c.key}}>
        <Text style={styles.categoryEmoji}>{c.emoji}</Text>
        <Text style={[styles.categoryText,category?.key===c.key&&{color:'#fff'}]}>{c.title}</Text>
      </TouchableOpacity>)}
    </ScrollView>
    {loading&&!top?<ActivityIndicator color="#ff5a00" style={styles.loading}/>:<TopPlayers category={category} onOpenPlayer={openPlayer} myId={myId}/>}
  </>;

  const renderList = () => {
    if (loading) return <ActivityIndicator color="#ff5a00" style={styles.loading} />;
    if (!data.length) {
      return tab === 'invitations'
        ? <EmptyState icon="mail-outline" title="No tienes invitaciones" body="Cuando un amigo o una cuadrilla te invite a jugar, aparecerá aquí."/>
        : <EmptyState icon="person-add-outline" title="Sin solicitudes pendientes" body="Cuando alguien quiera añadirte aparecerá aquí."/>;
    }
    return data.map((item) => tab === 'invitations'
      ? renderInvitation(item)
      : <FriendCard key={item.friendship_id} item={item} onPress={()=>openPlayer(item.id)} actionLabel="Aceptar" onAction={() => act(`/social/requests/${item.friendship_id}/accept`)} secondaryLabel="Rechazar" onSecondary={() => act(`/social/requests/${item.friendship_id}/reject`)} />);
  };

  const renderSearch = () => {
    if (!results) return <ActivityIndicator color="#ff5a00" style={styles.loading} />;
    if (!results.length) return <EmptyState icon="search-outline" title="Sin resultados" body="Prueba con otro nombre o correo."/>;
    return <>
      <SectionHeading title="Resultados" hint="Jugadores encontrados por nombre o correo"/>
      {results.map(item=><FriendCard key={item.id} item={item} onPress={()=>openPlayer(item.id)} actionLabel={item.friendship_status==='none'?'Añadir':null} onAction={()=>addFromSearch(item)}/>)}
    </>;
  };

  const badge = (key) => (key === 'invitations' ? inviteCount : key === 'requests' ? requestCount : 0);

  return (
    <View style={styles.page}>
      <ScreenHeader eyebrow="TU COMUNIDAD" title="Social" description="Tus amigos, quién juega pronto y los que más destacan." action={<TouchableOpacity accessibilityLabel="Privacidad social" style={styles.privacyButton} onPress={()=>navigation.navigate('SocialPrivacy')}><Ionicons name="shield-checkmark-outline" color="#fff" size={20}/></TouchableOpacity>} />
      <View style={[styles.search,searching&&styles.searchActive]}><Ionicons name="search" color={searching?'#ff6a1a':'#777'} size={20}/><TextInput value={query} onChangeText={setQuery} placeholder="Buscar jugadores por nombre o correo" placeholderTextColor="#666" style={styles.input} autoCapitalize="none" returnKeyType="search" />{query?<TouchableOpacity onPress={()=>setQuery('')} hitSlop={8}><Ionicons name="close-circle" color="#777" size={20}/></TouchableOpacity>:null}</View>
      {!searching?<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        {TABS.map(([key,label,icon]) => <TouchableOpacity key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabOn]} accessibilityRole="tab" accessibilityState={{selected:tab===key}}>
          <Ionicons name={tab===key?icon:`${icon}-outline`} size={15} color={tab===key?'#fff':'#999'}/>
          <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text>
          {badge(key)?<View style={styles.tabBadge}><Text style={styles.tabBadgeText}>{badge(key)}</Text></View>:null}
        </TouchableOpacity>)}
      </ScrollView>:null}
      <ScrollView style={styles.list} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); loadSummary(); loadSuggestions(); }} tintColor="#ff5a00" />}>
        {searching ? renderSearch() : tab === 'friends' ? renderFriends() : tab === 'top' ? renderTop() : renderList()}
      </ScrollView>
    </View>
  );
}

const suggestionReason = (item) => [
  item.matches_together ? `${item.matches_together} ${item.matches_together === 1 ? 'partido' : 'partidos'} contigo` : null,
  item.mutual_friends ? `${item.mutual_friends} ${item.mutual_friends === 1 ? 'amigo' : 'amigos'} en común` : null,
].filter(Boolean).join(' · ');

function QuickAction({ icon, label, onPress }) {
  return <TouchableOpacity style={styles.quickAction} onPress={onPress} accessibilityRole="button"><View style={styles.quickIcon}><Ionicons name={icon} color="#ff6a1a" size={21}/></View><Text style={styles.quickLabel}>{label}</Text></TouchableOpacity>;
}

function SectionHeading({ title, hint }) {
  return <View style={styles.resultsHeading}><Text style={styles.resultsTitle}>{title}</Text>{hint?<Text style={styles.resultsHint}>{hint}</Text>:null}</View>;
}

function Chip({ label, active, onPress, small }) {
  return <TouchableOpacity onPress={onPress} style={[styles.chip,small&&styles.chipSmall,active&&styles.chipOn]} accessibilityRole="button" accessibilityState={{selected:active}}><Text style={[styles.chipText,small&&{fontSize:11},active&&styles.chipTextOn]}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#0b0b0d'}, tabsScroll:{flexGrow:0,maxHeight:58}, tabs:{paddingHorizontal:16,paddingVertical:10,gap:8}, tabOn:{backgroundColor:'#ff5a00'}, tabText:{color:'#999',fontWeight:'800',fontSize:12}, tabTextOn:{color:'#fff'}, search:{marginHorizontal:16,marginTop:2,marginBottom:4,backgroundColor:'#18181b',borderRadius:16,height:50,flexDirection:'row',alignItems:'center',paddingHorizontal:14,gap:9,borderWidth:1,borderColor:'#28282d'},searchActive:{borderColor:'rgba(255,90,0,.55)',backgroundColor:'#1d1815'}, input:{flex:1,color:'#fff',fontSize:15}, list:{flex:1}, content:{padding:16,paddingTop:8,paddingBottom:110},resultsHeading:{marginBottom:12},resultsTitle:{color:'#fff',fontSize:17,fontWeight:'900'},resultsHint:{color:'#77777e',fontSize:11,marginTop:3},frequentCard:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'rgba(255,255,255,.055)',borderColor:'rgba(255,255,255,.09)',borderWidth:1,borderRadius:18,padding:13,marginBottom:10},frequentCopy:{flex:1},playedTogether:{flexDirection:'row',alignItems:'center',gap:5,marginTop:4},playedText:{color:'#ff8b4b',fontSize:11,fontWeight:'800'},frequentLocation:{color:'#77777e',fontSize:10,marginTop:3},addFrequent:{backgroundColor:'#ff5a00',borderRadius:11,paddingHorizontal:12,paddingVertical:9},addFrequentText:{color:'#fff',fontSize:11,fontWeight:'900'},friendPill:{flexDirection:'row',alignItems:'center',gap:3,backgroundColor:'#202b23',borderRadius:10,paddingHorizontal:9,paddingVertical:7},friendPillText:{color:'#7bcb90',fontSize:9,fontWeight:'900'}, loading:{marginTop:50}, matchCard:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'rgba(255,255,255,.055)',borderColor:'rgba(255,255,255,.09)',borderWidth:1,borderRadius:18,padding:13,marginBottom:10}, matchCopy:{flex:1}, friendName:{color:'#fff',fontSize:16,fontWeight:'900'}, plusName:{color:'#F4C95D'}, matchTitle:{color:'#d4d4d7',fontSize:13,fontWeight:'700',marginTop:3}, matchDate:{color:'#ff7a32',fontSize:11,fontWeight:'800',marginTop:4,textTransform:'capitalize'}, statsCard:{backgroundColor:'rgba(255,255,255,.055)',borderColor:'rgba(255,255,255,.09)',borderWidth:1,borderRadius:18,padding:14,marginBottom:10}, statsIdentity:{flexDirection:'row',alignItems:'center',gap:12}, metrics:{flexDirection:'row',marginTop:14,paddingTop:12,borderTopWidth:1,borderTopColor:'rgba(255,255,255,.08)'}, metric:{flex:1,alignItems:'center'}, metricValue:{color:'#fff',fontSize:20,fontWeight:'900',marginTop:3}, metricLabel:{color:'#888',fontSize:10,fontWeight:'700',marginTop:1}, invitationCard:{backgroundColor:'#17191e',borderRadius:21,borderWidth:1,borderColor:'#30343d',padding:15,marginBottom:11},invitationInactive:{opacity:.58},invitationTop:{flexDirection:'row',alignItems:'center',gap:11},invitationEyebrow:{color:'#ff6a1a',fontSize:8,fontWeight:'900',letterSpacing:1,marginBottom:3},newPill:{backgroundColor:'#ff5a00',borderRadius:9,paddingHorizontal:8,paddingVertical:5},newPillText:{color:'#fff',fontSize:8,fontWeight:'900'},invitationMatch:{marginTop:13,padding:13,borderRadius:15,backgroundColor:'#101216'},invitationTitle:{color:'#fff',fontSize:15,fontWeight:'900'},invitationCapacity:{flexDirection:'row',alignItems:'center',gap:5,marginTop:9},capacityText:{color:'#70c98a',fontSize:10,fontWeight:'800'},invitationActions:{flexDirection:'row',gap:8,marginTop:12},openInvite:{flex:1,minHeight:43,borderRadius:13,backgroundColor:'#ff5a00',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},openInviteText:{color:'#080808',fontWeight:'900',fontSize:12},declineInvite:{minHeight:43,paddingHorizontal:15,borderRadius:13,borderWidth:1,borderColor:'#3b3e46',alignItems:'center',justifyContent:'center'},declineInviteText:{color:'#a8abb2',fontWeight:'800',fontSize:11},closedStatus:{color:'#777b84',fontSize:11,fontWeight:'800',marginTop:12,textAlign:'right'},
  quickRow:{flexDirection:'row',gap:9,marginBottom:12},quickAction:{flex:1,alignItems:'center',gap:7,paddingVertical:13,borderRadius:18,backgroundColor:'#17171a',borderWidth:1,borderColor:'#26262b'},quickIcon:{width:40,height:40,borderRadius:14,backgroundColor:'rgba(255,90,0,.13)',alignItems:'center',justifyContent:'center'},quickLabel:{color:'#fff',fontSize:12,fontWeight:'900'},
  requestsBanner:{flexDirection:'row',alignItems:'center',gap:10,padding:13,borderRadius:16,backgroundColor:'rgba(255,90,0,.10)',borderWidth:1,borderColor:'rgba(255,90,0,.35)',marginBottom:12},requestsDot:{minWidth:26,height:26,borderRadius:13,backgroundColor:'#ff5a00',alignItems:'center',justifyContent:'center',paddingHorizontal:6},requestsDotText:{color:'#fff',fontWeight:'900',fontSize:12},requestsText:{color:'#fff',fontWeight:'800',fontSize:13,flex:1},
  suggestions:{marginBottom:10},suggestionRow:{gap:10,paddingTop:12,paddingBottom:4},suggestionCard:{width:142,alignItems:'center',padding:13,borderRadius:20,backgroundColor:'rgba(255,255,255,.055)',borderWidth:1,borderColor:'rgba(255,255,255,.09)'},suggestionName:{color:'#fff',fontSize:13,fontWeight:'900',marginTop:9,maxWidth:'100%'},suggestionReason:{color:'#ff8b4b',fontSize:10,fontWeight:'800',textAlign:'center',marginTop:4,minHeight:26},
  suggestionAdd:{flexDirection:'row',alignItems:'center',gap:5,marginTop:10,backgroundColor:'#ff5a00',borderRadius:11,paddingHorizontal:12,paddingVertical:8},suggestionSent:{backgroundColor:'#202b23'},suggestionAddText:{color:'#fff',fontSize:11,fontWeight:'900'},
  privacyButton:{width:42,height:42,borderRadius:14,backgroundColor:'#202024',alignItems:'center',justifyContent:'center'},
  tab:{height:38,paddingHorizontal:14,borderRadius:19,backgroundColor:'#19191c',flexDirection:'row',alignItems:'center',gap:6},
  tabBadge:{minWidth:18,height:18,borderRadius:9,backgroundColor:'#ff5a00',alignItems:'center',justifyContent:'center',paddingHorizontal:5},tabBadgeText:{color:'#fff',fontSize:10,fontWeight:'900'},
  block:{marginBottom:6},hRow:{gap:10,paddingTop:12,paddingBottom:8},
  soonCard:{width:230,flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:18,backgroundColor:'#141417',borderWidth:1,borderColor:'rgba(255,90,0,.3)'},
  soonName:{color:'#fff',fontSize:13,fontWeight:'900'},soonDate:{color:'#ff8b4b',fontSize:11,fontWeight:'900',marginTop:2},soonTitle:{color:'#8d9097',fontSize:10,fontWeight:'700',marginTop:2},
  grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:12,marginTop:4},gridItem:{width:'48.3%'},
  filterRow:{flexDirection:'row',gap:8,marginBottom:10},filterScroll:{gap:7,paddingBottom:12},
  chip:{flex:1,height:40,borderRadius:13,backgroundColor:'#17171a',borderWidth:1,borderColor:'#26262b',alignItems:'center',justifyContent:'center'},chipSmall:{flex:0,height:32,paddingHorizontal:12,borderRadius:16},
  chipOn:{backgroundColor:'#ff5a00',borderColor:'#ff5a00'},chipText:{color:'#a5a8ae',fontSize:13,fontWeight:'900'},chipTextOn:{color:'#fff'},
  categoryRow:{gap:8,paddingBottom:14},category:{alignItems:'center',width:84,paddingVertical:10,borderRadius:16,backgroundColor:'#141417',borderWidth:1,borderColor:'#232327'},
  categoryOn:{borderColor:'#ff5a00',backgroundColor:'rgba(255,90,0,.14)'},categoryEmoji:{fontSize:22},categoryText:{color:'#8d9097',fontSize:10,fontWeight:'900',marginTop:5,textAlign:'center'},
});
