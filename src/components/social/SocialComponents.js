import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function SocialAvatar({ uri, name, size=48 }) {
  const style={width:size,height:size,borderRadius:size/2};
  return uri ? <Image source={{uri}} style={[style,styles.avatar]} /> : <View style={[style,styles.placeholder]}><Text style={styles.initial}>{String(name||'?').slice(0,1).toUpperCase()}</Text></View>;
}
export function FriendCard({ item, onPress, actionLabel, onAction, secondaryLabel, onSecondary }) {
  return <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
    <SocialAvatar uri={item.avatar_url||item.actor_avatar} name={item.name||item.actor_name} />
    <View style={styles.copy}><Text style={styles.name}>{item.name||item.actor_name}</Text><Text style={styles.meta}>{item.preferred_location||item.subtitle||'EasyFutbol'}</Text></View>
    {secondaryLabel?<TouchableOpacity style={styles.ghost} onPress={onSecondary}><Text style={styles.ghostText}>{secondaryLabel}</Text></TouchableOpacity>:null}
    {actionLabel?<TouchableOpacity style={styles.button} onPress={onAction}><Text style={styles.buttonText}>{actionLabel}</Text></TouchableOpacity>:<Ionicons name="chevron-forward" color="#777" size={20}/>} 
  </TouchableOpacity>;
}
export function CompatibilityCard({ stats }) {
  return <View style={styles.hero}><Text style={styles.eyebrow}>COMPATIBILIDAD</Text><Text style={styles.score}>{stats?.compatibility??35}%</Text><Text style={styles.heroText}>{stats?.matches_together||0} partidos juntos · {stats?.wins||0} victorias</Text><View style={styles.row}><Metric label="Mismo equipo" value={stats?.same_team||0}/><Metric label="Rivales" value={stats?.rivals||0}/><Metric label="Mejor racha" value={stats?.best_win_streak||0}/></View></View>;
}
export function Metric({label,value}) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
export function EmptyState({icon='people-outline',title,body}) { return <View style={styles.empty}><Ionicons name={icon} size={42} color="#ff5a00"/><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text></View>; }

const styles=StyleSheet.create({card:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'rgba(255,255,255,.055)',borderColor:'rgba(255,255,255,.09)',borderWidth:1,borderRadius:18,padding:13,marginBottom:10},avatar:{backgroundColor:'#252525'},placeholder:{backgroundColor:'#2a2a2d',alignItems:'center',justifyContent:'center'},initial:{color:'#fff',fontWeight:'900',fontSize:18},copy:{flex:1},name:{color:'#fff',fontSize:16,fontWeight:'800'},meta:{color:'#999',fontSize:12,marginTop:3},button:{backgroundColor:'#ff5a00',borderRadius:12,paddingHorizontal:12,paddingVertical:9},buttonText:{color:'#fff',fontWeight:'800',fontSize:12},ghost:{padding:9},ghostText:{color:'#aaa',fontWeight:'700',fontSize:12},hero:{borderRadius:24,padding:22,backgroundColor:'#171719',borderWidth:1,borderColor:'rgba(255,90,0,.35)',alignItems:'center'},eyebrow:{color:'#ff7a32',fontWeight:'900',letterSpacing:1.5,fontSize:11},score:{color:'#fff',fontSize:54,fontWeight:'900',marginTop:3},heroText:{color:'#aaa',marginBottom:18},row:{flexDirection:'row',width:'100%'},metric:{flex:1,alignItems:'center'},metricValue:{color:'#fff',fontSize:19,fontWeight:'900'},metricLabel:{color:'#888',fontSize:10,marginTop:3,textAlign:'center'},empty:{alignItems:'center',paddingVertical:50,paddingHorizontal:28},emptyTitle:{color:'#fff',fontWeight:'900',fontSize:19,marginTop:12},emptyBody:{color:'#8d8d92',textAlign:'center',lineHeight:19,marginTop:7}});
