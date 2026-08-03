// src/screens/ProfileScreen.js
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, StatusBar, ActivityIndicator, TouchableOpacity,
  Alert, TextInput, ScrollView, ImageBackground, Image, Linking, Modal, Share
} from 'react-native';
import { colors, layout, radii, spacing, typography } from '../theme';
import { api } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, CommonActions } from '@react-navigation/native';
import easypassLogo from '../../assets/easypass-logo.png';
import ScreenHeader from '../components/ScreenHeader';

const HERMINIA_LOGO = require('../../assets/La herminia.png');
const NUINO_LOGO = require('../../assets/Nuino_Wordmark-White.png');

const ORANGE = '#ff5a00';
const WHATSAPP_VALLADOLID_URL = 'https://chat.whatsapp.com/IdRGx2RDihu1ghbLWv44J5?s=cl&p=i&ilr=0&amv=2';
const WHATSAPP_ASTURIAS_URL = 'https://chat.whatsapp.com/ElR7I1uBofT5jKUO4Jhbs6?s=cl&p=i&ilr=0&amv=2';
const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@EasyFutbol_Es';
const FIELD_BG = require('../../assets/matches/match-1.jpg');

export default function ProfileScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [uploading, setUploading] = useState(false);
  const [avatarNonce, setAvatarNonce] = useState(Date.now());
  const [avatarPreviewUri, setAvatarPreviewUri] = useState(null);
  const [easyPass, setEasyPass] = useState(0);
  const [easyPassBalances, setEasyPassBalances] = useState([]);
  const [easyPassLoading, setEasyPassLoading] = useState(false);
  const [collaborationsVisible, setCollaborationsVisible] = useState(false);
  const [activeCollaboration, setActiveCollaboration] = useState('herminia');
  const [referralData, setReferralData] = useState(null);

  const BASE = (api?.defaults?.baseURL || '').replace(/\/+$/, '');
  // BASE suele ser https://.../api. Para assets (/uploads/...) necesitamos el origen sin /api
  const PUBLIC_BASE = BASE.replace(/\/api\/?$/, '');

  const getAuthHeader = async () => {
    const raw = await AsyncStorage.getItem('token');
    let token = raw;
    try { const parsed = JSON.parse(raw || 'null'); token = parsed?.access_token || parsed?.token || raw; } catch {}
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const goToAccess = async () => {
    await AsyncStorage.multiRemove(['token', 'user']);
    try { navigation.replace('Access'); return; } catch {}
    try { navigation.navigate('Access'); return; } catch {}
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Access' }] }));
  };

  const pingApi = async () => {
    try {
      const res = await fetch(`${BASE}/health`, { method: 'GET' });
      if (!res.ok) throw new Error(`/api/health ${res.status}`);
      return true;
    } catch (e) {
      setErrMsg(`No hay conexión con la API (${e?.message || 'health fail'})`);
      return false;
    }
  };

  const parsePayload = async (res) => {
    const json = await res.json().catch(() => ({}));
    const payload = json?.data ?? json ?? null;
    if (!payload?.user) throw new Error(json?.msg || 'Respuesta inesperada del servidor');
    return payload;
  };

  const loadEasyPass = async () => {
    setEasyPassLoading(true);
    try {
      const headers = { Accept: 'application/json', ...(await getAuthHeader()) };
      const res = await fetch(`${BASE}/me/credits`, { method: 'GET', headers });
      if (res.status === 401) return; // sesión expirada, lo gestiona loadProfile
      const json = await res.json().catch(() => ({}));
      const credits = Number(json?.credits ?? json?.data?.credits ?? 0);
      if (Number.isFinite(credits)) setEasyPass(credits);

      const balances = json?.easyPassBalances || json?.easypass_balances || json?.data?.easyPassBalances || json?.data?.easypass_balances || [];
      if (Array.isArray(balances)) {
        setEasyPassBalances(balances.map((item) => ({
          ...item,
          locationId: Number(item.locationId ?? item.location_id),
          locationName: item.locationName || item.location_name || 'EasyFutbol',
          balance: Number(item.balance ?? item.easyPassBalance ?? item.credits ?? 0),
        })));
      }
    } catch {
      // No rompemos el perfil si aún no existe el endpoint
    } finally {
      setEasyPassLoading(false);
    }
  };

  const buyEasyPass = async () => {
    try {
      const headers = { Accept: 'application/json', ...(await getAuthHeader()) };

      const locationsRes = await fetch(`${BASE}/easypass/locations`, { method: 'GET', headers });
      const locationsJson = await locationsRes.json().catch(() => ({}));
      if (!locationsRes.ok) throw new Error(locationsJson?.msg || 'No se pudieron cargar las ciudades');

      const locations = Array.isArray(locationsJson?.data) ? locationsJson.data : [];
      if (locations.length === 0) {
        Alert.alert('EasyPass', 'No hay ciudades disponibles ahora mismo');
        return;
      }

      const openPacksForLocation = async (location) => {
        try {
          const locationId = Number(location?.id || 1);
          const locationName = location?.name || 'EasyFutbol';

          const packsRes = await fetch(`${BASE}/easypass/packs?location_id=${locationId}`, { method: 'GET', headers });
          const packsJson = await packsRes.json().catch(() => ({}));
          if (!packsRes.ok) throw new Error(packsJson?.msg || 'No se pudieron cargar los packs');

          const packs = Array.isArray(packsJson?.data) ? packsJson.data : [];
          if (packs.length === 0) {
            Alert.alert('EasyPass', `No hay packs disponibles para ${locationName} ahora mismo`);
            return;
          }

          const buttons = packs.slice(0, 6).map((p) => ({
            text: `${p.name} · ${(Number(p.price_cents || 0) / 100).toFixed(2)}€`,
            onPress: async () => {
              try {
                const checkoutRes = await fetch(`${BASE}/easypass/packs/${p.id}/checkout`, { method: 'POST', headers });
                const checkoutJson = await checkoutRes.json().catch(() => ({}));
                if (!checkoutRes.ok || !checkoutJson?.checkout_url) {
                  throw new Error(checkoutJson?.msg || 'No se pudo crear el pago');
                }
                await Linking.openURL(checkoutJson.checkout_url);
              } catch (e) {
                Alert.alert('Error', e?.message || 'No se pudo iniciar el pago');
              }
            },
          }));

          Alert.alert(
            `EasyPass ${locationName}`,
            `Estos EasyPass solo serán válidos para partidos de ${locationName}. Elige un pack:`,
            [
              ...buttons,
              { text: 'Cambiar ciudad', onPress: buyEasyPass },
              { text: 'Cancelar', style: 'cancel' },
            ]
          );
        } catch (e) {
          Alert.alert('Error', e?.message || 'No se pudieron cargar los packs');
        }
      };

      const cityButtons = locations.map((location) => ({
        text: location.name,
        onPress: () => openPacksForLocation(location),
      }));

      Alert.alert(
        'Comprar EasyPass',
        'Primero elige la ciudad. Recuerda: cada EasyPass solo vale para la localización donde lo compras.',
        [
          ...cityButtons,
          { text: 'Cancelar', style: 'cancel' },
        ]
      );
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudieron cargar las ciudades');
    }
  };

  const openWhatsAppGroup = async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('No se pudo abrir el enlace');
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo abrir el grupo de WhatsApp');
    }
  };

  const openYouTubeChannel = async () => {
    try {
      const supported = await Linking.canOpenURL(YOUTUBE_CHANNEL_URL);
      if (!supported) throw new Error('No se pudo abrir el enlace');
      await Linking.openURL(YOUTUBE_CHANNEL_URL);
    } catch (error) {
      Alert.alert('No se pudo abrir YouTube', error?.message || 'Inténtalo de nuevo más tarde.');
    }
  };

  const loadReferrals = async () => {
    try {
      const response = await api.get('/referrals/me');
      setReferralData(response?.data?.data || null);
    } catch (error) {
      console.log('Error cargando referidos:', error?.message || error);
    }
  };

  const shareReferralCode = async () => {
    if (!referralData?.referral_code) return;
    try {
      await Share.share({
        message: `Únete a EasyFutbol con mi código ${referralData.referral_code}. Cuando compres tu primer pack de EasyPass, me ayudarás a conseguir una recompensa.`,
      });
    } catch (error) {
      Alert.alert('No se pudo compartir', error?.message || 'Inténtalo de nuevo.');
    }
  };

  const loadProfile = async () => {
    setLoading(true);
    setErrMsg('');
    try {
      const ok = await pingApi();
      if (!ok) { setLoading(false); return; }

      const headers = { Accept: 'application/json', ...(await getAuthHeader()) };
      const res = await fetch(`${BASE}/me/profile`, { method: 'GET', headers });

      if (res.status === 401) {
        setErrMsg('Sesión expirada. Vuelve a iniciar sesión.');
        setData(null);
        return;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Perfil ${res.status} ${text?.slice(0,120)}`);
      }

      const payload = await parsePayload(res);
      setData(payload);
      setName(payload?.user?.name || '');
      setEmail(payload?.user?.email || '');
      setAvatarNonce(Date.now());
      const profileBalances = payload?.user?.easyPassBalances || payload?.user?.easypass_balances || [];
      if (Array.isArray(profileBalances)) {
        setEasyPassBalances(profileBalances.map((item) => ({
          ...item,
          locationId: Number(item.locationId ?? item.location_id),
          locationName: item.locationName || item.location_name || 'EasyFutbol',
          balance: Number(item.balance ?? item.easyPassBalance ?? item.credits ?? 0),
        })));
      }
      // Cargar créditos (EasyPass)
      await loadEasyPass();
      await loadReferrals();
    } catch (e) {
      setErrMsg(e?.message?.toString?.() || 'Network Error');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProfile(); }, []);
  useFocusEffect(useCallback(() => {
    loadProfile();
    loadEasyPass();
    loadReferrals();
  }, []));

  const logout = async () => {
    await AsyncStorage.multiRemove(['token','user']);
    Alert.alert('Sesión cerrada');
    goToAccess();
  };

  const deleteAccount = async () => {
    Alert.alert(
      'Eliminar cuenta',
      'Esta acción es irreversible. Se borrará tu cuenta y no podrás recuperarla. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const headers = { ...(await getAuthHeader()) };

              // Intentamos varias rutas por compatibilidad
              const candidates = [
                `${BASE}/me`,
                `${BASE}/me/account`,
                `${BASE}/me/profile`,
              ];

              let lastErr = null;
              for (const url of candidates) {
                const res = await fetch(url, { method: 'DELETE', headers });
                if (res.ok) {
                  Alert.alert('Cuenta eliminada');
                  await AsyncStorage.multiRemove(['token', 'user']);
                  goToAccess();
                  return;
                }
                // 404 -> probamos la siguiente
                if (res.status === 404) continue;
                const txt = await res.text().catch(() => '');
                lastErr = new Error(txt || `Error ${res.status}`);
                break;
              }

              throw lastErr || new Error('No se pudo eliminar la cuenta (ruta no encontrada)');
            } catch (e) {
              Alert.alert('Error', e?.message || 'No se pudo eliminar la cuenta');
            }
          },
        },
      ]
    );
  };

  const save = async () => {
    try {
      const body = {};
      if (name && data?.user && name !== data.user.name) body.name = name;
      if (email && data?.user && email !== data.user.email) body.email = email;
      if (password) body.password = password;
      if (Object.keys(body).length === 0) { Alert.alert('Nada que actualizar'); return; }

      const headers = { 'Content-Type':'application/json', ...(await getAuthHeader()) };
      const res = await fetch(`${BASE}/me/profile`, { method: 'PATCH', headers, body: JSON.stringify(body) });

      if (res.status === 401) { setErrMsg('Sesión expirada. Vuelve a iniciar sesión.'); return; }
      if (!res.ok) {
        const txt = await res.text().catch(()=> '');
        throw new Error(txt || `Error ${res.status}`);
      }
      Alert.alert('Perfil actualizado');
      setPassword(''); setEditing(false);
      await loadProfile();
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo actualizar');
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1,1],
        quality: 0.9
      });
      if (result.canceled) return;

      setUploading(true);
      const localUri = result.assets[0].uri;
      // Vista previa inmediata para evitar caché
      setAvatarPreviewUri(localUri);
      const headers = { ...(await getAuthHeader()) };
      const formData = new FormData();
      formData.append('avatar', { uri: localUri, type: 'image/jpeg', name: 'avatar.jpg' });

      const res = await fetch(`${BASE}/me/avatar`, { method: 'POST', headers, body: formData });
      if (res.status === 401) { setErrMsg('Sesión expirada. Vuelve a iniciar sesión.'); return; }
      if (!res.ok) {
        const txt = await res.text().catch(()=> '');
        throw new Error(txt || `Error ${res.status}`);
      }

      const json = await res.json().catch(() => ({}));
      const rawAvatar = json?.avatar_url || json?.data?.avatar_url || '';

      // Actualizamos el estado local inmediatamente para que no vuelva al avatar viejo
      if (rawAvatar) {
        setData((prev) => {
          const p = prev || {};
          const userPrev = p.user || {};
          return { ...p, user: { ...userPrev, avatar_url: rawAvatar } };
        });
      }

      Alert.alert('Foto actualizada');
      // Fuerza recarga (cache-bust) y luego quita la preview
      setAvatarNonce(Date.now());
      setAvatarPreviewUri(null);

      // Refresco desde servidor (por si hay más cambios)
      await loadProfile();
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo subir imagen');
    } finally { setUploading(false); }
  };

  // ------- derivados
  const user = data?.user || null;
  const stats = data?.stats || {};
  const avatarUrl = user?.avatar_url
    ? `${(String(user.avatar_url).startsWith('/') ? PUBLIC_BASE : '')}${user.avatar_url}${String(user.avatar_url).includes('?') ? '&' : '?'}v=${avatarNonce}`
    : null;

  const s = {
    matches_played: stats.matches_played ?? 0,
    goals: stats.goals ?? 0,
    assists: stats.assists ?? 0,
    mvps: stats.mvps ?? 0,
    teammate_rating: stats.teammate_rating ?? '—',
    matches_won: stats.wins ?? stats.matches_won ?? 0,
    losses: stats.losses ?? 0,
    draws: stats.draws ?? 0,
    win_rate: stats.win_rate ?? 0,
  };

  const STAT_ITEMS = useMemo(() => ([
    { key: 'matches_played', label: 'Partidos', value: s.matches_played, emoji: '🎯' },
    { key: 'goals', label: 'Goles', value: s.goals, emoji: '⚽️' },
    { key: 'assists', label: 'Asistencias', value: s.assists, emoji: '🅰️' },
    { key: 'mvps', label: 'MVPs', value: s.mvps, emoji: '🏆' },
    { key: 'teammate_rating', label: 'Nota comp.', value: s.teammate_rating, emoji: '⭐️' },
    { key: 'matches_won', label: 'Ganados', value: s.matches_won, emoji: '✅' },
    { key: 'win_rate', label: '% victoria', value: `${s.win_rate}%`, emoji: '📈' },
  ]), [s]);

  if (loading) {
    return (
      <View style={styles.loader}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={ORANGE} />
      </View>
    );
  }

  if (!data) {
    const isSession = (errMsg || '').toLowerCase().includes('sesión');
    return (
      <View style={[styles.loader, { paddingHorizontal:24 }]}>
        <Text style={{ color:'#bbb', textAlign:'center', marginBottom:12 }}>
          {errMsg || 'No se pudo cargar el perfil'}
        </Text>
        <TouchableOpacity
          onPress={() => (isSession ? goToAccess() : loadProfile())}
          style={{ backgroundColor: ORANGE, padding:12, borderRadius:10, minWidth:180 }}
        >
          <Text style={{ color:'#000', fontWeight:'800', textAlign:'center' }}>
            {isSession ? 'Ir a iniciar sesión' : 'Reintentar'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <ImageBackground source={FIELD_BG} style={styles.bg} resizeMode="cover">
        <LinearGradient colors={['rgba(8,10,14,0.78)','rgba(8,10,14,0.98)']} style={StyleSheet.absoluteFill} />

        <ScrollView
          contentContainerStyle={styles.content}
        >
          <ScreenHeader
            eyebrow="TU IDENTIDAD"
            title="Mi perfil"
            description="Gestiona tu cuenta, consulta tu saldo y sigue tu progreso en EasyFutbol."
          />

          {/* Avatar simple */}
          <View style={styles.avatarWrapper}>
            <TouchableOpacity onPress={pickImage} disabled={uploading} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Cambiar foto de perfil" accessibilityState={{ disabled: uploading, busy: uploading }}>
              {avatarPreviewUri ? (
                <Image
                  key={`preview-${avatarNonce}`}
                  source={{ uri: avatarPreviewUri }}
                  style={styles.avatarImage}
                />
              ) : avatarUrl ? (
                <Image
                  key={`remote-${avatarNonce}`}
                  source={{ uri: avatarUrl, cache: 'reload' }}
                  style={styles.avatarImage}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>
                    {(user?.name || 'Jugador')[0].toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.tapHint}>
              {uploading ? 'Subiendo foto...' : 'Toca la foto para cambiarla'}
            </Text>
            <View style={styles.profileNameRow}>
              <Text style={[styles.profileHeroName, user?.is_plus && styles.plusName]}>{user?.name || 'Jugador EasyFutbol'}</Text>
              {user?.is_plus ? <View style={styles.plusBadge}><Text style={styles.plusBadgeText}>PLUS</Text></View> : null}
            </View>
            <Text style={styles.profileHeroMeta}>Jugador #{user?.id || '—'}</Text>
          </View>

          <View style={styles.collabCard}>
            <Text style={styles.section}>COLABORACIONES</Text>
            <Text style={styles.collabTitle}>Ventajas por jugar con EasyFutbol</Text>
            <Text style={styles.collabIntro}>
              Enseña tu perfil y tu ID de jugador para disfrutar de ofertas exclusivas.
            </Text>
            <View style={styles.partnerPreviewRow}>
              <View style={styles.partnerPreviewCard}>
                <Image source={HERMINIA_LOGO} style={styles.partnerPreviewLogo} resizeMode="contain" />
                <Text style={styles.partnerPreviewOffer}>Aftergame desde 10€</Text>
              </View>
              <View style={styles.partnerPreviewCard}>
                <Image source={NUINO_LOGO} style={styles.partnerPreviewLogo} resizeMode="contain" />
                <Text style={styles.partnerPreviewOffer}>10% en servicios</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.collabBtn}
              onPress={() => { setActiveCollaboration('herminia'); setCollaborationsVisible(true); }}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.collabBtnText}>Ver colaboraciones</Text>
            </TouchableOpacity>
          </View>

          {/* Panel info */}
          <View style={styles.panel}>
            {editing ? (
              <>
                <Text style={styles.label}>Nombre</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Tu nombre" placeholderTextColor="#777" />
                <Text style={styles.label}>Email</Text>
                <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="correo@ejemplo.com" placeholderTextColor="#777" />
                <Text style={styles.label}>Contraseña</Text>
                <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor="#777" />
                <View style={{ flexDirection:'row', gap:10, marginTop: spacing(1.5) }}>
                  <TouchableOpacity style={styles.saveBtn} onPress={save}><Text style={styles.saveText}>Guardar</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditing(false); setPassword(''); }}><Text style={styles.cancelText}>Cancelar</Text></TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.name, user?.is_plus && styles.plusName]}>{user?.name}</Text>
                <Text style={styles.email}>{user?.email}</Text>
                <Text style={styles.meta}>Rol: {user?.role || 'jugador'}</Text>
                <Text style={styles.meta}>Registrado: {new Date(user?.created_at).toLocaleDateString()}</Text>
                <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}><Text style={styles.editText}>Editar perfil</Text></TouchableOpacity>
              </>
            )}
          </View>

          {/* EasyPass */}
          <View style={styles.passCard}>
            <Text style={styles.section}>🎟️ EasyPass</Text>

            <View style={styles.passHeader}>
              <View style={styles.passLogoWrap}>
                <Image source={easypassLogo} style={styles.passLogo} resizeMode="cover" />
              </View>
              <View style={styles.passHeaderText}>
                <Text style={styles.passValue}>{easyPassLoading ? '...' : easyPass}</Text>
                <Text style={styles.passHint}>Saldo total antiguo. Abajo puedes verlos separados por ciudad.</Text>
              </View>
            </View>

            <View style={styles.passLocationBox}>
              <Text style={styles.passLocationTitle}>Tus EasyPass por localización</Text>
              <Text style={styles.passLocationNote}>
                Cada EasyPass solo puede usarse en partidos de su propia ciudad.
              </Text>

              {easyPassLoading ? (
                <ActivityIndicator color={ORANGE} style={{ marginTop: 12 }} />
              ) : easyPassBalances.length > 0 ? (
                easyPassBalances.map((item) => (
                  <View key={item.locationId || item.locationName} style={styles.passLocationRow}>
                    <View>
                      <Text style={styles.passLocationName}>{item.locationName}</Text>
                      <Text style={styles.passLocationMeta}>Válidos solo para {item.locationName}</Text>
                    </View>
                    <View style={styles.passLocationBadge}>
                      <Text style={styles.passLocationAmount}>{Number(item.balance || 0)}</Text>
                      <Text style={styles.passLocationSmall}>EP</Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.passLocationEmpty}>Todavía no tienes EasyPass por ciudad.</Text>
              )}
            </View>

            <TouchableOpacity style={styles.passBtn} onPress={buyEasyPass} activeOpacity={0.85} accessibilityRole="button">
              <Text style={styles.passBtnText}>Adquirir más</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.communityCard}>
            <Text style={styles.section}>📣 Novedades EasyFutbol</Text>
            <Text style={styles.communityText}>
              Únete al grupo de tu ciudad para enterarte de todas las novedades, partidos y avisos.
            </Text>
            <View style={styles.communityActions}>
              <TouchableOpacity style={styles.communityBtn} onPress={() => openWhatsAppGroup(WHATSAPP_VALLADOLID_URL)} activeOpacity={0.85} accessibilityRole="link">
                <Text style={styles.communityBtnText}>Grupo de Valladolid</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.communityBtnSecondary} onPress={() => openWhatsAppGroup(WHATSAPP_ASTURIAS_URL)} activeOpacity={0.85} accessibilityRole="link">
                <Text style={styles.communityBtnSecondaryText}>Grupo de Asturias</Text>
              </TouchableOpacity>
            </View>
          </View>

          <LinearGradient colors={['#2A180C', '#14171C']} style={styles.referralCard}>
            <Text style={styles.referralEyebrow}>INVITA Y GANA</Text>
            <Text style={styles.referralTitle}>Tus referidos</Text>
            <Text style={styles.referralText}>Comparte tu código. Cuando un nuevo jugador se registre con él y compre su primer pack de EasyPass, sumarás 1 punto.</Text>

            <View style={styles.referralCodeBox}>
              <View>
                <Text style={styles.referralCodeLabel}>TU CÓDIGO</Text>
                <Text style={styles.referralCode}>{referralData?.referral_code || 'Cargando…'}</Text>
              </View>
              <TouchableOpacity style={styles.shareReferralBtn} onPress={shareReferralCode} disabled={!referralData?.referral_code} accessibilityRole="button">
                <Text style={styles.shareReferralText}>Compartir</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.referralProgressHeader}>
              <Text style={styles.referralProgressLabel}>Progreso para tu próximo EasyPass</Text>
              <Text style={styles.referralProgressValue}>{Number(referralData?.points || 0)}/5</Text>
            </View>
            <View style={styles.referralProgressTrack}>
              <View style={[styles.referralProgressFill, { width: `${Math.min((Number(referralData?.points || 0) / 5) * 100, 100)}%` }]} />
            </View>
            <View style={styles.referralStatsRow}>
              <Text style={styles.referralStat}>{Number(referralData?.qualified_referrals || 0)} compras válidas</Text>
              <Text style={styles.referralStat}>{Number(referralData?.rewards_earned || 0)} EasyPass ganados</Text>
            </View>
          </LinearGradient>

          <View style={styles.youtubeCard}>
            <View style={styles.youtubeHeader}>
              <View style={styles.youtubeIcon}><Text style={styles.youtubeIconText}>▶</Text></View>
              <View style={styles.youtubeCopy}>
                <Text style={styles.youtubeEyebrow}>CANAL OFICIAL</Text>
                <Text style={styles.youtubeTitle}>Partidos grabados</Text>
              </View>
            </View>
            <Text style={styles.youtubeText}>
              Revive tus partidos, jugadas y mejores momentos en el canal oficial de EasyFutbol.
            </Text>
            <TouchableOpacity style={styles.youtubeBtn} onPress={openYouTubeChannel} activeOpacity={0.85} accessibilityRole="link" accessibilityLabel="Abrir canal de YouTube de EasyFutbol">
              <Text style={styles.youtubeBtnText}>Ver partidos en YouTube</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.achievementsCard}>
            <Text style={styles.section}>🏅 Logros</Text>
            <Text style={styles.communityText}>
              Consulta tus logros desbloqueados, premios especiales y el progreso de tus puntos EasyFutbol.
            </Text>
            <TouchableOpacity
              style={styles.achievementsBtn}
              onPress={() => navigation.navigate('Achievements')}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.achievementsBtnText}>Ver mis logros</Text>
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={styles.statsCard}>
            <Text style={styles.section}>📊 Estadísticas</Text>
            <View style={styles.grid}>
              {STAT_ITEMS.map(item => (
                <View key={item.key} style={styles.gridItem}>
                  <Text style={styles.gridValue}>{item.value}</Text>
                  <Text style={styles.gridLabel}>{item.emoji} {item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <Modal
            visible={collaborationsVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setCollaborationsVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalEyebrow}>EasyFutbol</Text>
                    <Text style={styles.modalTitle}>Colaboraciones activas</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={() => setCollaborationsVisible(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalCloseText}>×</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.playerIdBox}>
                  <Text style={styles.playerIdLabel}>Tu ID de jugador</Text>
                  <Text style={styles.playerIdValue}>#{user?.id || '—'}</Text>
                  <Text style={styles.playerIdHint}>Muéstralo en el local para que puedan apuntar tu usuario.</Text>
                </View>

                <View style={styles.collaborationTabs}>
                  <TouchableOpacity
                    style={[styles.collaborationTab, activeCollaboration === 'herminia' && styles.collaborationTabActive]}
                    onPress={() => setActiveCollaboration('herminia')}
                    activeOpacity={0.85}
                    accessibilityRole="tab"
                    accessibilityLabel="La Herminia, ofertas de aftergame"
                    accessibilityState={{ selected: activeCollaboration === 'herminia' }}
                  >
                    <View style={styles.collaborationTabLogoWrap}>
                      <Image source={HERMINIA_LOGO} style={styles.collaborationTabLogo} resizeMode="contain" />
                    </View>
                    <Text style={[styles.collaborationTabSub, activeCollaboration === 'herminia' && styles.collaborationTabSubActive]}>
                      Aftergame
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.collaborationTab, activeCollaboration === 'nuino' && styles.collaborationTabActive]}
                    onPress={() => setActiveCollaboration('nuino')}
                    activeOpacity={0.85}
                    accessibilityRole="tab"
                    accessibilityLabel="Nuino, descuento en servicios para botas"
                    accessibilityState={{ selected: activeCollaboration === 'nuino' }}
                  >
                    <View style={styles.collaborationTabLogoWrap}>
                      <Image source={NUINO_LOGO} style={styles.collaborationTabLogo} resizeMode="contain" />
                    </View>
                    <Text style={[styles.collaborationTabSub, activeCollaboration === 'nuino' && styles.collaborationTabSubActive]}>
                      Botas
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.collaborationContentScroll} showsVerticalScrollIndicator={false}>
                  {activeCollaboration === 'herminia' ? (
                    <View style={styles.collaborationItemLarge}>
                      <View style={styles.collaborationBrandHero}>
                        <Image source={HERMINIA_LOGO} style={styles.collaborationBrandLogo} resizeMode="contain" />
                      </View>
                      <View style={styles.collaborationTopRow}>
                        <Text style={styles.collaborationNameLarge}>La Herminia</Text>
                        <Text style={styles.collaborationTag}>Aftergame</Text>
                      </View>
                      <Text style={styles.collaborationTextLarge}>
                        Enseña tu perfil de EasyFutbol y tu ID de jugador para disfrutar de estas ofertas después del partido.
                      </Text>

                      <View style={styles.offerCard}>
                        <Text style={styles.offerTitle}>4 cañas + cazurras</Text>
                        <Text style={styles.offerPrice}>12€</Text>
                      </View>

                      <View style={styles.offerCard}>
                        <Text style={styles.offerTitle}>Hamburguesa + caña</Text>
                        <Text style={styles.offerPrice}>10€</Text>
                      </View>

                      <View style={styles.offerCard}>
                        <Text style={styles.offerTitle}>Pizza + caña</Text>
                        <Text style={styles.offerPrice}>10€</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.collaborationItemLarge}>
                      <View style={styles.collaborationBrandHero}>
                        <Image source={NUINO_LOGO} style={styles.collaborationBrandLogo} resizeMode="contain" />
                      </View>
                      <View style={styles.collaborationTopRow}>
                        <Text style={styles.collaborationNameLarge}>Nuino</Text>
                        <Text style={styles.collaborationTag}>Botas</Text>
                      </View>
                      <Text style={styles.collaborationTextLarge}>Da una segunda vida a tus botas.</Text>

                      <View style={styles.offerCard}>
                        <Text style={styles.offerTitle}>Descuento EasyFutbol</Text>
                        <Text style={styles.offerPrice}>10%</Text>
                        <Text style={styles.offerSmall}>En todos los servicios</Text>
                      </View>
                    </View>
                  )}
                </ScrollView>

                <TouchableOpacity
                  style={styles.modalPrimaryBtn}
                  onPress={() => setCollaborationsVisible(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalPrimaryBtnText}>Entendido</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <TouchableOpacity style={styles.logoutBtn} onPress={logout} accessibilityRole="button">
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={deleteAccount} accessibilityRole="button">
            <Text style={styles.deleteText}>Eliminar cuenta</Text>
          </TouchableOpacity>
        </ScrollView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  loader:{ flex:1, backgroundColor:colors.background, alignItems:'center', justifyContent:'center' },
  screen:{ flex:1, backgroundColor:colors.background },
  bg:{ flex:1 },
  content:{ width:'100%', maxWidth:layout.maxContentWidth, alignSelf:'center', paddingHorizontal:spacing(2), paddingTop:spacing(1), paddingBottom:spacing(6) },
  tapHint:{ color:colors.textSubtle, ...typography.caption, marginTop:spacing(1) },

  avatarWrapper: {
    alignItems: 'center',
    marginBottom: spacing(2),
    padding: spacing(2.5),
    borderRadius: radii.xlarge,
    backgroundColor: 'rgba(17,21,27,0.92)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarImage: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 3,
    borderColor: ORANGE,
    backgroundColor: colors.surface,
  },
  avatarPlaceholder: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 3,
    borderColor: ORANGE,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '900',
  },
  profileHeroName:{ color:colors.white, ...typography.heading, marginTop:spacing(1.5), textAlign:'center' },
  profileNameRow:{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:spacing(0.75) },
  plusName:{ color:'#F4C95D' },
  plusBadge:{ backgroundColor:'#F4C95D', borderRadius:radii.pill, paddingHorizontal:7, paddingVertical:3, marginTop:spacing(1.5) },
  plusBadgeText:{ color:'#161109', fontSize:8, fontWeight:'900', letterSpacing:0.8 },
  profileHeroMeta:{ color:colors.orange, ...typography.overline, marginTop:spacing(0.5) },

  panel:{ backgroundColor:'rgba(17,21,27,0.94)', borderRadius:radii.large, padding:spacing(2), borderWidth:1, borderColor:colors.border, marginBottom:spacing(2) },

  name:{ color:'#fff', fontSize:18, fontWeight:'800', marginBottom:2 },
  email:{ color:'#bbb', fontSize:13, marginBottom:4 },
  meta:{ color:'#999', fontSize:12, marginBottom:2 },
  label:{ color:'#ddd', fontWeight:'700', marginTop: spacing(0.5), marginBottom:4 },
  input:{ minHeight:52, backgroundColor:colors.surfaceElevated, color:colors.white, padding:spacing(1.2), borderRadius:radii.medium, borderWidth:1, borderColor:colors.border, marginBottom:spacing(1) },
  editBtn:{ minHeight:layout.minTouchTarget, backgroundColor:colors.surfaceElevated, padding:spacing(1.4), borderRadius:radii.medium, marginTop:spacing(1.5), justifyContent:'center' },
  editText:{ color:'#fff', fontWeight:'800', textAlign:'center' },
  saveBtn:{ flex:1, minHeight:layout.minTouchTarget, backgroundColor:ORANGE, padding:spacing(1.4), borderRadius:radii.medium, justifyContent:'center' },
  saveText:{ color:'#000', fontWeight:'900', textAlign:'center' },
  cancelBtn:{ flex:1, minHeight:layout.minTouchTarget, backgroundColor:colors.surfaceElevated, padding:spacing(1.4), borderRadius:radii.medium, justifyContent:'center' },
  cancelText:{ color:'#fff', fontWeight:'800', textAlign:'center' },

  statsCard:{ backgroundColor:'rgba(17,21,27,0.94)', borderRadius:radii.large, padding:spacing(2), borderWidth:1, borderColor:colors.border },
  section:{ color:ORANGE, ...typography.overline, marginBottom:spacing(1.25) },
  passCard:{ backgroundColor:'rgba(17,21,27,0.94)', borderRadius:radii.large, padding:spacing(2), borderWidth:1, borderColor:'rgba(255,90,0,0.30)', marginBottom:spacing(2) },
  passHeader:{ flexDirection:'row', alignItems:'center', marginBottom:14 },
  passLogoWrap:{ width:72, height:72, borderRadius:36, marginRight:14, backgroundColor:'transparent', overflow:'hidden', alignItems:'center', justifyContent:'center' },
  passLogo:{ width:'100%', height:'100%' },
  passHeaderText:{ flex:1 },
  passValue:{ color:'#fff', fontSize:28, fontWeight:'900', marginBottom:4 },
  passHint:{ color:'#9f9f9f', fontSize:12, fontWeight:'700' },
  passLocationBox:{
    backgroundColor:'rgba(255,90,0,0.08)',
    borderWidth:1,
    borderColor:'rgba(255,90,0,0.28)',
    borderRadius:14,
    padding:12,
    marginBottom:14,
  },
  passLocationTitle:{ color:'#fff', fontSize:15, fontWeight:'900', marginBottom:4 },
  passLocationNote:{ color:'#bdbdbd', fontSize:12, fontWeight:'700', lineHeight:18, marginBottom:10 },
  passLocationRow:{
    flexDirection:'row',
    justifyContent:'space-between',
    alignItems:'center',
    backgroundColor:'rgba(0,0,0,0.25)',
    borderWidth:1,
    borderColor:'rgba(255,255,255,0.06)',
    borderRadius:12,
    paddingVertical:11,
    paddingHorizontal:12,
    marginTop:8,
  },
  passLocationName:{ color:'#fff', fontSize:14, fontWeight:'900' },
  passLocationMeta:{ color:'#9f9f9f', fontSize:11, fontWeight:'700', marginTop:3 },
  passLocationBadge:{
    minWidth:58,
    paddingVertical:7,
    paddingHorizontal:10,
    borderRadius:12,
    backgroundColor:ORANGE,
    alignItems:'center',
  },
  passLocationAmount:{ color:'#000', fontSize:18, fontWeight:'900', lineHeight:20 },
  passLocationSmall:{ color:'#000', fontSize:10, fontWeight:'900', marginTop:1 },
  passLocationEmpty:{ color:'#bdbdbd', fontSize:12, fontWeight:'700', textAlign:'center', marginTop:8 },
  passBtn:{ minHeight:layout.minTouchTarget, backgroundColor:ORANGE, paddingVertical:12, paddingHorizontal:14, borderRadius:radii.medium, alignItems:'center', justifyContent:'center' },
  passBtnText:{ color:'#000', fontWeight:'900' },
  collabCard:{ backgroundColor:'rgba(17,21,27,0.94)', borderRadius:radii.large, padding:spacing(2), borderWidth:1, borderColor:'rgba(255,90,0,0.24)', marginBottom:spacing(2) },
  collabTitle:{ color:colors.white, ...typography.heading, marginBottom:spacing(0.75) },
  collabIntro:{ color:'#bdbdbd', fontSize:13, lineHeight:20, marginBottom:14, fontWeight:'700' },
  partnerPreviewRow:{ flexDirection:'row', gap:spacing(1), marginBottom:spacing(1.5) },
  partnerPreviewCard:{ flex:1, minHeight:112, padding:spacing(1.25), borderRadius:radii.medium, backgroundColor:'#090B0F', justifyContent:'space-between', borderWidth:1, borderColor:colors.border },
  partnerPreviewLogo:{ width:'100%', height:44 },
  partnerPreviewOffer:{ color:colors.white, fontSize:11, fontWeight:'900', textAlign:'center', marginTop:spacing(0.75) },
  collabBtn:{ minHeight:layout.minTouchTarget, backgroundColor:ORANGE, paddingVertical:14, paddingHorizontal:16, borderRadius:radii.medium, justifyContent:'center' },
  collabBtnText:{ color:'#000', fontWeight:'900', textAlign:'center' },

  modalOverlay:{ flex:1, backgroundColor:'rgba(0,0,0,0.78)', alignItems:'center', justifyContent:'center', padding:20 },
  modalCard:{ width:'100%', maxWidth:520, maxHeight:'88%', backgroundColor:'#111', borderRadius:24, padding:20, borderWidth:1, borderColor:'rgba(255,90,0,0.35)' },
  modalHeader:{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 },
  modalEyebrow:{ color:ORANGE, fontSize:12, fontWeight:'900', textTransform:'uppercase', letterSpacing:0.6 },
  modalTitle:{ color:'#fff', fontSize:20, fontWeight:'900', marginTop:3 },
  modalCloseBtn:{ width:36, height:36, borderRadius:18, backgroundColor:'#222', alignItems:'center', justifyContent:'center' },
  modalCloseText:{ color:'#fff', fontSize:26, fontWeight:'800', lineHeight:28 },
  playerIdBox:{ backgroundColor:'rgba(255,90,0,0.10)', borderWidth:1, borderColor:'rgba(255,90,0,0.35)', borderRadius:14, padding:13, marginBottom:12 },
  playerIdLabel:{ color:'#bdbdbd', fontSize:12, fontWeight:'800' },
  playerIdValue:{ color:'#fff', fontSize:30, fontWeight:'900', marginTop:2 },
  playerIdHint:{ color:'#d8d8d8', fontSize:12, fontWeight:'700', lineHeight:17, marginTop:4 },
  collaborationTabs:{ flexDirection:'row', gap:10, marginBottom:12 },
  collaborationTab:{ flex:1, minHeight:88, backgroundColor:colors.surfaceElevated, borderWidth:1, borderColor:colors.border, borderRadius:radii.medium, paddingVertical:10, paddingHorizontal:8, alignItems:'center', justifyContent:'center' },
  collaborationTabActive:{ backgroundColor:'rgba(255,90,0,0.12)', borderColor:ORANGE },
  collaborationTabLogoWrap:{ width:'100%', height:40, borderRadius:radii.small, backgroundColor:'#090B0F', paddingHorizontal:6, justifyContent:'center', marginBottom:5 },
  collaborationTabLogo:{ width:'100%', height:30 },
  collaborationTabText:{ color:'#fff', fontSize:14, fontWeight:'900' },
  collaborationTabTextActive:{ color:'#000' },
  collaborationTabSub:{ color:'#999', fontSize:10, fontWeight:'800', marginTop:3 },
  collaborationTabSubActive:{ color:ORANGE },
  collaborationContentScroll:{ maxHeight:320, marginBottom:8 },
  collaborationItemLarge:{ backgroundColor:'#171717', borderRadius:16, borderWidth:1, borderColor:'rgba(255,255,255,0.07)', padding:15, marginBottom:10 },
  collaborationBrandHero:{ width:'100%', height:72, borderRadius:radii.medium, backgroundColor:'#090B0F', paddingHorizontal:spacing(2), justifyContent:'center', marginBottom:spacing(1.5), borderWidth:1, borderColor:colors.border },
  collaborationBrandLogo:{ width:'100%', height:48 },
  collaborationNameLarge:{ color:'#fff', fontSize:19, fontWeight:'900', flex:1 },
  collaborationTextLarge:{ color:'#eaeaea', fontSize:14, fontWeight:'800', lineHeight:21, marginBottom:12 },
  offerCard:{ backgroundColor:'rgba(255,90,0,0.09)', borderWidth:1, borderColor:'rgba(255,90,0,0.24)', borderRadius:14, padding:13, marginTop:8 },
  offerTitle:{ color:'#fff', fontSize:15, fontWeight:'900' },
  offerPrice:{ color:ORANGE, fontSize:25, fontWeight:'900', marginTop:3 },
  offerSmall:{ color:'#bdbdbd', fontSize:12, fontWeight:'700', marginTop:2 },
  collaborationItem:{ backgroundColor:'#171717', borderRadius:14, borderWidth:1, borderColor:'rgba(255,255,255,0.07)', padding:13, marginBottom:10 },
  collaborationTopRow:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:8 },
  collaborationName:{ color:'#fff', fontSize:16, fontWeight:'900', flex:1 },
  collaborationTag:{ color:'#000', backgroundColor:ORANGE, overflow:'hidden', borderRadius:10, paddingHorizontal:9, paddingVertical:4, fontSize:11, fontWeight:'900' },
  collaborationText:{ color:'#eaeaea', fontSize:13, fontWeight:'800', lineHeight:19, marginBottom:4 },
  collaborationBullet:{ color:'#bdbdbd', fontSize:13, fontWeight:'700', lineHeight:20 },
  modalPrimaryBtn:{ backgroundColor:ORANGE, borderRadius:12, paddingVertical:13, marginTop:4 },
  modalPrimaryBtnText:{ color:'#000', fontWeight:'900', textAlign:'center' },
  communityCard:{ backgroundColor:'rgba(17,21,27,0.94)', borderRadius:radii.large, padding:spacing(2), borderWidth:1, borderColor:colors.border, marginBottom:spacing(2) },
  communityText:{ color:'#bdbdbd', fontSize:13, lineHeight:20, marginBottom:14 },
  communityActions:{ gap:spacing(1) },
  communityBtn:{ minHeight:layout.minTouchTarget, backgroundColor:'#25D366', paddingVertical:14, paddingHorizontal:16, borderRadius:radii.medium, justifyContent:'center' },
  communityBtnText:{ color:'#000', fontWeight:'900', textAlign:'center' },
  communityBtnSecondary:{ minHeight:layout.minTouchTarget, backgroundColor:'rgba(37,211,102,0.10)', borderWidth:1, borderColor:'rgba(37,211,102,0.45)', paddingVertical:14, paddingHorizontal:16, borderRadius:radii.medium, justifyContent:'center' },
  communityBtnSecondaryText:{ color:'#69E99A', fontWeight:'900', textAlign:'center' },
  referralCard:{ borderRadius:radii.large, padding:spacing(2), borderWidth:1, borderColor:'rgba(255,90,0,0.28)', marginBottom:spacing(2) },
  referralEyebrow:{ color:colors.orange, ...typography.overline },
  referralTitle:{ color:colors.white, ...typography.heading, marginTop:3 },
  referralText:{ color:colors.textMuted, ...typography.body, marginTop:spacing(0.75) },
  referralCodeBox:{ minHeight:72, flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:spacing(1), backgroundColor:'rgba(0,0,0,0.24)', borderRadius:radii.medium, borderWidth:1, borderColor:colors.border, padding:spacing(1.25), marginTop:spacing(1.5) },
  referralCodeLabel:{ color:colors.textSubtle, ...typography.overline, fontSize:9 },
  referralCode:{ color:colors.orange, fontSize:22, fontWeight:'900', letterSpacing:1.4, marginTop:2 },
  shareReferralBtn:{ minHeight:42, justifyContent:'center', backgroundColor:colors.orange, borderRadius:radii.small, paddingHorizontal:spacing(1.25) },
  shareReferralText:{ color:colors.black, fontWeight:'900' },
  referralProgressHeader:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:spacing(1.5), marginBottom:spacing(0.75) },
  referralProgressLabel:{ flex:1, color:colors.white, ...typography.caption },
  referralProgressValue:{ color:colors.orange, fontWeight:'900' },
  referralProgressTrack:{ height:8, borderRadius:radii.pill, backgroundColor:colors.surfaceElevated, overflow:'hidden' },
  referralProgressFill:{ height:'100%', borderRadius:radii.pill, backgroundColor:colors.orange },
  referralStatsRow:{ flexDirection:'row', justifyContent:'space-between', flexWrap:'wrap', gap:spacing(0.75), marginTop:spacing(1) },
  referralStat:{ color:colors.textMuted, ...typography.caption },
  youtubeCard:{ backgroundColor:'rgba(17,21,27,0.94)', borderRadius:radii.large, padding:spacing(2), borderWidth:1, borderColor:'rgba(255,0,0,0.25)', marginBottom:spacing(2) },
  youtubeHeader:{ flexDirection:'row', alignItems:'center', gap:spacing(1.25) },
  youtubeIcon:{ width:46, height:46, borderRadius:15, alignItems:'center', justifyContent:'center', backgroundColor:'#FF0000' },
  youtubeIconText:{ color:'#fff', fontSize:19, fontWeight:'900', marginLeft:2 },
  youtubeCopy:{ flex:1 },
  youtubeEyebrow:{ color:'#FF6B6B', ...typography.overline, fontSize:9 },
  youtubeTitle:{ color:colors.white, ...typography.heading, marginTop:2 },
  youtubeText:{ color:colors.textMuted, ...typography.body, marginTop:spacing(1.25) },
  youtubeBtn:{ minHeight:layout.minTouchTarget, backgroundColor:'#FF0000', borderRadius:radii.medium, alignItems:'center', justifyContent:'center', paddingHorizontal:spacing(1.5), marginTop:spacing(1.5) },
  youtubeBtnText:{ color:'#fff', ...typography.bodyStrong, fontWeight:'900' },
  achievementsCard:{ backgroundColor:'rgba(17,21,27,0.94)', borderRadius:radii.large, padding:spacing(2), borderWidth:1, borderColor:colors.border, marginBottom:spacing(2) },
  achievementsBtn:{ minHeight:layout.minTouchTarget, backgroundColor:ORANGE, paddingVertical:14, paddingHorizontal:16, borderRadius:radii.medium, justifyContent:'center' },
  achievementsBtnText:{ color:'#000', fontWeight:'900', textAlign:'center' },
  grid:{ flexDirection:'row', flexWrap:'wrap', columnGap:10, rowGap:10, justifyContent:'space-between' },
  gridItem:{ width:'48%', minHeight:92, backgroundColor:colors.surfaceElevated, borderRadius:radii.medium, paddingVertical:14, paddingHorizontal:12, borderWidth:1, borderColor:colors.border, justifyContent:'center' },
  gridValue:{ color:colors.orange, fontSize:24, fontWeight:'900', marginBottom:4 },
  gridLabel:{ color:'#bdbdbd', fontSize:12, fontWeight:'700' },

  logoutBtn:{ minHeight:layout.minTouchTarget, backgroundColor:ORANGE, padding:spacing(1.5), borderRadius:radii.medium, marginTop:spacing(2), justifyContent:'center' },
  logoutText:{ color:'#000', fontWeight:'900', textAlign:'center' },
  deleteBtn:{ minHeight:layout.minTouchTarget, backgroundColor:'#2b0b0b', padding:spacing(1.5), borderRadius:radii.medium, marginTop:spacing(1.2), borderWidth:1, borderColor:'rgba(255,92,92,0.35)', justifyContent:'center' },
  deleteText:{ color:'#ffb3a8', fontWeight:'900', textAlign:'center' },
});
