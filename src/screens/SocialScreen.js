import React,{useCallback,useEffect,useState} from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import { EmptyState, FriendCard } from '../components/social/SocialComponents';

const tabs=[['friends','Amigos'],['best','Mejores'],['frequent','Coincidencias'],['requests','Recibidas'],['sent','Enviadas'],['search','Buscar'],['groups','Grupos'],['invites','Partidos']];
export default function SocialScreen({navigation,route}) {
  const [tab,setTab]=useState(route.params?.tab||'friends'),[data,setData]=useState([]),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[query,setQuery]=useState('');
  const load=useCallback(async()=>{try{setLoading(true);let url='/social/friends';if(tab==='best')url='/social/best-teammates';if(tab==='frequent')url='/social/frequent-players';if(tab==='requests')url='/social/requests/received';if(tab==='sent')url='/social/requests/sent';if(tab==='groups')url='/social/groups';if(tab==='invites')url='/social/match-invitations';if(tab==='search'){if(query.trim().length<2){setData([]);return;}url=`/social/users/search?q=${encodeURIComponent(query.trim())}`;}const r=await api.get(url);setData(r.data?.items||[]);}catch(e){Alert.alert('Zona social',e.response?.data?.msg||'No se pudo cargar');}finally{setLoading(false);setRefreshing(false);}},[tab,query]);
  useFocusEffect(useCallback(()=>{load();},[load]));
  useEffect(()=>{if(tab!=='search')return;const timer=setTimeout(load,350);return()=>clearTimeout(timer);},[query,tab,load]);
  const act=async(path,method='patch',body)=>{try{await api[method](path,body);load();}catch(e){Alert.alert('No se pudo completar',e.response?.data?.msg||e.message);}};
  const renderItem=(item)=>{
    if(tab==='groups')return <FriendCard key={item.id} item={{...item,name:item.name,subtitle:`${item.members_count} miembros`}} onPress={()=>navigation.navigate('FriendGroupDetail',{groupId:item.id})}/>;
    if(tab==='invites')return <FriendCard key={item.id} item={{name:item.sender_name,avatar_url:item.sender_avatar,subtitle:`${item.title} · ${new Date(item.starts_at).toLocaleDateString('es-ES')}`}} actionLabel="Ver" onAction={()=>{act(`/social/match-invitations/${item.id}/view`);navigation.navigate('Match',{id:item.match_id,matchId:item.match_id,invitationId:item.id});}} secondaryLabel="Rechazar" onSecondary={()=>act(`/social/match-invitations/${item.id}/decline`)}/>;
    if(tab==='requests')return <FriendCard key={item.friendship_id} item={item} actionLabel="Aceptar" onAction={()=>act(`/social/requests/${item.friendship_id}/accept`)} secondaryLabel="Rechazar" onSecondary={()=>act(`/social/requests/${item.friendship_id}/reject`)}/>;
    if(tab==='sent')return <FriendCard key={item.friendship_id} item={item} actionLabel="Cancelar" onAction={()=>act(`/social/requests/${item.friendship_id}`,'delete')}/>;
    if(tab==='best')return <FriendCard key={item.id} item={{...item,subtitle:`${item.matches_together} partidos · ${item.win_rate}% victorias · ${item.compatibility}% compatibilidad`}} onPress={()=>navigation.navigate('PlayerSocialProfile',{userId:item.id})}/>;
    if(tab==='frequent')return <FriendCard key={item.id} item={{...item,subtitle:`${item.matches_together} partidos coincidiendo`}} onPress={()=>navigation.navigate('PlayerSocialProfile',{userId:item.id})} actionLabel={item.friendship_status==='none'?'Añadir':null} onAction={()=>act('/social/requests','post',{user_id:item.id})}/>;
    const status=item.friendship_status;
    return <FriendCard key={item.id} item={item} onPress={()=>navigation.navigate('PlayerSocialProfile',{userId:item.id})} actionLabel={tab==='search'&&status==='none'?'Añadir':null} onAction={()=>act('/social/requests','post',{user_id:item.id})}/>;
  };
  return <View style={styles.page}><ScreenHeader title="Comunidad" onBack={()=>navigation.goBack()}/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>{tabs.map(([key,label])=><TouchableOpacity key={key} onPress={()=>setTab(key)} style={[styles.tab,tab===key&&styles.tabOn]}><Text style={[styles.tabText,tab===key&&styles.tabTextOn]}>{label}</Text></TouchableOpacity>)}</ScrollView>
    {tab==='search'?<View style={styles.search}><Ionicons name="search" color="#777" size={20}/><TextInput value={query} onChangeText={setQuery} placeholder="Nombre o correo" placeholderTextColor="#666" style={styles.input} autoCapitalize="none"/></View>:null}
    {tab==='groups'?<TouchableOpacity style={styles.create} onPress={()=>Alert.prompt?.('Nuevo grupo','Nombre del grupo',name=>name&&act('/social/groups','post',{name}))}><Ionicons name="add" color="#fff" size={20}/><Text style={styles.createText}>Crear grupo</Text></TouchableOpacity>:null}
    <ScrollView style={styles.list} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor="#ff5a00"/>}>{loading?<ActivityIndicator color="#ff5a00" style={{marginTop:50}}/>:data.length?data.map(renderItem):<EmptyState title={tab==='search'?'Busca jugadores':tab==='requests'?'Sin solicitudes pendientes':'Todavía no hay contenido'} body={tab==='friends'?'Busca jugadores con los que ya has compartido campo y crea tu equipo habitual.':'Aquí aparecerán las novedades de tu comunidad.'}/>}</ScrollView>
  </View>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#0b0b0d'},tabs:{paddingHorizontal:16,paddingVertical:10,gap:8},tab:{height:38,paddingHorizontal:15,borderRadius:19,backgroundColor:'#19191c',justifyContent:'center'},tabOn:{backgroundColor:'#ff5a00'},tabText:{color:'#999',fontWeight:'800',fontSize:12},tabTextOn:{color:'#fff'},search:{marginHorizontal:16,marginVertical:6,backgroundColor:'#18181b',borderRadius:16,height:48,flexDirection:'row',alignItems:'center',paddingHorizontal:14,gap:9},input:{flex:1,color:'#fff',fontSize:15},list:{flex:1},content:{padding:16,paddingBottom:110},create:{marginHorizontal:16,marginTop:5,backgroundColor:'#252529',borderRadius:14,padding:13,flexDirection:'row',justifyContent:'center',gap:7},createText:{color:'#fff',fontWeight:'800'}});
