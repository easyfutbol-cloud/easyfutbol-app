import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Linking, Image, ImageBackground, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import { colors, layout, radii, spacing, typography } from '../theme';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import easypassLogo from '../../assets/easypass-logo.png';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenHeader from '../components/ScreenHeader';
import { Ionicons } from '@expo/vector-icons';

const ORANGE = '#ff5a00';
const SCREEN_BACKGROUND = require('../../assets/matches/match-3.jpg');

const formatEuro = (cents) => `${(Number(cents || 0) / 100).toFixed(2)}€`;

function ScreenBackdrop({ children }) {
  return (
    <ImageBackground source={SCREEN_BACKGROUND} style={styles.screen} imageStyle={styles.screenImage}>
      <LinearGradient colors={['rgba(8,10,14,0.82)', 'rgba(8,10,14,0.99)']} style={StyleSheet.absoluteFill} />
      {children}
    </ImageBackground>
  );
}

export default function EasyPassScreen() {
  const [packs, setPacks] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(1);
  const [easyPassBalance, setEasyPassBalance] = useState(0);
  const [balances, setBalances] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buyingPackId, setBuyingPackId] = useState(null);
  const [giftOpen,setGiftOpen]=useState(false);
  const [giftFriends,setGiftFriends]=useState([]);
  const [giftRecipient,setGiftRecipient]=useState(null);
  const [giftAmount,setGiftAmount]=useState(1);
  const [gifting,setGifting]=useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigation = useNavigation();
  const route = useRoute();
  const previousBalanceRef = useRef(null);
  const purchaseInProgressRef = useRef(false);

  const selectedLocation = locations.find((item) => Number(item.id) === Number(selectedLocationId));
  const selectedLocationName = selectedLocation?.name || 'Valladolid';
  const selectedBalance = Number(balances.find((item) => Number(item.locationId ?? item.location_id) === Number(selectedLocationId))?.balance || 0);

  const displayPacks = packs.map((pack) => ({
    ...pack,
    displayAmount: Number(pack?.easyPassAmount ?? pack?.credits ?? 0),
    displayName: `${Number(pack?.easyPassAmount ?? pack?.credits ?? 0)} EasyPass`,
    displayPriceCents: Number(pack?.price_cents || pack?.priceCents || 0),
    displayOriginalPriceCents: Number(pack?.original_price_cents || pack?.price_cents || pack?.priceCents || 0),
  }));

  const BASE = (api?.defaults?.baseURL || '').replace(/\/+$/, '');

  const getStoredToken = async () => {
    const raw = await AsyncStorage.getItem('token');
    let token = raw;
    try {
      const parsed = JSON.parse(raw || 'null');
      token = parsed?.access_token || parsed?.token || raw;
    } catch {}
    return token || null;
  };

  const getAuthHeader = async () => {
    const token = await getStoredToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const load = useCallback(async (showError = true) => {
    setLoading(true);
    try {
      const token = await getStoredToken();

      if (!token) {
        setIsAuthenticated(false);
        setEasyPassBalance(0);
        setPacks([]);
        setLocations([]);
        previousBalanceRef.current = null;
        purchaseInProgressRef.current = false;
        return;
      }

      setIsAuthenticated(true);
      const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };

      // créditos
      const r1 = await fetch(`${BASE}/me/credits`, { method: 'GET', headers });
      const j1 = await r1.json().catch(() => ({}));
      const nextBalance = Number(j1?.easyPassBalance ?? j1?.credits ?? 0) || 0;
      const previousBalance = previousBalanceRef.current;
      setEasyPassBalance(nextBalance);
      const nextBalances=j1?.easyPassBalances||j1?.easypass_balances||[];
      setBalances(Array.isArray(nextBalances)?nextBalances:[]);

      if (
        purchaseInProgressRef.current &&
        previousBalance !== null &&
        nextBalance > previousBalance
      ) {
        purchaseInProgressRef.current = false;
        Alert.alert(
          'Compra completada',
          `Ya tienes ${nextBalance} EasyPass disponibles.`,
          [
            {
              text: 'Seguir aquí',
              style: 'cancel',
            },
            {
              text: 'Ir a reservar partido',
              onPress: () => {
                const returnTo = route?.params?.returnTo;
                const matchId = route?.params?.matchId;

                if (returnTo === 'Match' && matchId) {
                  navigation.navigate('Match', { matchId });
                }
              },
            },
          ]
        );
      }

      previousBalanceRef.current = nextBalance;

      // sedes
      const rLocations = await fetch(`${BASE}/easypass/locations`, { method: 'GET', headers });
      const jLocations = await rLocations.json().catch(() => ({}));
      const nextLocations = Array.isArray(jLocations?.data) ? jLocations.data : [];
      setLocations(nextLocations);

      const validSelectedLocation = nextLocations.some((item) => Number(item.id) === Number(selectedLocationId));
      const locationIdToUse = validSelectedLocation ? selectedLocationId : Number(nextLocations?.[0]?.id || 1);

      if (!validSelectedLocation && Number(locationIdToUse) !== Number(selectedLocationId)) {
        setSelectedLocationId(locationIdToUse);
      }

      // packs por sede
      const r2 = await fetch(`${BASE}/easypass/packs?location_id=${locationIdToUse}`, { method: 'GET', headers });
      const j2 = await r2.json().catch(() => ({}));
      setPacks(Array.isArray(j2?.data) ? j2.data : []);

      const rHistory=await fetch(`${BASE}/me/credits/history`,{method:'GET',headers});
      const jHistory=await rHistory.json().catch(()=>({}));
      setHistory(Array.isArray(jHistory?.data)?jHistory.data:[]);
    } catch (e) {
      if (showError) {
        Alert.alert('Error', e?.message || 'No se pudo cargar EasyPass');
      }
    } finally {
      setLoading(false);
    }
  }, [BASE, selectedLocationId]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(false); }, [load]));

  const buyPack = async (pack) => {
    try {
      setBuyingPackId(pack.id);
      purchaseInProgressRef.current = true;
      const headers = { Accept: 'application/json', ...(await getAuthHeader()) };
      const r = await fetch(`${BASE}/easypass/packs/${pack.id}/checkout`, { method: 'POST', headers });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.checkout_url) throw new Error(j?.msg || 'No se pudo crear el pago');
      await Linking.openURL(j.checkout_url);
      Alert.alert(
        'Pago iniciado',
        'Cuando termines el pago y vuelvas a la app, actualizaremos tu saldo de EasyPass automáticamente.'
      );
    } catch (e) {
      purchaseInProgressRef.current = false;
      Alert.alert('Error', e?.message || 'No se pudo iniciar el pago');
    } finally {
      setBuyingPackId(null);
    }
  };

  const openGift=async()=>{
    if(selectedBalance<1)return Alert.alert('Sin saldo','No tienes EasyPass disponibles en esta ciudad para regalar.');
    try {
      const response=await api.get('/social/friends',{params:{limit:50}});
      const friends=response.data?.items||[];
      if(!friends.length)return Alert.alert('Añade amigos','Necesitas tener una amistad aceptada para regalar EasyPass.');
      setGiftFriends(friends);setGiftRecipient(friends[0]);setGiftAmount(1);setGiftOpen(true);
    } catch(error){Alert.alert('Regalar EasyPass',error.response?.data?.msg||'No se pudieron cargar tus amigos');}
  };

  const sendGift=async()=>{
    if(!giftRecipient)return;
    if(giftAmount>selectedBalance)return Alert.alert('Saldo insuficiente',`Solo tienes ${selectedBalance} EasyPass en ${selectedLocationName}.`);
    Alert.alert('Confirmar regalo',`Vas a regalar ${giftAmount} EasyPass de ${selectedLocationName} a ${giftRecipient.name}. Esta acción no se puede deshacer.`,[
      {text:'Cancelar',style:'cancel'},
      {text:'Regalar',onPress:async()=>{
        try{setGifting(true);const requestKey=`gift-${Date.now()}-${Math.random().toString(36).slice(2)}`;const response=await api.post('/easypass/me/credits/gift',{recipient_id:giftRecipient.id,location_id:selectedLocationId,amount:giftAmount,request_key:requestKey});setGiftOpen(false);await load(false);Alert.alert('Regalo enviado',response.data?.msg||`${giftRecipient.name} ya tiene sus EasyPass.`);}
        catch(error){Alert.alert('No se pudo enviar',error.response?.data?.msg||'Inténtalo de nuevo');}
        finally{setGifting(false);}
      }}
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={ORANGE} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <ScreenBackdrop>
        <ScrollView contentContainerStyle={styles.content}>
          <ScreenHeader
            eyebrow="EASYPASS"
            title="Juega sin límites"
            description="Compra saldo y reserva tu plaza en los próximos partidos."
          />
          <View style={styles.heroHeader}>
            <View style={styles.heroLogoWrap}>
              <Image source={easypassLogo} style={styles.heroLogo} resizeMode="contain" />
            </View>
            <Text style={styles.title}>EasyPass</Text>
          </View>

          <View style={styles.loginRequiredCard}>
            <Text style={styles.loginRequiredEmoji}>🔐</Text>
            <Text style={styles.loginRequiredTitle}>Necesitas iniciar sesión</Text>
            <Text style={styles.loginRequiredText}>
              Para comprar EasyPass, ver tu saldo o apuntarte a partidos, primero tienes que iniciar sesión o crear una cuenta.
            </Text>

            <View style={styles.loginWarningBox}>
              <Text style={styles.loginWarningTitle}>Aviso</Text>
              <Text style={styles.loginWarningText}>
                Sin sesión iniciada no podemos saber tu saldo ni asociar la compra de EasyPass a tu perfil.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.loginPrimaryBtn}
              onPress={() => navigation.navigate('Access', { mode: 'login' })}
              activeOpacity={0.85}
            >
              <Text style={styles.loginPrimaryBtnText}>Iniciar sesión</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.loginSecondaryBtn}
              onPress={() => navigation.navigate('Access', { mode: 'register' })}
              activeOpacity={0.85}
            >
              <Text style={styles.loginSecondaryBtnText}>Crear cuenta</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </ScreenBackdrop>
    );
  }

  return (
    <ScreenBackdrop>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          eyebrow="TU SALDO"
          title="EasyPass"
          description="Elige la ciudad correcta y compra el pack que mejor encaje contigo."
        />
        <View style={styles.heroHeader}>
          <View style={styles.heroLogoWrap}>
            <Image source={easypassLogo} style={styles.heroLogo} resizeMode="contain" />
          </View>
          <Text style={styles.title}>Listo para jugar</Text>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Disponibles en {selectedLocationName}</Text>
          <Text style={styles.balanceValue}>{selectedBalance}</Text>
          <Text style={styles.balanceHint}>
            {route?.params?.returnTo === 'Match'
              ? 'Usa 1 EasyPass para apuntarte al partido que estabas viendo.'
              : 'Usa 1 EasyPass para apuntarte a un partido'}
          </Text>
          <View style={styles.totalBalance}><Text style={styles.totalBalanceText}>Saldo total: {easyPassBalance}</Text></View>
          <TouchableOpacity style={styles.giftButton} onPress={openGift} activeOpacity={0.86}>
            <Ionicons name="gift-outline" color={ORANGE} size={18}/><Text style={styles.giftButtonText}>Regalar EasyPass</Text>
          </TouchableOpacity>
        </View>

        {selectedBalance <= 1 && <View style={styles.lowBalanceCard}><Ionicons name="alert-circle" color="#f4c95d" size={22}/><View style={{flex:1}}><Text style={styles.lowBalanceTitle}>{selectedBalance===0?'No tienes EasyPass en esta ciudad':'Te queda un solo EasyPass'}</Text><Text style={styles.lowBalanceText}>Compra un pack antes de reservar tu próximo partido en {selectedLocationName}.</Text></View></View>}

        <Text style={styles.plusSectionLabel}>EASYPASS PLUS</Text>
        <TouchableOpacity style={styles.plusCard} onPress={() => navigation.navigate('Plus')} activeOpacity={0.86} accessibilityRole="button" accessibilityLabel="Abrir EasyFutbol Plus">
          <View style={styles.plusIcon}><Text style={styles.plusIconText}>★</Text></View>
          <View style={styles.plusCopy}>
            <Text style={styles.plusEyebrow}>EASYFUTBOL PLUS</Text>
            <Text style={styles.plusTitle}>Juega con más ventajas</Text>
            <Text style={styles.plusText}>1 EasyPass al mes, 10% de descuento y mucho más.</Text>
          </View>
          <Text style={styles.plusArrow}>›</Text>
        </TouchableOpacity>

        {route?.params?.returnTo === 'Match' && route?.params?.matchId ? (
          <TouchableOpacity
            style={styles.backToMatchBtn}
            onPress={() => navigation.navigate('Match', { matchId: route.params.matchId })}
            activeOpacity={0.85}
          >
            <Text style={styles.backToMatchBtnText}>Volver al partido</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.locationCard}>
          <Text style={styles.locationEyebrow}>Elige ciudad</Text>
          <Text style={styles.locationTitle}>¿Dónde vas a jugar?</Text>
          <Text style={styles.locationHint}>
            Cada EasyPass solo sirve para la localización en la que lo compres. Revisa bien la ciudad antes de pagar.
          </Text>

          <View style={styles.locationGrid}>
            {locations.map((location) => {
              const isSelected = Number(location.id) === Number(selectedLocationId);
              return (
                <TouchableOpacity
                  key={location.id}
                  style={[styles.locationBtn, isSelected && styles.locationBtnActive]}
                  onPress={() => setSelectedLocationId(Number(location.id))}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[styles.locationBtnText, isSelected && styles.locationBtnTextActive]}>
                    {location.name}
                  </Text>
                  <Text style={[styles.locationBtnSubText, isSelected && styles.locationBtnSubTextActive]}>
                    {isSelected ? 'Seleccionada' : 'Tocar para elegir'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={styles.section}>Packs para {selectedLocationName}</Text>

        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>Importante</Text>
          <Text style={styles.warningText}>
            Los EasyPass de {selectedLocationName} solo se podrán usar en partidos de {selectedLocationName}. No compres packs de otra ciudad si vas a jugar aquí.
          </Text>
        </View>

        {displayPacks.map((p) => (
          <View key={p.id} style={styles.packCard}>
            <View style={styles.packAmountBadge}>
              <Text style={styles.packAmount}>{p.displayAmount}</Text>
              <Text style={styles.packAmountLabel}>EASYPASS</Text>
            </View>
            <View style={styles.packCopy}>
              <Text style={styles.packName}>{p.displayName}</Text>
              <Text style={styles.packMeta}>Válido solo para {selectedLocationName}</Text>
            </View>

            <View style={{ alignItems:'flex-end' }}>
              {p.plus_discount_applied ? <Text style={styles.plusDiscount}>PLUS · −10%</Text> : null}
              {p.plus_discount_applied ? <Text style={styles.packOriginalPrice}>{formatEuro(p.displayOriginalPriceCents)}</Text> : null}
              <Text style={styles.packPrice}>{formatEuro(p.displayPriceCents)}</Text>
              <TouchableOpacity
                style={[styles.buyBtn, buyingPackId === p.id && styles.buyBtnDisabled]}
                onPress={() => buyPack(p)}
                activeOpacity={0.85}
                disabled={buyingPackId !== null}
                accessibilityRole="button"
                accessibilityState={{ disabled: buyingPackId !== null, busy: buyingPackId === p.id }}
              >
                <Text style={styles.buyText}>
                  {buyingPackId === p.id ? 'Abriendo pago...' : 'Comprar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {displayPacks.length === 0 && (
          <Text style={{ color:'#aaa', textAlign:'center', marginTop: 20 }}>
            No hay packs disponibles ahora mismo.
          </Text>
        )}

        <View style={styles.historyHeader}><View><Text style={styles.historyEyebrow}>TRANSPARENCIA</Text><Text style={styles.historyTitle}>Historial de movimientos</Text></View><Ionicons name="receipt-outline" color={ORANGE} size={23}/></View>
        {!history.length&&<View style={styles.historyEmpty}><Text style={styles.historyEmptyText}>Todavía no tienes movimientos de EasyPass.</Text></View>}
        {history.map((movement)=><View key={movement.id} style={styles.historyCard}>
          <View style={[styles.historyIcon,movement.direction==='in'?styles.historyIconIn:styles.historyIconOut]}><Ionicons name={movement.direction==='in'?'arrow-down':'arrow-up'} color={movement.direction==='in'?'#4dbb78':'#ff8050'} size={19}/></View>
          <View style={styles.historyCopy}><Text style={styles.historyItemTitle}>{movement.title}</Text><Text style={styles.historyExplanation}>{movement.explanation}</Text><Text style={styles.historyMeta}>{new Date(movement.created_at).toLocaleDateString('es-ES')} {movement.location_name?`· ${movement.location_name}`:''}</Text></View>
          <View style={styles.historyRight}><Text style={[styles.historyAmount,movement.direction==='in'?styles.amountIn:styles.amountOut]}>{movement.amount>0?'+':''}{movement.amount}</Text>{movement.can_repeat&&<TouchableOpacity style={styles.repeatBtn} onPress={()=>buyPack({id:movement.pack_id})}><Text style={styles.repeatText}>Repetir</Text></TouchableOpacity>}</View>
        </View>)}
      </ScrollView>
      <Modal visible={giftOpen} transparent animationType="slide" onRequestClose={()=>setGiftOpen(false)}>
        <View style={styles.giftBackdrop}><View style={styles.giftSheet}>
          <View style={styles.giftHeader}><View><Text style={styles.giftEyebrow}>REGALO ENTRE AMIGOS</Text><Text style={styles.giftTitle}>Regalar EasyPass</Text></View><TouchableOpacity style={styles.giftClose} onPress={()=>setGiftOpen(false)}><Ionicons name="close" color="#fff" size={22}/></TouchableOpacity></View>
          <Text style={styles.giftDescription}>Se enviarán desde tu saldo de {selectedLocationName}. El destinatario solo podrá usarlos en esa misma sede.</Text>
          <Text style={styles.giftLabel}>DESTINATARIO</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendChoices}>
            {giftFriends.map(friend=><TouchableOpacity key={friend.id} style={[styles.friendChoice,giftRecipient?.id===friend.id&&styles.friendChoiceActive]} onPress={()=>setGiftRecipient(friend)}><View style={styles.friendInitial}><Text style={styles.friendInitialText}>{String(friend.name||'?').slice(0,1).toUpperCase()}</Text></View><Text style={styles.friendName} numberOfLines={1}>{friend.name}</Text></TouchableOpacity>)}
          </ScrollView>
          <Text style={styles.giftLabel}>CANTIDAD</Text>
          <View style={styles.amountChoices}>{[1,2,3,5].filter(value=>value<=selectedBalance).map(value=><TouchableOpacity key={value} style={[styles.amountChoice,giftAmount===value&&styles.amountChoiceActive]} onPress={()=>setGiftAmount(value)}><Text style={[styles.amountChoiceText,giftAmount===value&&styles.amountChoiceTextActive]}>{value}</Text></TouchableOpacity>)}</View>
          <Text style={styles.giftAvailable}>Disponibles en {selectedLocationName}: {selectedBalance}</Text>
          <TouchableOpacity style={[styles.sendGift,gifting&&{opacity:.55}]} disabled={gifting} onPress={sendGift}><Ionicons name="gift" color="#111" size={19}/><Text style={styles.sendGiftText}>{gifting?'Enviando…':`Regalar ${giftAmount} EasyPass`}</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </ScreenBackdrop>
  );
}

const styles = StyleSheet.create({
  screen:{ flex:1, backgroundColor:colors.background },
  screenImage:{ resizeMode:'cover', opacity:0.55 },
  content:{ width:'100%', maxWidth:layout.maxContentWidth, alignSelf:'center', padding:spacing(2), paddingBottom:spacing(6), flexGrow:1 },
  loader:{ flex:1, backgroundColor:colors.background, alignItems:'center', justifyContent:'center' },

  heroHeader:{ flexDirection:'row', alignItems:'center', marginBottom:spacing(2) },
  heroLogoWrap:{ width:72, height:72, borderRadius:radii.large, backgroundColor:'rgba(255,90,0,0.10)', overflow:'hidden', alignItems:'center', justifyContent:'center', marginRight:spacing(1.5), borderWidth:1, borderColor:'rgba(255,90,0,0.35)' },
  heroLogo:{ width:'100%', height:'100%' },
  title:{ color:colors.white, ...typography.heading },

  balanceCard:{
    backgroundColor:'rgba(17,21,27,0.94)',
    borderRadius:radii.large,
    padding: spacing(2.5),
    borderWidth:1,
    borderColor:colors.border,
    marginBottom: 18,
    marginTop: 4
  },
  balanceLabel:{ color:colors.orange, ...typography.overline },
  balanceValue:{ color:colors.white, fontSize:48, lineHeight:56, fontWeight:'900', marginTop:spacing(0.5) },
  balanceHint:{ color:colors.textMuted, marginTop:spacing(0.5), ...typography.body },
  totalBalance:{alignSelf:'flex-start',backgroundColor:'#26262a',borderRadius:10,paddingHorizontal:10,paddingVertical:6,marginTop:12},totalBalanceText:{color:'#999',fontSize:10,fontWeight:'800'},
  giftButton:{alignSelf:'flex-start',minHeight:42,flexDirection:'row',alignItems:'center',gap:7,marginTop:14,paddingHorizontal:13,borderRadius:13,backgroundColor:'rgba(255,90,0,.10)',borderWidth:1,borderColor:'rgba(255,90,0,.32)'},giftButtonText:{color:ORANGE,fontSize:11,fontWeight:'900'},
  lowBalanceCard:{flexDirection:'row',alignItems:'center',gap:11,backgroundColor:'rgba(244,201,93,.09)',borderWidth:1,borderColor:'rgba(244,201,93,.28)',borderRadius:16,padding:14,marginBottom:18},lowBalanceTitle:{color:'#f4c95d',fontWeight:'900'},lowBalanceText:{color:'#a89f82',fontSize:11,lineHeight:16,marginTop:3},
  plusSectionLabel:{ color:'#F4C95D', ...typography.overline, marginBottom:spacing(1) },
  plusCard:{ minHeight:96, flexDirection:'row', alignItems:'center', gap:spacing(1.25), backgroundColor:'rgba(45,35,10,0.96)', borderRadius:radii.large, borderWidth:1, borderColor:'rgba(244,201,93,0.35)', padding:spacing(1.5), marginBottom:spacing(2) },
  plusIcon:{ width:46, height:46, borderRadius:15, alignItems:'center', justifyContent:'center', backgroundColor:'#F4C95D' },
  plusIconText:{ color:'#161109', fontSize:22, fontWeight:'900' },
  plusCopy:{ flex:1 },
  plusEyebrow:{ color:'#F4C95D', ...typography.overline, fontSize:9 },
  plusTitle:{ color:colors.white, ...typography.bodyStrong, marginTop:2 },
  plusText:{ color:colors.textMuted, ...typography.caption, marginTop:2 },
  plusArrow:{ color:'#F4C95D', fontSize:30, lineHeight:32 },
  plusDiscount:{ color:'#F4C95D', fontSize:9, fontWeight:'900', letterSpacing:0.8 },
  packOriginalPrice:{ color:colors.textSubtle, fontSize:12, textDecorationLine:'line-through', marginTop:2 },

  loginRequiredCard:{
    backgroundColor:'rgba(17,17,17,0.96)',
    borderRadius:radii.large,
    padding: 20,
    borderWidth:1,
    borderColor:'rgba(255,90,0,0.32)',
    marginTop: 10,
    alignItems:'center',
  },
  loginRequiredEmoji:{ fontSize:34, marginBottom: 10 },
  loginRequiredTitle:{ color:'#fff', fontSize:20, fontWeight:'900', textAlign:'center' },
  loginRequiredText:{ color:'#bdbdbd', marginTop: 10, fontSize:14, fontWeight:'700', textAlign:'center', lineHeight:20 },
  loginWarningBox:{
    width:'100%',
    marginTop: 16,
    backgroundColor:'rgba(255,90,0,0.10)',
    borderWidth:1,
    borderColor:'rgba(255,90,0,0.35)',
    borderRadius:14,
    padding: 13,
  },
  loginWarningTitle:{ color:ORANGE, fontWeight:'900', marginBottom: 4, textAlign:'center' },
  loginWarningText:{ color:'#f1f1f1', fontSize:12, fontWeight:'700', lineHeight:18, textAlign:'center' },
  loginPrimaryBtn:{ width:'100%', minHeight:layout.minTouchTarget, marginTop:18, backgroundColor:ORANGE, paddingVertical:13, borderRadius:radii.medium, alignItems:'center', justifyContent:'center' },
  loginPrimaryBtnText:{ color:'#000', fontWeight:'900', fontSize:15 },
  loginSecondaryBtn:{ width:'100%', minHeight:layout.minTouchTarget, marginTop:10, backgroundColor:colors.surfaceElevated, borderWidth:1, borderColor:colors.border, paddingVertical:13, borderRadius:radii.medium, alignItems:'center', justifyContent:'center' },
  loginSecondaryBtnText:{ color:'#fff', fontWeight:'900', fontSize:15 },

  backToMatchBtn:{
    marginBottom: 18,
    backgroundColor:'#1b1b1b',
    borderWidth:1,
    borderColor:ORANGE,
    minHeight:layout.minTouchTarget,
    borderRadius:radii.medium,
    paddingVertical:12,
    alignItems:'center',
  },
  backToMatchBtnText:{ color:'#fff', fontWeight:'900' },

  section:{ color: ORANGE, fontWeight:'900', marginBottom: 10, fontSize:16 },

  locationCard:{
    backgroundColor:'rgba(17,17,17,0.96)',
    borderRadius:radii.large,
    padding: 16,
    borderWidth:1,
    borderColor:colors.border,
    marginBottom: 16,
  },
  locationEyebrow:{ color:ORANGE, fontSize:12, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.5 },
  locationTitle:{ color:'#fff', fontSize:19, fontWeight:'900', marginTop: 4 },
  locationHint:{ color:'#bdbdbd', fontSize:12, fontWeight:'700', lineHeight:18, marginTop: 8 },
  locationGrid:{ flexDirection:'row', flexWrap:'wrap', gap:10, marginTop:14 },
  locationBtn:{
    flex:1,
    backgroundColor:'#171717',
    borderWidth:1,
    borderColor:'rgba(255,255,255,0.12)',
    minWidth:140,
    minHeight:72,
    borderRadius:radii.medium,
    paddingVertical:13,
    paddingHorizontal:10,
    alignItems:'center',
  },
  locationBtnActive:{ backgroundColor:ORANGE, borderColor:ORANGE },
  locationBtnText:{ color:'#fff', fontSize:15, fontWeight:'900' },
  locationBtnTextActive:{ color:'#000' },
  locationBtnSubText:{ color:'#9f9f9f', fontSize:10, fontWeight:'800', marginTop: 4 },
  locationBtnSubTextActive:{ color:'#281000' },

  warningCard:{
    backgroundColor:'rgba(255,90,0,0.10)',
    borderWidth:1,
    borderColor:'rgba(255,90,0,0.35)',
    borderRadius:14,
    padding: 13,
    marginBottom: 12,
  },
  warningTitle:{ color:ORANGE, fontWeight:'900', marginBottom: 4 },
  warningText:{ color:'#f1f1f1', fontSize:12, fontWeight:'700', lineHeight:18 },

  packCard:{
    flexDirection:'row',
    alignItems:'center',
    gap: 12,
    backgroundColor:'rgba(17,21,27,0.94)',
    borderRadius:radii.large,
    padding: 16,
    borderWidth:1,
    borderColor:colors.border,
    marginBottom: 12
  },
  packAmountBadge:{ width:58, height:58, borderRadius:radii.medium, backgroundColor:'rgba(255,90,0,0.14)', borderWidth:1, borderColor:'rgba(255,90,0,0.42)', alignItems:'center', justifyContent:'center' },
  packAmount:{ color:colors.white, fontSize:22, fontWeight:'900', lineHeight:26 },
  packAmountLabel:{ color:colors.orange, fontSize:7, fontWeight:'900', letterSpacing:0.5 },
  packCopy:{ flex:1 },
  packName:{ color:'#fff', fontSize:16, fontWeight:'900' },
  packMeta:{ color:'#bdbdbd', fontSize:12, fontWeight:'700', marginTop: 4 },
  packPrice:{ color:'#fff', fontSize:16, fontWeight:'900' },

  buyBtn:{ minHeight:layout.minTouchTarget, marginTop:8, backgroundColor:ORANGE, paddingVertical:10, paddingHorizontal:14, borderRadius:radii.medium, justifyContent:'center' },
  buyBtnDisabled:{ opacity:0.7 },
  buyText:{ color:'#000', fontWeight:'900' },
  historyHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:28,marginBottom:12,paddingHorizontal:2},historyEyebrow:{color:ORANGE,fontSize:9,fontWeight:'900',letterSpacing:1.2},historyTitle:{color:'#fff',fontSize:21,fontWeight:'900',marginTop:3},historyEmpty:{backgroundColor:'rgba(17,21,27,.94)',borderRadius:18,padding:22},historyEmptyText:{color:'#777',textAlign:'center',fontSize:12},historyCard:{flexDirection:'row',alignItems:'center',gap:11,backgroundColor:'rgba(17,21,27,.94)',borderRadius:18,padding:14,borderWidth:1,borderColor:colors.border,marginBottom:9},historyIcon:{width:40,height:40,borderRadius:13,alignItems:'center',justifyContent:'center'},historyIconIn:{backgroundColor:'rgba(77,187,120,.12)'},historyIconOut:{backgroundColor:'rgba(255,90,0,.12)'},historyCopy:{flex:1},historyItemTitle:{color:'#fff',fontWeight:'900',fontSize:13},historyExplanation:{color:'#888',fontSize:10,marginTop:3},historyMeta:{color:'#5f5f65',fontSize:9,marginTop:5},historyRight:{alignItems:'flex-end'},historyAmount:{fontSize:18,fontWeight:'900'},amountIn:{color:'#4dbb78'},amountOut:{color:'#ff8050'},repeatBtn:{backgroundColor:'#2a2a2e',borderRadius:9,paddingHorizontal:8,paddingVertical:5,marginTop:6},repeatText:{color:'#ddd',fontSize:9,fontWeight:'900'},
  giftBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,.72)',justifyContent:'flex-end'},giftSheet:{backgroundColor:'#151517',borderTopLeftRadius:28,borderTopRightRadius:28,borderWidth:1,borderColor:'#303034',padding:20,paddingBottom:38},giftHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},giftEyebrow:{color:ORANGE,fontSize:9,fontWeight:'900',letterSpacing:1.1},giftTitle:{color:'#fff',fontSize:23,fontWeight:'900',marginTop:4},giftClose:{width:42,height:42,borderRadius:14,backgroundColor:'#27272b',alignItems:'center',justifyContent:'center'},giftDescription:{color:'#85858b',fontSize:12,lineHeight:18,marginTop:12},giftLabel:{color:'#aaa',fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:20,marginBottom:9},friendChoices:{gap:9},friendChoice:{width:94,minHeight:91,borderRadius:16,backgroundColor:'#202023',borderWidth:1,borderColor:'#2d2d31',alignItems:'center',padding:10},friendChoiceActive:{backgroundColor:'#2e211b',borderColor:'#9c451b'},friendInitial:{width:40,height:40,borderRadius:13,backgroundColor:ORANGE,alignItems:'center',justifyContent:'center'},friendInitialText:{color:'#fff',fontWeight:'900'},friendName:{color:'#ddd',fontSize:10,fontWeight:'800',marginTop:7,maxWidth:76},amountChoices:{flexDirection:'row',gap:9},amountChoice:{width:54,height:48,borderRadius:14,backgroundColor:'#242428',borderWidth:1,borderColor:'#303035',alignItems:'center',justifyContent:'center'},amountChoiceActive:{backgroundColor:ORANGE,borderColor:ORANGE},amountChoiceText:{color:'#aaa',fontSize:17,fontWeight:'900'},amountChoiceTextActive:{color:'#111'},giftAvailable:{color:'#727278',fontSize:10,marginTop:10},sendGift:{minHeight:54,marginTop:20,borderRadius:16,backgroundColor:ORANGE,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},sendGiftText:{color:'#111',fontWeight:'900',fontSize:14},
});
