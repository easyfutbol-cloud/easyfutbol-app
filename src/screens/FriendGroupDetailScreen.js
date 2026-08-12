import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import { SocialAvatar } from '../components/social/SocialComponents';

const roleLabel = { owner:'Propietario', admin:'Administrador', member:'Miembro' };
const matchDate = (value) => new Intl.DateTimeFormat('es-ES', { day:'numeric', month:'short', year:'numeric' }).format(new Date(value));

export default function FriendGroupDetailScreen({ navigation, route }) {
  const [data, setData] = useState(null);
  const [friends, setFriends] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const groupId = route.params.groupId;
  const load = useCallback(() => api.get(`/social/groups/${groupId}`).then((response) => {
    setData(response.data); setName(response.data.group.name);
  }).catch((error) => Alert.alert('Grupo', error.response?.data?.msg || 'No se pudo cargar')), [groupId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const canManage = ['owner','admin'].includes(data?.group?.role);
  const memberIds = useMemo(() => new Set((data?.members || []).map((member) => Number(member.id))), [data?.members]);
  const availableFriends = friends.filter((friend) => !memberIds.has(Number(friend.id)) && friend.name?.toLowerCase().includes(query.toLowerCase()));
  const openAdd = async () => {
    try { const response = await api.get('/social/friends?limit=50'); setFriends(response.data?.items || []); setAddOpen(true); }
    catch { Alert.alert('Grupo', 'No se pudieron cargar tus amigos'); }
  };
  const addMember = async (userId) => {
    try { await api.post(`/social/groups/${groupId}/members`, { user_id:userId }); await load(); }
    catch (error) { Alert.alert('Grupo', error.response?.data?.msg || 'No se pudo añadir'); }
  };
  const removeMember = (member) => Alert.alert('Quitar del grupo', `¿Quieres quitar a ${member.name}?`, [
    { text:'Cancelar', style:'cancel' },
    { text:'Quitar', style:'destructive', onPress:async () => {
      try { await api.delete(`/social/groups/${groupId}/members/${member.id}`); await load(); }
      catch (error) { Alert.alert('Grupo', error.response?.data?.msg || 'No se pudo quitar'); }
    } },
  ]);
  const saveName = async () => {
    try { await api.patch(`/social/groups/${groupId}`, { name, image_url:data.group.image_url || null }); setEditOpen(false); await load(); }
    catch (error) { Alert.alert('Grupo', error.response?.data?.msg || 'No se pudo guardar'); }
  };
  const leaveOrDelete = () => {
    const owner = data.group.role === 'owner';
    Alert.alert(owner ? 'Eliminar grupo' : 'Salir del grupo', owner ? 'Se eliminará el grupo para todos sus miembros.' : 'Dejarás de ver la actividad de esta cuadrilla.', [
      { text:'Cancelar', style:'cancel' },
      { text:owner ? 'Eliminar' : 'Salir', style:'destructive', onPress:async () => {
        try { owner ? await api.delete(`/social/groups/${groupId}`) : await api.post(`/social/groups/${groupId}/leave`); navigation.navigate('Social'); }
        catch (error) { Alert.alert('Grupo', error.response?.data?.msg || 'No se pudo completar'); }
      } },
    ]);
  };

  if (!data) return <View style={styles.page}><ActivityIndicator color="#ff5a00" style={styles.loader} /></View>;
  return <View style={styles.page}>
    <ScreenHeader title="Cuadrilla" onBack={() => navigation.navigate('Social')} />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.groupAvatar}><Text style={styles.groupInitial}>{data.group.name.slice(0, 2).toUpperCase()}</Text></View>
        <View style={styles.heroCopy}><Text style={styles.eyebrow}>TU GRUPO HABITUAL</Text><Text style={styles.groupName}>{data.group.name}</Text><Text style={styles.memberCount}>{data.members.length} miembros</Text></View>
        {canManage && <TouchableOpacity style={styles.iconButton} onPress={() => setEditOpen(true)}><Ionicons name="pencil" color="#fff" size={17} /></TouchableOpacity>}
      </View>

      <View style={styles.statsRow}>
        <Stat value={data.stats?.matches_played} label="Partidos" />
        <Stat value={data.stats?.goals} label="Goles" />
        <Stat value={data.stats?.assists} label="Asistencias" />
      </View>

      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>MIEMBROS</Text>{canManage && <TouchableOpacity style={styles.addButton} onPress={openAdd}><Ionicons name="person-add" color="#ff6a1a" size={16} /><Text style={styles.addText}>Añadir</Text></TouchableOpacity>}</View>
      <View style={styles.card}>{data.members.map((member, index) => <TouchableOpacity key={member.id} style={[styles.member, index > 0 && styles.divider]} onPress={() => navigation.navigate('PlayerSocialProfile', { userId:member.id })} onLongPress={() => canManage && member.role !== 'owner' && removeMember(member)}>
        <SocialAvatar uri={member.avatar_url} name={member.name} size={46} />
        <View style={styles.memberCopy}><Text style={styles.memberName}>{member.name}</Text><Text style={styles.memberRole}>{roleLabel[member.role] || 'Miembro'}{canManage && member.role !== 'owner' ? ' · Mantén pulsado para quitar' : ''}</Text></View>
        <Ionicons name="chevron-forward" color="#555" size={18} />
      </TouchableOpacity>)}</View>

      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>ÚLTIMOS PARTIDOS JUNTOS</Text></View>
      <View style={styles.card}>
        {!data.recent_matches?.length && <View style={styles.empty}><Ionicons name="football-outline" color="#555" size={25} /><Text style={styles.emptyText}>Cuando dos o más miembros jueguen el mismo partido, aparecerá aquí.</Text></View>}
        {data.recent_matches?.map((match, index) => <TouchableOpacity key={match.match_id} style={[styles.match, index > 0 && styles.divider]} onPress={() => navigation.navigate('Match', { matchId:match.match_id })}>
          <View style={styles.matchIcon}><Ionicons name="football" color="#ff6a1a" size={18} /></View>
          <View style={styles.memberCopy}><Text style={styles.memberName}>{match.title}</Text><Text style={styles.memberRole}>{matchDate(match.starts_at)} · {match.members_played} del grupo · {match.goals} goles</Text></View>
          <Ionicons name="chevron-forward" color="#555" size={18} />
        </TouchableOpacity>)}
      </View>

      <TouchableOpacity style={styles.dangerButton} onPress={leaveOrDelete}><Text style={styles.dangerText}>{data.group.role === 'owner' ? 'Eliminar cuadrilla' : 'Salir de la cuadrilla'}</Text></TouchableOpacity>
    </ScrollView>

    <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}><View style={styles.overlay}><View style={styles.sheet}>
      <SheetHeader title="Añadir amigos" onClose={() => setAddOpen(false)} />
      <View style={styles.search}><Ionicons name="search" color="#777" size={18} /><TextInput value={query} onChangeText={setQuery} placeholder="Buscar amigo" placeholderTextColor="#666" style={styles.input} /></View>
      <ScrollView>{!availableFriends.length && <Text style={styles.emptyText}>No quedan amigos por añadir.</Text>}{availableFriends.map((friend) => <TouchableOpacity key={friend.id} style={styles.member} onPress={() => addMember(friend.id)}><SocialAvatar uri={friend.avatar_url} name={friend.name} size={42} /><Text style={[styles.memberName,{flex:1}]}>{friend.name}</Text><Ionicons name="add-circle" color="#ff5a00" size={25} /></TouchableOpacity>)}</ScrollView>
    </View></View></Modal>

    <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}><View style={styles.centerOverlay}><View style={styles.editBox}>
      <SheetHeader title="Editar cuadrilla" onClose={() => setEditOpen(false)} />
      <Text style={styles.fieldLabel}>NOMBRE</Text><TextInput value={name} onChangeText={setName} maxLength={80} style={styles.nameInput} />
      <TouchableOpacity style={styles.saveButton} onPress={saveName}><Text style={styles.saveText}>Guardar cambios</Text></TouchableOpacity>
    </View></View></Modal>
  </View>;
}

function Stat({ value, label }) { return <View style={styles.stat}><Text style={styles.statValue}>{Number(value || 0)}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function SheetHeader({ title, onClose }) { return <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{title}</Text><TouchableOpacity onPress={onClose}><Ionicons name="close" color="#fff" size={26} /></TouchableOpacity></View>; }

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#0b0b0d'},loader:{marginTop:80},content:{padding:17,paddingBottom:110},
  hero:{borderRadius:24,backgroundColor:'#181719',borderWidth:1,borderColor:'#302923',padding:19,flexDirection:'row',alignItems:'center'},groupAvatar:{width:68,height:68,borderRadius:22,backgroundColor:'#ff5a00',alignItems:'center',justifyContent:'center'},groupInitial:{color:'#fff',fontWeight:'900',fontSize:23},heroCopy:{flex:1,marginLeft:14},eyebrow:{color:'#ff6a1a',fontSize:9,fontWeight:'900',letterSpacing:1.2},groupName:{color:'#fff',fontSize:22,fontWeight:'900',marginTop:4},memberCount:{color:'#85858a',fontSize:12,marginTop:4},iconButton:{width:38,height:38,borderRadius:12,backgroundColor:'#29292d',alignItems:'center',justifyContent:'center'},
  statsRow:{flexDirection:'row',gap:9,marginTop:12},stat:{flex:1,backgroundColor:'#18181b',borderRadius:17,paddingVertical:15,alignItems:'center'},statValue:{color:'#fff',fontSize:24,fontWeight:'900'},statLabel:{color:'#77777e',fontSize:10,textTransform:'uppercase',fontWeight:'800',marginTop:3},
  sectionHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:25,marginBottom:10,paddingHorizontal:2},sectionTitle:{color:'#9b9ba1',fontSize:10,fontWeight:'900',letterSpacing:1.2},addButton:{flexDirection:'row',alignItems:'center',gap:5},addText:{color:'#ff6a1a',fontWeight:'900',fontSize:12},card:{backgroundColor:'#171719',borderRadius:20,paddingHorizontal:15,borderWidth:1,borderColor:'#28282c'},
  member:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:13},divider:{borderTopWidth:1,borderTopColor:'#29292d'},memberCopy:{flex:1},memberName:{color:'#fff',fontWeight:'800',fontSize:14},memberRole:{color:'#74747b',fontSize:10,marginTop:4},match:{flexDirection:'row',alignItems:'center',paddingVertical:14},matchIcon:{width:38,height:38,borderRadius:12,backgroundColor:'#2b211c',alignItems:'center',justifyContent:'center'},empty:{paddingVertical:24,alignItems:'center',gap:9},emptyText:{color:'#77777e',lineHeight:19,textAlign:'center',fontSize:12},
  dangerButton:{alignItems:'center',padding:16,marginTop:22},dangerText:{color:'#d55d5d',fontWeight:'800'},overlay:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(0,0,0,.72)'},sheet:{backgroundColor:'#17171a',maxHeight:'75%',padding:20,paddingBottom:35,borderTopLeftRadius:27,borderTopRightRadius:27},sheetHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:18},sheetTitle:{color:'#fff',fontSize:22,fontWeight:'900'},search:{height:45,backgroundColor:'#242428',borderRadius:13,flexDirection:'row',alignItems:'center',paddingHorizontal:12,gap:8,marginBottom:10},input:{flex:1,color:'#fff'},
  centerOverlay:{flex:1,justifyContent:'center',padding:25,backgroundColor:'rgba(0,0,0,.76)'},editBox:{backgroundColor:'#19191c',borderRadius:24,padding:20},fieldLabel:{color:'#777',fontSize:10,fontWeight:'900',letterSpacing:1},nameInput:{backgroundColor:'#27272b',borderRadius:14,color:'#fff',padding:14,fontSize:16,fontWeight:'800',marginTop:7},saveButton:{backgroundColor:'#ff5a00',borderRadius:14,padding:15,alignItems:'center',marginTop:18},saveText:{color:'#fff',fontWeight:'900'},
});
