import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import { SocialAvatar } from '../components/social/SocialComponents';

export default function PlayerSocialProfileScreen({ navigation, route }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => api.get(`/social/users/${route.params.userId}/stats`).then((response) => setData(response.data)).catch((error) => Alert.alert('Perfil', error.response?.data?.msg || 'No se pudo cargar')), [route.params.userId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!data) return <View style={styles.page}><ActivityIndicator color="#ff5a00" style={styles.loader} /></View>;

  const status = data.friendship?.status;
  const action = async () => {
    try {
      if (status === 'none') await api.post('/social/requests', { user_id:data.user.id });
      else if (status === 'received') await api.patch(`/social/requests/${data.friendship.friendship_id}/accept`);
      else if (status === 'sent') await api.delete(`/social/requests/${data.friendship.friendship_id}`);
      else await api.delete(`/social/friends/${data.user.id}`);
      await load();
    } catch (error) { Alert.alert('Amistad', error.response?.data?.msg || 'No se pudo completar'); }
  };

  return <View style={styles.page}><ScreenHeader title="Perfil de jugador" onBack={() => navigation.goBack()} /><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.identity}><SocialAvatar uri={data.user.avatar_url} name={data.user.name} size={88} /><Text style={styles.name}>{data.user.name}</Text><Text style={styles.location}>{data.user.preferred_location || 'EasyFutbol'}</Text><TouchableOpacity onPress={action} style={[styles.action, status === 'friends' && styles.secondary]}><Text style={styles.actionText}>{status === 'friends' ? 'Eliminar amistad' : status === 'sent' ? 'Cancelar solicitud' : status === 'received' ? 'Aceptar solicitud' : 'Añadir amigo'}</Text></TouchableOpacity></View>
    <View style={styles.statsCard}>
      <Text style={styles.statsEyebrow}>ESTADÍSTICAS</Text>
      <View style={styles.metrics}>
        <Metric icon="football-outline" label="Goles" value={data.stats?.goals} />
        <Metric icon="git-merge-outline" label="Asistencias" value={data.stats?.assists} />
        <Metric icon="trophy-outline" label="Ganados" value={data.stats?.wins} />
      </View>
    </View>
  </ScrollView></View>;
}

function Metric({ icon, label, value }) { return <View style={styles.metric}><Ionicons name={icon} color="#ff7a32" size={23} /><Text style={styles.metricValue}>{Number(value || 0)}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({page:{flex:1,backgroundColor:'#0b0b0d'},loader:{marginTop:80},content:{padding:18,paddingBottom:100},identity:{alignItems:'center',paddingVertical:24},name:{color:'#fff',fontSize:25,fontWeight:'900',marginTop:12},location:{color:'#888',marginTop:4},action:{backgroundColor:'#ff5a00',borderRadius:14,paddingHorizontal:20,paddingVertical:12,marginTop:16},secondary:{backgroundColor:'#28282c'},actionText:{color:'#fff',fontWeight:'900'},statsCard:{borderRadius:24,padding:22,backgroundColor:'#171719',borderWidth:1,borderColor:'rgba(255,90,0,.35)'},statsEyebrow:{color:'#ff7a32',fontWeight:'900',letterSpacing:1.5,fontSize:11,textAlign:'center'},metrics:{flexDirection:'row',marginTop:20},metric:{flex:1,alignItems:'center'},metricValue:{color:'#fff',fontSize:28,fontWeight:'900',marginTop:6},metricLabel:{color:'#888',fontSize:11,fontWeight:'700',marginTop:3}});
