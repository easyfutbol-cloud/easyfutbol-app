import React,{useCallback,useState}from'react';
import{ActivityIndicator,Alert,Linking,Platform,ScrollView,StyleSheet,Switch,Text,TouchableOpacity,View}from'react-native';
import{useFocusEffect}from'@react-navigation/native';
import{Ionicons}from'@expo/vector-icons';
import{api}from'../api/client';
import ScreenHeader from'../components/ScreenHeader';
import{getNotificationPermissionStatus,registerForPushNotificationsAsync}from'../utils/notifications';

const OPTIONS=[['match_updates_enabled','calendar-outline','Cambios en partidos','Cancelaciones, cambios de hora y de campo.'],['match_reminders_enabled','alarm-outline','Recordatorios','Avisos antes de que empiece tu partido.'],['social_enabled','people-outline','Actividad social','Solicitudes, amistades e invitaciones.'],['easypass_enabled','gift-outline','EasyPass','Regalos, saldo y movimientos importantes.'],['news_enabled','megaphone-outline','Novedades','Comunicaciones y noticias de EasyFutbol.']];

export default function NotificationPreferencesScreen({navigation}){
  const[prefs,setPrefs]=useState(null),[saving,setSaving]=useState(false),[permission,setPermission]=useState(null);
  const load=useCallback(()=>{api.get('/social/notification-preferences').then(r=>setPrefs(r.data.preferences)).catch(()=>Alert.alert('Notificaciones','No se pudieron cargar las preferencias.'));getNotificationPermissionStatus().then(setPermission).catch(()=>setPermission('undetermined'));},[]);
  useFocusEffect(useCallback(()=>{load();},[load]));
  const change=async(key,value)=>{const next={...prefs,[key]:value};setPrefs(next);setSaving(true);try{await api.patch('/social/notification-preferences',next);}catch{Alert.alert('Notificaciones','No se pudo guardar el cambio.');load();}finally{setSaving(false);}};
  const enable=async()=>{if(permission==='denied'){Linking.openSettings();return;}const token=await registerForPushNotificationsAsync();setPermission(await getNotificationPermissionStatus());if(token)await api.post('/push/register-token',{pushToken:token,platform:Platform.OS});};
  if(!prefs)return<View style={s.page}><ActivityIndicator color="#ff5a00" style={{marginTop:90}}/></View>;
  const granted=permission==='granted';
  return<View style={s.page}><ScrollView contentContainerStyle={s.content}>
    <ScreenHeader eyebrow="CONTROL DE AVISOS" title="Preferencias" description="Elige qué avisos quieres recibir como notificación push." action={<TouchableOpacity style={s.back} onPress={()=>navigation.goBack()}><Ionicons name="chevron-back" color="#fff" size={21}/></TouchableOpacity>}/>
    <View style={[s.permission,granted&&s.permissionOk]}><Ionicons name={granted?'checkmark-circle':'notifications-off-outline'} color={granted?'#22c55e':'#f59e0b'} size={25}/><View style={{flex:1}}><Text style={s.permissionTitle}>{granted?'Notificaciones activadas':'Notificaciones del dispositivo desactivadas'}</Text><Text style={s.body}>{granted?'Este dispositivo puede recibir tus avisos.':'Actívalas para recibir avisos aunque EasyFutbol esté cerrado.'}</Text></View>{!granted&&<TouchableOpacity style={s.enable} onPress={enable}><Text style={s.enableText}>{permission==='denied'?'Ajustes':'Activar'}</Text></TouchableOpacity>}</View>
    <View style={s.card}>{OPTIONS.map(([key,icon,title,body],index)=><View key={key} style={[s.option,index>0&&s.divider]}><View style={s.icon}><Ionicons name={icon} color="#ff6a1a" size={20}/></View><View style={{flex:1}}><Text style={s.title}>{title}</Text><Text style={s.body}>{body}</Text></View><Switch value={prefs[key]} onValueChange={value=>change(key,value)} trackColor={{false:'#33343a',true:'#9f410d'}} thumbColor={prefs[key]?'#ff5a00':'#8a8b90'}/></View>)}</View>
    <Text style={s.note}>{saving?'Guardando cambios…':'Los avisos seguirán guardándose en tu bandeja aunque desactives su notificación push. Los avisos operativos imprescindibles pueden seguir mostrándose.'}</Text>
  </ScrollView></View>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#0b0b0d'},content:{padding:18,paddingBottom:110},back:{width:42,height:42,borderRadius:14,backgroundColor:'#202024',alignItems:'center',justifyContent:'center'},permission:{flexDirection:'row',alignItems:'center',gap:11,backgroundColor:'#211a10',borderWidth:1,borderColor:'#624615',borderRadius:17,padding:14,marginBottom:12},permissionOk:{backgroundColor:'#102017',borderColor:'#235f3a'},permissionTitle:{color:'#fff',fontSize:12,fontWeight:'900'},enable:{backgroundColor:'#ff5a00',paddingHorizontal:12,paddingVertical:9,borderRadius:10},enableText:{color:'#fff',fontSize:10,fontWeight:'900'},card:{backgroundColor:'#171719',borderRadius:21,borderWidth:1,borderColor:'#29292d',paddingHorizontal:16},option:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:17},divider:{borderTopWidth:1,borderTopColor:'#2a2a2e'},icon:{width:40,height:40,borderRadius:13,backgroundColor:'rgba(255,90,0,.11)',alignItems:'center',justifyContent:'center'},title:{color:'#fff',fontSize:14,fontWeight:'900'},body:{color:'#77777e',fontSize:11,lineHeight:16,marginTop:4},note:{color:'#68686e',fontSize:10,lineHeight:16,margin:12}});
