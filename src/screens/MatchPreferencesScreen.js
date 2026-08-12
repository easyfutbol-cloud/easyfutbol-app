import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';

const DAYS=[['L',0],['M',1],['X',2],['J',3],['V',4],['S',5],['D',6]];
const SLOTS=[['Mañana','morning','06:00–13:00'],['Tarde','afternoon','13:00–19:00'],['Noche','evening','19:00–00:00']];
const POSITIONS=[['Portero','goalkeeper'],['Defensa','defender'],['Centrocampista','midfielder'],['Delantero','forward']];
const fallbackLocations=[{id:1,name:'Valladolid'},{id:2,name:'Asturias'}];
const formatDate=(value)=>new Intl.DateTimeFormat('es-ES',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));

export default function MatchPreferencesScreen({navigation}) {
  const [prefs,setPrefs]=useState({available_days:[],time_slots:[],location_ids:[],positions:[],recommendations_enabled:true});
  const [locations,setLocations]=useState(fallbackLocations);
  const [matches,setMatches]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const loadRecommendations=useCallback(async()=>{try{const r=await api.get('/me/match-recommendations');setMatches(r.data?.data||[]);}catch{setMatches([]);}},[]);
  const load=useCallback(async()=>{setLoading(true);try{const [p,l]=await Promise.all([api.get('/me/match-preferences'),api.get('/easypass/locations').catch(()=>null)]);setPrefs(p.data?.data||prefs);const items=l?.data?.data;if(Array.isArray(items)&&items.length)setLocations(items);}catch(e){Alert.alert('Disponibilidad',e.response?.data?.msg||'No se pudo cargar');}finally{await loadRecommendations();setLoading(false);}},[loadRecommendations]);
  useFocusEffect(useCallback(()=>{load();},[load]));
  const toggle=(key,value)=>setPrefs((current)=>{const values=current[key]||[];return{...current,[key]:values.includes(value)?values.filter((item)=>item!==value):[...values,value]};});
  const save=async()=>{try{setSaving(true);await api.put('/me/match-preferences',prefs);await loadRecommendations();Alert.alert('Preferencias guardadas','A partir de ahora priorizaremos partidos compatibles contigo.');}catch(e){Alert.alert('Disponibilidad',e.response?.data?.msg||'No se pudo guardar');}finally{setSaving(false);}};
  if(loading)return<View style={styles.page}><ActivityIndicator color="#ff5a00" style={{marginTop:80}}/></View>;
  return <View style={styles.page}><ScreenHeader title="Disponibilidad" onBack={()=>navigation.navigate('Profile')}/><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.hero}><View style={styles.heroIcon}><Ionicons name="options" color="#ff6a1a" size={25}/></View><View style={{flex:1}}><Text style={styles.heroTitle}>Partidos a tu medida</Text><Text style={styles.heroText}>Configura cuándo y dónde quieres jugar. No te apuntaremos automáticamente.</Text></View></View>

    <PreferenceCard title="DÍAS DISPONIBLES" subtitle="Puedes seleccionar varios días">
      <View style={styles.days}>{DAYS.map(([label,value])=><Chip key={value} compact label={label} selected={prefs.available_days.includes(value)} onPress={()=>toggle('available_days',value)}/>)}</View>
    </PreferenceCard>
    <PreferenceCard title="HORARIO PREFERIDO" subtitle="Selecciona todas las franjas que te encajen">
      {SLOTS.map(([label,value,hours])=><TouchableOpacity key={value} style={[styles.option,prefs.time_slots.includes(value)&&styles.optionActive]} onPress={()=>toggle('time_slots',value)}><View><Text style={styles.optionTitle}>{label}</Text><Text style={styles.optionMeta}>{hours}</Text></View><Ionicons name={prefs.time_slots.includes(value)?'checkmark-circle':'ellipse-outline'} color={prefs.time_slots.includes(value)?'#ff5a00':'#555'} size={24}/></TouchableOpacity>)}
    </PreferenceCard>
    <PreferenceCard title="SEDES FAVORITAS" subtitle="Solo recomendaremos partidos en estas zonas">
      <View style={styles.wrap}>{locations.map((location)=><Chip key={location.id} label={location.name} icon="location-outline" selected={prefs.location_ids.includes(Number(location.id))} onPress={()=>toggle('location_ids',Number(location.id))}/>)}</View>
    </PreferenceCard>
    <PreferenceCard title="POSICIONES" subtitle="Servirá para personalizar futuras convocatorias">
      <View style={styles.wrap}>{POSITIONS.map(([label,value])=><Chip key={value} label={label} selected={prefs.positions.includes(value)} onPress={()=>toggle('positions',value)}/>)}</View>
    </PreferenceCard>

    <View style={styles.switchCard}><View style={{flex:1}}><Text style={styles.switchTitle}>Recomendaciones activas</Text><Text style={styles.switchText}>Muestra partidos que coinciden con tus preferencias.</Text></View><Switch value={prefs.recommendations_enabled} onValueChange={(value)=>setPrefs((current)=>({...current,recommendations_enabled:value}))} trackColor={{false:'#333',true:'#8a350d'}} thumbColor={prefs.recommendations_enabled?'#ff5a00':'#777'}/></View>
    <TouchableOpacity style={[styles.save,saving&&{opacity:.5}]} disabled={saving} onPress={save}><Text style={styles.saveText}>{saving?'Guardando…':'Guardar disponibilidad'}</Text></TouchableOpacity>

    <View style={styles.recommendHeader}><View><Text style={styles.sectionEyebrow}>PARA TI</Text><Text style={styles.sectionTitle}>Partidos recomendados</Text></View><Ionicons name="sparkles" color="#ff6a1a" size={21}/></View>
    {!matches.length&&<View style={styles.empty}><Ionicons name="calendar-outline" color="#555" size={28}/><Text style={styles.emptyTitle}>Sin coincidencias por ahora</Text><Text style={styles.emptyText}>Prueba a seleccionar más días, franjas o sedes.</Text></View>}
    {matches.map((match)=><TouchableOpacity key={match.id} style={styles.match} onPress={()=>navigation.navigate('Match',{matchId:match.id})}><View style={styles.score}><Text style={styles.scoreValue}>{match.score}</Text><Text style={styles.scoreLabel}>MATCH</Text></View><View style={{flex:1}}><Text style={styles.matchTitle}>{match.title}</Text><Text style={styles.matchMeta}>{formatDate(match.starts_at)} · {match.location_name}</Text><Text style={styles.reasons}>{match.reasons.join(' · ')}</Text></View><Ionicons name="chevron-forward" color="#666" size={20}/></TouchableOpacity>)}
  </ScrollView></View>;
}

function PreferenceCard({title,subtitle,children}){return<View style={styles.card}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardSubtitle}>{subtitle}</Text><View style={{marginTop:14}}>{children}</View></View>}
function Chip({label,selected,onPress,icon,compact}){return<TouchableOpacity onPress={onPress} style={[styles.chip,compact&&styles.dayChip,selected&&styles.chipActive]}>{icon&&<Ionicons name={icon} color={selected?'#ff6a1a':'#777'} size={15}/>}<Text style={[styles.chipText,selected&&styles.chipTextActive]}>{label}</Text></TouchableOpacity>}

const styles=StyleSheet.create({
  page:{flex:1,backgroundColor:'#0b0b0d'},content:{padding:17,paddingBottom:110},hero:{flexDirection:'row',alignItems:'center',gap:13,backgroundColor:'#1b1715',borderColor:'#3d291f',borderWidth:1,borderRadius:22,padding:18,marginBottom:13},heroIcon:{width:49,height:49,borderRadius:16,backgroundColor:'#2c211b',alignItems:'center',justifyContent:'center'},heroTitle:{color:'#fff',fontSize:19,fontWeight:'900'},heroText:{color:'#898990',fontSize:12,lineHeight:18,marginTop:4},
  card:{backgroundColor:'#171719',borderWidth:1,borderColor:'#29292d',borderRadius:20,padding:18,marginBottom:12},cardTitle:{color:'#ff6a1a',fontSize:10,fontWeight:'900',letterSpacing:1.25},cardSubtitle:{color:'#77777d',fontSize:11,marginTop:5},days:{flexDirection:'row',justifyContent:'space-between'},wrap:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{minHeight:40,borderRadius:13,backgroundColor:'#242428',borderWidth:1,borderColor:'#303035',paddingHorizontal:14,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6},dayChip:{width:39,paddingHorizontal:0},chipActive:{backgroundColor:'#2e211b',borderColor:'#9c451b'},chipText:{color:'#85858b',fontWeight:'800',fontSize:12},chipTextActive:{color:'#fff'},
  option:{minHeight:55,borderRadius:14,backgroundColor:'#222225',paddingHorizontal:14,marginBottom:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderWidth:1,borderColor:'transparent'},optionActive:{borderColor:'#7f3c1d',backgroundColor:'#29201c'},optionTitle:{color:'#fff',fontWeight:'800'},optionMeta:{color:'#707077',fontSize:10,marginTop:3},switchCard:{backgroundColor:'#171719',borderRadius:19,padding:17,flexDirection:'row',alignItems:'center',marginTop:2},switchTitle:{color:'#fff',fontWeight:'900'},switchText:{color:'#73737a',fontSize:11,marginTop:4},save:{backgroundColor:'#ff5a00',padding:16,borderRadius:16,alignItems:'center',marginTop:12},saveText:{color:'#fff',fontWeight:'900'},
  recommendHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:30,marginBottom:12,paddingHorizontal:2},sectionEyebrow:{color:'#ff6a1a',fontSize:9,fontWeight:'900',letterSpacing:1.2},sectionTitle:{color:'#fff',fontSize:21,fontWeight:'900',marginTop:3},empty:{backgroundColor:'#171719',borderRadius:20,padding:26,alignItems:'center'},emptyTitle:{color:'#fff',fontWeight:'800',marginTop:9},emptyText:{color:'#777',fontSize:12,marginTop:5},match:{backgroundColor:'#171719',borderRadius:18,padding:14,marginBottom:9,flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderColor:'#29292d'},score:{width:49,height:49,borderRadius:15,backgroundColor:'#2c211b',alignItems:'center',justifyContent:'center'},scoreValue:{color:'#ff6a1a',fontSize:17,fontWeight:'900'},scoreLabel:{color:'#7e685e',fontSize:7,fontWeight:'900'},matchTitle:{color:'#fff',fontWeight:'900',fontSize:14},matchMeta:{color:'#828288',fontSize:10,marginTop:4,textTransform:'capitalize'},reasons:{color:'#b66a43',fontSize:9,marginTop:5},
});
