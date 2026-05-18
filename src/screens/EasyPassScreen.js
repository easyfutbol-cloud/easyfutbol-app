import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Linking, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import { colors, spacing } from '../theme';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import easypassLogo from '../../assets/easypass-logo.png';

const ORANGE = '#ff5a00';

const formatEuro = (cents) => `${(Number(cents || 0) / 100).toFixed(2)}€`;

export default function EasyPassScreen() {
  const [packs, setPacks] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(1);
  const [easyPassBalance, setEasyPassBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [buyingPackId, setBuyingPackId] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigation = useNavigation();
  const route = useRoute();
  const previousBalanceRef = useRef(null);
  const purchaseInProgressRef = useRef(false);

  const selectedLocation = locations.find((item) => Number(item.id) === Number(selectedLocationId));
  const selectedLocationName = selectedLocation?.name || 'Valladolid';

  const displayPacks = packs.map((pack) => ({
    ...pack,
    displayName: `${Number(pack?.easyPassAmount ?? pack?.credits ?? 0)} EasyPass`,
    displayPriceCents: Number(pack?.price_cents || pack?.priceCents || 0),
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

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={ORANGE} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={{ flex:1, backgroundColor: colors.black }}>
        <ScrollView contentContainerStyle={{ padding: spacing(2), paddingBottom: spacing(6), flexGrow: 1 }}>
          <View style={styles.heroHeader}>
            <View style={styles.heroLogoWrap}>
              <Image source={easypassLogo} style={styles.heroLogo} resizeMode="contain" />
            </View>
            <Text style={styles.title}>🎟️ EasyPass</Text>
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
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.85}
            >
              <Text style={styles.loginPrimaryBtnText}>Iniciar sesión</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.loginSecondaryBtn}
              onPress={() => navigation.navigate('Register')}
              activeOpacity={0.85}
            >
              <Text style={styles.loginSecondaryBtnText}>Crear cuenta</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex:1, backgroundColor: colors.black }}>
      <ScrollView contentContainerStyle={{ padding: spacing(2), paddingBottom: spacing(6) }}>
        <View style={styles.heroHeader}>
          <View style={styles.heroLogoWrap}>
            <Image source={easypassLogo} style={styles.heroLogo} resizeMode="contain" />
          </View>
          <Text style={styles.title}>🎟️ EasyPass</Text>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Disponibles</Text>
          <Text style={styles.balanceValue}>{easyPassBalance}</Text>
          <Text style={styles.balanceHint}>
            {route?.params?.returnTo === 'Match'
              ? 'Usa 1 EasyPass para apuntarte al partido que estabas viendo.'
              : 'Usa 1 EasyPass para apuntarte a un partido'}
          </Text>
        </View>

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
            <View style={{ flex:1 }}>
              <Text style={styles.packName}>{p.displayName}</Text>
              <Text style={styles.packMeta}>Válido solo para {selectedLocationName}</Text>
            </View>

            <View style={{ alignItems:'flex-end' }}>
              <Text style={styles.packPrice}>{formatEuro(p.displayPriceCents)}</Text>
              <TouchableOpacity
                style={[styles.buyBtn, buyingPackId === p.id && styles.buyBtnDisabled]}
                onPress={() => buyPack(p)}
                activeOpacity={0.85}
                disabled={buyingPackId !== null}
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loader:{ flex:1, backgroundColor:'#000', alignItems:'center', justifyContent:'center' },

  heroHeader:{ alignItems:'center', marginBottom: 14 },
  heroLogoWrap:{ width:88, height:88, borderRadius:44, backgroundColor:'transparent', overflow:'hidden', alignItems:'center', justifyContent:'center', marginBottom:10 },
  heroLogo:{ width:'100%', height:'100%' },
  title:{ color:'#fff', fontSize:22, fontWeight:'900', textAlign:'center' },

  balanceCard:{
    backgroundColor:'rgba(17,17,17,0.92)',
    borderRadius:16,
    padding: 16,
    borderWidth:1,
    borderColor:'rgba(255,255,255,0.06)',
    marginBottom: 18,
    marginTop: 4
  },
  balanceLabel:{ color:'#bbb', fontWeight:'800' },
  balanceValue:{ color:'#fff', fontSize:34, fontWeight:'900', marginTop: 6 },
  balanceHint:{ color:'#9f9f9f', marginTop: 6, fontWeight:'700', fontSize:12 },

  loginRequiredCard:{
    backgroundColor:'rgba(17,17,17,0.96)',
    borderRadius:18,
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
  loginPrimaryBtn:{ width:'100%', marginTop: 18, backgroundColor: ORANGE, paddingVertical:13, borderRadius:14, alignItems:'center' },
  loginPrimaryBtnText:{ color:'#000', fontWeight:'900', fontSize:15 },
  loginSecondaryBtn:{ width:'100%', marginTop: 10, backgroundColor:'#1b1b1b', borderWidth:1, borderColor:'rgba(255,255,255,0.14)', paddingVertical:13, borderRadius:14, alignItems:'center' },
  loginSecondaryBtnText:{ color:'#fff', fontWeight:'900', fontSize:15 },

  backToMatchBtn:{
    marginBottom: 18,
    backgroundColor:'#1b1b1b',
    borderWidth:1,
    borderColor:ORANGE,
    borderRadius:12,
    paddingVertical:12,
    alignItems:'center',
  },
  backToMatchBtnText:{ color:'#fff', fontWeight:'900' },

  section:{ color: ORANGE, fontWeight:'900', marginBottom: 10, fontSize:16 },

  locationCard:{
    backgroundColor:'rgba(17,17,17,0.96)',
    borderRadius:18,
    padding: 16,
    borderWidth:1,
    borderColor:'rgba(255,90,0,0.28)',
    marginBottom: 16,
  },
  locationEyebrow:{ color:ORANGE, fontSize:12, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.5 },
  locationTitle:{ color:'#fff', fontSize:19, fontWeight:'900', marginTop: 4 },
  locationHint:{ color:'#bdbdbd', fontSize:12, fontWeight:'700', lineHeight:18, marginTop: 8 },
  locationGrid:{ flexDirection:'row', gap:10, marginTop: 14 },
  locationBtn:{
    flex:1,
    backgroundColor:'#171717',
    borderWidth:1,
    borderColor:'rgba(255,255,255,0.12)',
    borderRadius:14,
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
    gap: 12,
    backgroundColor:'rgba(17,17,17,0.92)',
    borderRadius:16,
    padding: 16,
    borderWidth:1,
    borderColor:'rgba(255,255,255,0.06)',
    marginBottom: 12
  },
  packName:{ color:'#fff', fontSize:16, fontWeight:'900' },
  packMeta:{ color:'#bdbdbd', fontSize:12, fontWeight:'700', marginTop: 4 },
  packPrice:{ color:'#fff', fontSize:16, fontWeight:'900' },

  buyBtn:{ marginTop: 8, backgroundColor: ORANGE, paddingVertical:10, paddingHorizontal:14, borderRadius:12 },
  buyBtnDisabled:{ opacity:0.7 },
  buyText:{ color:'#000', fontWeight:'900' },
});