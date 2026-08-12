import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import { EmptyState, FriendCard, SocialAvatar } from '../components/social/SocialComponents';

const TABS = [
  ['friends', 'Amigos'],
  ['matches', 'Partidos'],
  ['stats', 'Estadísticas'],
  ['requests', 'Solicitudes'],
  ['search', 'Buscar'],
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

  const load = useCallback(async () => {
    try {
      setLoading(true);
      let url = '/social/friends';
      if (tab === 'matches') url = '/social/friends/matches';
      if (tab === 'stats') url = '/social/friends/stats';
      if (tab === 'requests') url = '/social/requests/received';
      if (tab === 'search') {
        if (query.trim().length < 2) { setData([]); return; }
        url = `/social/users/search?q=${encodeURIComponent(query.trim())}`;
      }
      const response = await api.get(url);
      setData(response.data?.items || []);
    } catch (error) {
      Alert.alert('Amigos', error.response?.data?.msg || 'No se pudo cargar esta sección');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tab, query]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
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
    const status = item.friendship_status;
    return <FriendCard key={item.id} item={item} onPress={() => navigation.navigate('PlayerSocialProfile', { userId:item.id })} actionLabel={tab === 'search' && status === 'none' ? 'Añadir' : null} onAction={() => act('/social/requests', 'post', { user_id:item.id })} />;
  };

  const emptyCopy = tab === 'matches'
    ? ['Ningún amigo está apuntado', 'Aquí verás los próximos partidos en los que juegan tus amigos.']
    : tab === 'stats'
      ? ['Aún no hay estadísticas', 'Añade amigos para comparar goles, asistencias y partidos ganados.']
      : tab === 'requests'
        ? ['Sin solicitudes pendientes', 'Cuando alguien quiera añadirte aparecerá aquí.']
        : tab === 'search'
          ? ['Busca jugadores', 'Escribe un nombre o correo para enviar una solicitud.']
          : ['Todavía no tienes amigos', 'Busca jugadores y crea tu grupo habitual de EasyFutbol.'];

  return (
    <View style={styles.page}>
      <ScreenHeader eyebrow="TU EQUIPO" title="Amigos" description="Encuentra a los tuyos, mira dónde juegan y compara sus números." />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {TABS.map(([key, label]) => <TouchableOpacity key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabOn]}><Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{label}</Text></TouchableOpacity>)}
      </ScrollView>
      {tab === 'search' ? <View style={styles.search}><Ionicons name="search" color="#777" size={20} /><TextInput value={query} onChangeText={setQuery} placeholder="Nombre o correo" placeholderTextColor="#666" style={styles.input} autoCapitalize="none" /></View> : null}
      <ScrollView style={styles.list} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#ff5a00" />}>
        {loading ? <ActivityIndicator color="#ff5a00" style={styles.loading} /> : data.length ? data.map(renderItem) : <EmptyState title={emptyCopy[0]} body={emptyCopy[1]} />}
      </ScrollView>
    </View>
  );
}

function Metric({ icon, label, value }) {
  return <View style={styles.metric}><Ionicons name={icon} color="#ff7a32" size={16} /><Text style={styles.metricValue}>{Number(value || 0)}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#0b0b0d'}, tabs:{paddingHorizontal:16,paddingVertical:10,gap:8}, tab:{height:38,paddingHorizontal:15,borderRadius:19,backgroundColor:'#19191c',justifyContent:'center'}, tabOn:{backgroundColor:'#ff5a00'}, tabText:{color:'#999',fontWeight:'800',fontSize:12}, tabTextOn:{color:'#fff'}, search:{marginHorizontal:16,marginVertical:6,backgroundColor:'#18181b',borderRadius:16,height:48,flexDirection:'row',alignItems:'center',paddingHorizontal:14,gap:9}, input:{flex:1,color:'#fff',fontSize:15}, list:{flex:1}, content:{padding:16,paddingBottom:110}, loading:{marginTop:50}, matchCard:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'rgba(255,255,255,.055)',borderColor:'rgba(255,255,255,.09)',borderWidth:1,borderRadius:18,padding:13,marginBottom:10}, matchCopy:{flex:1}, friendName:{color:'#fff',fontSize:16,fontWeight:'900'}, matchTitle:{color:'#d4d4d7',fontSize:13,fontWeight:'700',marginTop:3}, matchDate:{color:'#ff7a32',fontSize:11,fontWeight:'800',marginTop:4,textTransform:'capitalize'}, statsCard:{backgroundColor:'rgba(255,255,255,.055)',borderColor:'rgba(255,255,255,.09)',borderWidth:1,borderRadius:18,padding:14,marginBottom:10}, statsIdentity:{flexDirection:'row',alignItems:'center',gap:12}, metrics:{flexDirection:'row',marginTop:14,paddingTop:12,borderTopWidth:1,borderTopColor:'rgba(255,255,255,.08)'}, metric:{flex:1,alignItems:'center'}, metricValue:{color:'#fff',fontSize:20,fontWeight:'900',marginTop:3}, metricLabel:{color:'#888',fontSize:10,fontWeight:'700',marginTop:1},
});
