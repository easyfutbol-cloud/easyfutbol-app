import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import SegmentedControl from '../components/SegmentedControl';
import { api } from '../api/client';
import { colors, layout, radii, shadows, spacing, typography } from '../theme';
import { goBackOrFallback } from '../utils/navigation';

const TARGET_OPTIONS = [
  { value: 'city', label: 'Por ciudad' },
  { value: 'match', label: 'Por partido' },
  { value: 'segment', label: 'Segmento' },
];
const DELIVERY_OPTIONS=[{value:'now',label:'Ahora'},{value:'scheduled',label:'Programar'},{value:'draft',label:'Borrador'}];
const pad=value=>String(value).padStart(2,'0');

function formatMatch(match) {
  const date = new Date(match.starts_at);
  const dateLabel = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `${match.title || `Partido #${match.id}`} · ${match.city || ''}${dateLabel ? ` · ${dateLabel}` : ''}`;
}

export default function AdminNotifyScreen({ route, navigation }) {
  const initialMatchId = route?.params?.matchId ? String(route.params.matchId) : '';
  const [targetType, setTargetType] = useState(initialMatchId ? 'match' : 'city');
  const [locations, setLocations] = useState([]);
  const [matches, setMatches] = useState([]);
  const [locationSlug, setLocationSlug] = useState('');
  const [matchId, setMatchId] = useState(initialMatchId);
  const [segments,setSegments]=useState([]);
  const [segmentId,setSegmentId]=useState('');
  const [audience,setAudience]=useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [diagnostics, setDiagnostics] = useState(null);
  const [history, setHistory] = useState([]);
  const [templates,setTemplates]=useState([]);
  const [deliveryMode,setDeliveryMode]=useState('now');
  const [scheduledDate,setScheduledDate]=useState(new Date(Date.now()+60*60*1000));
  const [editingId,setEditingId]=useState(null);

  useEffect(() => {
    let active = true;
    api.get('/admin/notify/options')
      .then(({ data }) => {
        if (!active) return;
        const nextLocations = data?.data?.locations || [];
        const nextMatches = data?.data?.matches || [];
        setLocations(nextLocations);
        setMatches(nextMatches);
        setDiagnostics(data?.data?.diagnostics || null);
        setTemplates(data?.data?.templates||[]);
        const nextSegments=data?.data?.segments||[];setSegments(nextSegments);if(nextSegments[0]?.id)setSegmentId(nextSegments[0].id);
        if (!locationSlug && nextLocations[0]?.slug) setLocationSlug(String(nextLocations[0].slug));
      })
      .catch((requestError) => active && setError(requestError?.response?.data?.msg || 'No se pudieron cargar los destinatarios.'))
      .finally(() => active && setLoadingOptions(false));
    return () => { active = false; };
  }, []);

  const loadHistory=()=>api.get('/admin/notify/history').then(({data})=>setHistory(data?.items||[])).catch(()=>{});
  useEffect(()=>{loadHistory();},[]);
  useEffect(()=>{if(targetType!=='segment'||!segmentId){setAudience(null);return;}let active=true;setAudience(null);api.get(`/admin/notify/segments/${segmentId}/preview`).then(({data})=>active&&setAudience(data?.audience||null)).catch(()=>active&&setAudience(null));return()=>{active=false;};},[targetType,segmentId]);

  const selectedLocation = useMemo(() => locations.find((location) => String(location.slug) === locationSlug), [locations, locationSlug]);
  const selectedMatch = useMemo(() => matches.find((match) => String(match.id) === matchId), [matches, matchId]);
  const selectedSegment=useMemo(()=>segments.find(segment=>segment.id===segmentId),[segments,segmentId]);
  const targetName = targetType === 'city' ? selectedLocation?.name : targetType==='match'?selectedMatch?.title:selectedSegment?.name;
  const hasTarget = targetType === 'city' ? Boolean(locationSlug) : targetType==='match'?Boolean(matchId):Boolean(segmentId);
  const canSend = hasTarget && title.trim() && body.trim() && !loading;

  const send = () => {
    if (!canSend) {
      Alert.alert('Faltan datos', 'Selecciona los destinatarios y completa el título y el mensaje.');
      return;
    }

    const targetDescription = targetType === 'city'
      ? `todos los jugadores de ${selectedLocation?.name || locationSlug}`
      : targetType==='match'?`los jugadores inscritos en “${selectedMatch?.title || `Partido #${matchId}`}”`:`${audience?.users||0} jugadores del segmento “${selectedSegment?.name}”`;

    const actionLabel=editingId?'Guardar cambios':deliveryMode==='now'?'Enviar ahora':deliveryMode==='scheduled'?'Programar':'Guardar borrador';
    Alert.alert(
      actionLabel,
      deliveryMode==='now'?`Vas a enviar esta notificación a ${targetDescription}.`:`La campaña quedará ${deliveryMode==='scheduled'?'programada en horario de Madrid':'guardada para continuar después'}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: actionLabel,
          onPress: async () => {
            setLoading(true);
            try {
              let endpoint,payload;
              if(editingId){
                endpoint=`/admin/notify/campaigns/${editingId}`;
                payload={title:title.trim(),body:body.trim(),mode:deliveryMode};
                if(deliveryMode==='scheduled'){payload.schedule_date=`${scheduledDate.getFullYear()}-${pad(scheduledDate.getMonth()+1)}-${pad(scheduledDate.getDate())}`;payload.schedule_time=`${pad(scheduledDate.getHours())}:${pad(scheduledDate.getMinutes())}`;}
              }else if(deliveryMode==='now'){
                endpoint=targetType==='city'?`/admin/notify/city/${encodeURIComponent(locationSlug)}`:targetType==='match'?`/admin/notify/match/${matchId}`:`/admin/notify/segment/${segmentId}`;
                payload={title:title.trim(),body:body.trim()};
              }else{
                endpoint='/admin/notify/campaigns';
                payload={target_type:targetType,target_id:targetType==='city'?locationSlug:targetType==='match'?matchId:segmentId,title:title.trim(),body:body.trim(),mode:deliveryMode};
                if(deliveryMode==='scheduled'){payload.schedule_date=`${scheduledDate.getFullYear()}-${pad(scheduledDate.getMonth()+1)}-${pad(scheduledDate.getDate())}`;payload.schedule_time=`${pad(scheduledDate.getHours())}:${pad(scheduledDate.getMinutes())}`;}
              }
              const { data } = editingId?await api.patch(endpoint,payload):await api.post(endpoint,payload);
              if (!data?.ok) throw new Error(data?.msg || 'No se pudo enviar');
              Alert.alert(
                editingId?'Campaña actualizada':deliveryMode==='now'?'Notificación enviada':deliveryMode==='scheduled'?'Campaña programada':'Borrador guardado',
                editingId||deliveryMode!=='now'?'Puedes gestionarla desde el historial.':data.sent > 0
                  ? `Se ha enviado a ${data.sent} dispositivo${data.sent === 1 ? '' : 's'}.`
                  : 'No se encontraron dispositivos con notificaciones activas para este grupo.'
              );
              setTitle('');
              setBody('');
              setEditingId(null);
              loadHistory();
            } catch (requestError) {
              Alert.alert('No se pudo enviar', requestError?.response?.data?.msg || requestError.message || 'Inténtalo de nuevo.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={['#261307', '#11151B']} style={styles.hero}>
          <TouchableOpacity style={styles.backButton} onPress={() => goBackOrFallback(navigation, 'AdminPanel')}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
            <Text style={styles.backText}>Volver</Text>
          </TouchableOpacity>
          <View style={styles.heroIcon}><Ionicons name="notifications" size={25} color={colors.orange} /></View>
          <Text style={styles.eyebrow}>CENTRO DE COMUNICACIONES</Text>
          <Text style={styles.title}>Enviar notificación</Text>
          <Text style={styles.description}>Comunica cambios y avisos importantes a los jugadores adecuados.</Text>
        </LinearGradient>

        {diagnostics ? <View style={styles.healthCard}><View style={styles.healthTop}><Ionicons name="pulse" size={18} color={colors.success}/><Text style={styles.healthTitle}>Entregas · últimas 24 h</Text></View><View style={styles.metrics}><Metric label="DISPOSITIVOS" value={diagnostics.active_tokens}/><Metric label="ENTREGADAS" value={diagnostics.delivered_24h}/><Metric label="PENDIENTES" value={diagnostics.pending_24h}/><Metric label="ERRORES" value={diagnostics.errors_24h} danger={Number(diagnostics.errors_24h)>0}/></View></View> : null}

        <View style={styles.card}>
          <View style={styles.stepHeading}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
            <View style={styles.stepCopy}>
              <Text style={styles.cardTitle}>Destinatarios</Text>
              <Text style={styles.help}>Selecciona el grupo que recibirá el aviso.</Text>
            </View>
          </View>
          <SegmentedControl options={TARGET_OPTIONS} value={targetType} onChange={setTargetType} accessibilityLabel="Tipo de destinatarios" />

          {loadingOptions ? <ActivityIndicator color={colors.orange} /> : (
            <View style={styles.pickerWrap}>
              {targetType === 'city' ? (
                <Picker selectedValue={locationSlug} onValueChange={setLocationSlug} dropdownIconColor={colors.white} style={styles.picker}>
                  <Picker.Item label="Selecciona una ciudad" value="" />
                  {locations.map((location) => <Picker.Item key={location.id} label={location.name} value={String(location.slug)} />)}
                </Picker>
              ) : targetType==='match'?(
                <Picker selectedValue={matchId} onValueChange={setMatchId} dropdownIconColor={colors.white} style={styles.picker}>
                  <Picker.Item label="Selecciona un partido" value="" />
                  {matches.map((match) => <Picker.Item key={match.id} label={formatMatch(match)} value={String(match.id)} />)}
                </Picker>
              ):(<Picker selectedValue={segmentId} onValueChange={setSegmentId} dropdownIconColor={colors.white} style={styles.picker}>{segments.map(segment=><Picker.Item key={segment.id} label={`${segment.name} · ${segment.description}`} value={segment.id}/>)}</Picker>)}
            </View>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {hasTarget ? (
            <View style={styles.targetSummary}>
              <Ionicons name={targetType === 'city' ? 'location' : targetType==='match'?'football':'filter'} size={18} color={colors.orange} />
              <View style={styles.targetCopy}>
                <Text style={styles.targetLabel}>{targetType === 'city' ? 'Todos los jugadores de' : targetType==='match'?'Jugadores inscritos en':'Segmentación dinámica'}</Text>
                <Text style={styles.targetValue}>{targetName || (targetType === 'match' ? `Partido #${matchId}` : locationSlug)}</Text>
                {targetType==='segment'?<Text style={styles.audience}>{audience?`${audience.users} jugadores · ${audience.devices} dispositivos disponibles`:'Calculando alcance…'}</Text>:null}
              </View>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.stepHeading}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
            <View style={styles.stepCopy}>
              <Text style={styles.cardTitle}>Mensaje</Text>
              <Text style={styles.help}>Sé breve y coloca lo más importante al principio.</Text>
            </View>
          </View>
          <Text style={styles.label}>Título</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            maxLength={65}
            placeholder="Ej. Cambio de campo"
            placeholderTextColor={colors.textSubtle}
          />
          <Text style={styles.counter}>{title.length}/65</Text>

          <Text style={styles.label}>Mensaje</Text>
          <TextInput
            style={[styles.input, styles.messageInput]}
            multiline
            value={body}
            onChangeText={setBody}
            maxLength={220}
            placeholder="Escribe aquí el aviso para los jugadores…"
            placeholderTextColor={colors.textSubtle}
            textAlignVertical="top"
          />
          <Text style={styles.counter}>{body.length}/220</Text>
          <Text style={styles.label}>Plantillas rápidas</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templates}>{templates.map(template=><TouchableOpacity key={template.id} style={styles.template} onPress={()=>{setTitle(template.title);setBody(template.body);}}><Ionicons name="flash-outline" color={colors.orange} size={14}/><Text style={styles.templateText}>{template.label}</Text></TouchableOpacity>)}</ScrollView>
        </View>

        <View style={styles.card}><View style={styles.stepHeading}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View><View style={styles.stepCopy}><Text style={styles.cardTitle}>Cuándo enviarla</Text><Text style={styles.help}>Hora peninsular de Madrid, con cambio de verano automático.</Text></View></View><SegmentedControl options={DELIVERY_OPTIONS} value={deliveryMode} onChange={setDeliveryMode} accessibilityLabel="Momento del envío"/>{deliveryMode==='scheduled'?<View style={styles.datePicker}><DateTimePicker value={scheduledDate} mode="datetime" minimumDate={new Date(Date.now()+5*60*1000)} onChange={(_event,value)=>value&&setScheduledDate(value)} themeVariant="dark"/><Text style={styles.scheduleSummary}>Se enviará el {scheduledDate.toLocaleString('es-ES',{dateStyle:'medium',timeStyle:'short'})}</Text></View>:null}</View>

        <View style={styles.card}>
          <View style={styles.stepHeading}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>4</Text></View>
            <View style={styles.stepCopy}>
              <Text style={styles.cardTitle}>Vista previa</Text>
              <Text style={styles.help}>Así aparecerá aproximadamente en el móvil.</Text>
            </View>
          </View>
          <View style={styles.notificationPreview}>
            <View style={styles.appIcon}><Ionicons name="football" size={22} color={colors.white} /></View>
            <View style={styles.previewCopy}>
              <View style={styles.previewTopline}><Text style={styles.appName}>EASYFUTBOL</Text><Text style={styles.now}>ahora</Text></View>
              <Text style={styles.previewTitle}>{title.trim() || 'Título de la notificación'}</Text>
              <Text style={styles.previewBody}>{body.trim() || 'El mensaje aparecerá aquí cuando empieces a escribirlo.'}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={[styles.sendButton, !canSend && styles.disabledButton]} onPress={send} disabled={!canSend}>
          {loading ? <ActivityIndicator color={colors.white} /> : <><Ionicons name={editingId?'create-outline':deliveryMode==='draft'?'save-outline':deliveryMode==='scheduled'?'time-outline':'send'} size={20} color={colors.white} /><Text style={styles.sendText}>{editingId?'Guardar cambios':deliveryMode==='draft'?'Guardar borrador':deliveryMode==='scheduled'?'Programar notificación':'Enviar notificación'}</Text></>}
        </TouchableOpacity>
        <Text style={styles.safety}>Se solicitará confirmación antes del envío. Las notificaciones no se pueden retirar.</Text>

        <View style={styles.historyHeader}><Text style={styles.historyTitle}>Historial de envíos</Text><Text style={styles.historyHelp}>Últimas campañas y estado real de entrega</Text></View>
        {!history.length?<View style={styles.emptyHistory}><Text style={styles.help}>Todavía no hay campañas registradas.</Text></View>:history.map(campaign=><View key={campaign.id} style={styles.historyCard}><View style={styles.historyTop}><View style={styles.historyIcon}><Ionicons name={campaign.target_type==='match'?'football':'location'} color={colors.orange} size={17}/></View><View style={{flex:1}}><Text style={styles.historyItemTitle}>{campaign.title}</Text><Text style={styles.historyTarget}>{campaign.target_name} · {new Date(campaign.scheduled_at||campaign.sent_at||campaign.created_at).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</Text></View><View style={[styles.statusBadge,campaign.status==='sent'&&styles.statusSent]}><Text style={styles.statusText}>{({draft:'BORRADOR',scheduled:'PROGRAMADA',sending:'ENVIANDO',sent:'ENVIADA',cancelled:'CANCELADA',failed:'ERROR'})[campaign.status]||campaign.status}</Text></View></View><Text style={styles.historyBody} numberOfLines={2}>{campaign.body}</Text>{['draft','scheduled'].includes(campaign.status)?<View style={styles.pendingActions}><TouchableOpacity onPress={()=>{setEditingId(campaign.id);setTitle(campaign.title);setBody(campaign.body);setDeliveryMode(campaign.status);if(campaign.scheduled_at)setScheduledDate(new Date(campaign.scheduled_at));}} style={styles.smallAction}><Text style={styles.smallActionText}>Editar</Text></TouchableOpacity><TouchableOpacity onPress={()=>api.post(`/admin/notify/campaigns/${campaign.id}/send`).then(loadHistory).catch(e=>Alert.alert('Campaña',e?.response?.data?.msg||'No se pudo enviar'))} style={styles.smallAction}><Text style={styles.smallActionText}>Enviar</Text></TouchableOpacity><TouchableOpacity onPress={()=>Alert.alert('Cancelar campaña','¿Seguro que quieres cancelarla?',[{text:'No',style:'cancel'},{text:'Cancelar',style:'destructive',onPress:()=>api.delete(`/admin/notify/campaigns/${campaign.id}`).then(loadHistory)}])} style={styles.smallAction}><Text style={styles.smallActionText}>Cancelar</Text></TouchableOpacity></View>:<View style={styles.deliveryRow}><Delivery label="ACEPTADAS" value={campaign.accepted_count}/><Delivery label="ENTREGADAS" value={campaign.delivered_count} good/><Delivery label="PENDIENTES" value={campaign.pending_count}/><Delivery label="ERRORES" value={campaign.error_count} danger={campaign.error_count>0}/></View>}{campaign.created_by_name?<Text style={styles.author}>Creada por {campaign.created_by_name}</Text>:null}</View>)}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Metric({label,value,danger}){return <View style={styles.metric}><Text style={[styles.metricValue,danger&&{color:colors.danger}]}>{Number(value)||0}</Text><Text style={styles.metricLabel}>{label}</Text></View>}
function Delivery({label,value,good,danger}){return<View style={styles.delivery}><Text style={[styles.deliveryValue,good&&{color:colors.success},danger&&{color:colors.danger}]}>{Number(value)||0}</Text><Text style={styles.deliveryLabel}>{label}</Text></View>}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', padding: layout.screenPadding, paddingBottom: spacing(6) },
  hero: { borderRadius: radii.large, borderWidth: 1, borderColor: 'rgba(255,90,0,0.28)', padding: spacing(2), marginBottom: spacing(2), ...shadows.card },
  backButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing(0.75), alignSelf: 'flex-start' },
  backText: { color: colors.white, ...typography.bodyStrong },
  heroIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,90,0,0.14)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.35)', marginTop: spacing(1) },
  eyebrow: { color: colors.orange, ...typography.overline, marginTop: spacing(1.5) },
  title: { color: colors.white, ...typography.display, marginTop: spacing(0.75) },
  description: { color: colors.textMuted, ...typography.body, marginTop: spacing(0.75) },
  healthCard:{backgroundColor:colors.surface,borderRadius:radii.large,borderWidth:1,borderColor:colors.border,padding:spacing(1.5),marginBottom:spacing(2)},
  healthTop:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:12},healthTitle:{color:colors.white,...typography.bodyStrong},metrics:{flexDirection:'row'},metric:{flex:1,alignItems:'center'},metricValue:{color:colors.white,fontSize:18,fontWeight:'900'},metricLabel:{color:colors.textSubtle,fontSize:8,fontWeight:'800',marginTop:3},
  card: { backgroundColor: colors.surface, borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, padding: spacing(2), marginBottom: spacing(2), ...shadows.card },
  stepHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), marginBottom: spacing(1.5) },
  stepNumber: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.orange },
  stepNumberText: { color: colors.white, fontWeight: '900' },
  stepCopy: { flex: 1 },
  cardTitle: { color: colors.white, ...typography.heading },
  help: { color: colors.textSubtle, ...typography.caption, marginTop: 2 },
  pickerWrap: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, overflow: 'hidden' },
  picker: { color: colors.white },
  targetSummary: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: 'rgba(255,90,0,0.08)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.24)', borderRadius: radii.medium, padding: spacing(1.25), marginTop: spacing(1.25) },
  targetCopy: { flex: 1 },
  targetLabel: { color: colors.textSubtle, ...typography.caption },
  targetValue: { color: colors.white, ...typography.bodyStrong, marginTop: 2 },
  audience:{color:colors.orange,fontSize:10,fontWeight:'800',marginTop:5},
  error: { color: colors.danger, ...typography.caption, marginTop: spacing(1) },
  label: { color: colors.textMuted, ...typography.caption, marginBottom: spacing(0.75), marginTop: spacing(0.5) },
  input: { minHeight: 52, backgroundColor: '#090B0F', borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, color: colors.white, paddingHorizontal: spacing(1.5), ...typography.body },
  messageInput: { minHeight: 124, paddingTop: spacing(1.5) },
  counter: { color: colors.textSubtle, ...typography.caption, textAlign: 'right', marginTop: spacing(0.5), marginBottom: spacing(1) },
  templates:{gap:8,paddingVertical:5},template:{flexDirection:'row',alignItems:'center',gap:5,borderWidth:1,borderColor:colors.border,borderRadius:12,paddingHorizontal:10,paddingVertical:9,backgroundColor:colors.surfaceElevated},templateText:{color:colors.textMuted,fontSize:10,fontWeight:'800'},datePicker:{alignItems:'center',marginTop:14},scheduleSummary:{color:colors.orange,...typography.caption,marginTop:8},
  notificationPreview: { flexDirection: 'row', gap: spacing(1.25), backgroundColor: '#22262D', borderRadius: radii.large, padding: spacing(1.5), borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' },
  appIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.orange },
  previewCopy: { flex: 1 },
  previewTopline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appName: { color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  now: { color: colors.textSubtle, fontSize: 11 },
  previewTitle: { color: colors.white, ...typography.bodyStrong, marginTop: 3 },
  previewBody: { color: colors.textMuted, ...typography.caption, marginTop: 2 },
  sendButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1), backgroundColor: colors.orange, borderRadius: radii.medium },
  disabledButton: { opacity: 0.4 },
  sendText: { color: colors.white, ...typography.bodyStrong },
  safety: { color: colors.textSubtle, ...typography.caption, textAlign: 'center', marginTop: spacing(1) },
  historyHeader:{marginTop:spacing(3),marginBottom:spacing(1.25)},historyTitle:{color:colors.white,...typography.heading},historyHelp:{color:colors.textSubtle,...typography.caption,marginTop:3},emptyHistory:{padding:spacing(2),borderRadius:radii.medium,backgroundColor:colors.surface,alignItems:'center'},historyCard:{backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,borderRadius:radii.large,padding:spacing(1.5),marginBottom:spacing(1.25)},historyTop:{flexDirection:'row',alignItems:'center',gap:10},historyIcon:{width:35,height:35,borderRadius:11,backgroundColor:'rgba(255,90,0,.12)',alignItems:'center',justifyContent:'center'},historyItemTitle:{color:colors.white,...typography.bodyStrong},historyTarget:{color:colors.textSubtle,fontSize:10,marginTop:3},historyBody:{color:colors.textMuted,...typography.caption,lineHeight:17,marginTop:10},deliveryRow:{flexDirection:'row',borderTopWidth:1,borderTopColor:colors.border,marginTop:12,paddingTop:11},delivery:{flex:1,alignItems:'center'},deliveryValue:{color:colors.white,fontSize:15,fontWeight:'900'},deliveryLabel:{color:colors.textSubtle,fontSize:7,fontWeight:'900',marginTop:3},author:{color:colors.textSubtle,fontSize:9,textAlign:'right',marginTop:10},
  statusBadge:{backgroundColor:'#3a2a12',borderRadius:8,paddingHorizontal:7,paddingVertical:5},statusSent:{backgroundColor:'#153722'},statusText:{color:colors.white,fontSize:7,fontWeight:'900'},pendingActions:{flexDirection:'row',gap:8,marginTop:12},smallAction:{flex:1,borderWidth:1,borderColor:colors.border,borderRadius:10,padding:10,alignItems:'center'},smallActionText:{color:colors.orange,fontSize:9,fontWeight:'900'},
});
