// src/screens/ProfileScreen.js
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, StatusBar, ActivityIndicator, TouchableOpacity,
  Alert, TextInput, ScrollView, ImageBackground, Image, Linking, Modal
} from 'react-native';
import { colors, spacing } from '../theme';
import { api } from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useFocusEffect, CommonActions } from '@react-navigation/native';
import easypassLogo from '../../assets/easypass-logo.png';

const ORANGE = '#ff5a00';
const WHATSAPP_GROUP_URL = 'https://chat.whatsapp.com/HWUQF9eynLvD2XhiPgR01c?mode=gi_t';
const FIELD_BG = {
  uri: 'https://images.unsplash.com/photo-1486286701208-1d58e9338013?q=80&w=2400&auto=format&fit=crop'
};

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

  const openWhatsAppGroup = async () => {
    try {
      const supported = await Linking.canOpenURL(WHATSAPP_GROUP_URL);
      if (!supported) throw new Error('No se pudo abrir el enlace');
      await Linking.openURL(WHATSAPP_GROUP_URL);
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo abrir el grupo de WhatsApp');
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
    <View style={{ flex:1, backgroundColor: colors.black }}>
      <StatusBar barStyle="light-content" />
      <ImageBackground source={FIELD_BG} style={styles.bg} resizeMode="cover">
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(0,0,0,0.45)','rgba(0,0,0,0.9)']} style={StyleSheet.absoluteFill} />

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing(2),
            paddingTop: spacing(2),
            paddingBottom: spacing(6),
          }}
        >
          <Text style={styles.title}>Mi Perfil</Text>

          {/* Avatar simple */}
          <View style={styles.avatarWrapper}>
            <TouchableOpacity onPress={pickImage} disabled={uploading} activeOpacity={0.85}>
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
          </View>

          <View style={styles.collabCard}>
            <Text style={styles.section}>🤝 Colaboraciones</Text>
            <Text style={styles.collabIntro}>
              Enseña tu perfil de EasyFutbol y tu ID de jugador para acceder a las colaboraciones activas.
            </Text>
            <TouchableOpacity
              style={styles.collabBtn}
              onPress={() => { setActiveCollaboration('herminia'); setCollaborationsVisible(true); }}
              activeOpacity={0.85}
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
                <Text style={styles.name}>{user?.name}</Text>
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

            <TouchableOpacity style={styles.passBtn} onPress={buyEasyPass} activeOpacity={0.85}>
              <Text style={styles.passBtnText}>Adquirir más</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.communityCard}>
            <Text style={styles.section}>📣 Novedades EasyFutbol</Text>
            <Text style={styles.communityText}>
              Únete al grupo de WhatsApp para enterarte de todas las novedades, partidos y avisos.
            </Text>
            <TouchableOpacity style={styles.communityBtn} onPress={openWhatsAppGroup} activeOpacity={0.85}>
              <Text style={styles.communityBtnText}>Entrar al grupo de WhatsApp</Text>
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
                  >
                    <Text style={[styles.collaborationTabText, activeCollaboration === 'herminia' && styles.collaborationTabTextActive]}>
                      La Herminia
                    </Text>
                    <Text style={[styles.collaborationTabSub, activeCollaboration === 'herminia' && styles.collaborationTabSubActive]}>
                      Aftergame
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.collaborationTab, activeCollaboration === 'nuino' && styles.collaborationTabActive]}
                    onPress={() => setActiveCollaboration('nuino')}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.collaborationTabText, activeCollaboration === 'nuino' && styles.collaborationTabTextActive]}>
                      Nuino
                    </Text>
                    <Text style={[styles.collaborationTabSub, activeCollaboration === 'nuino' && styles.collaborationTabSubActive]}>
                      Botas
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.collaborationContentScroll} showsVerticalScrollIndicator={false}>
                  {activeCollaboration === 'herminia' ? (
                    <View style={styles.collaborationItemLarge}>
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

          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={deleteAccount}>
            <Text style={styles.deleteText}>Eliminar cuenta</Text>
          </TouchableOpacity>
        </ScrollView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  loader:{ flex:1, backgroundColor:'#000', alignItems:'center', justifyContent:'center' },
  bg:{ flex:1 },
  title:{ color:'#fff', fontSize:22, fontWeight:'800', textAlign:'center', marginBottom: spacing(1) },
  tapHint:{ color:'#bbb', fontSize:12, marginTop:8 },

  avatarWrapper: {
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  avatarImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: ORANGE,
    backgroundColor: '#111',
  },
  avatarPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: ORANGE,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '900',
  },

  panel:{ backgroundColor:'rgba(17,17,17,0.9)', borderRadius:16, padding: spacing(2), borderWidth:1, borderColor:'rgba(255,255,255,0.06)', marginBottom: spacing(2) },

  name:{ color:'#fff', fontSize:18, fontWeight:'800', marginBottom:2 },
  email:{ color:'#bbb', fontSize:13, marginBottom:4 },
  meta:{ color:'#999', fontSize:12, marginBottom:2 },
  label:{ color:'#ddd', fontWeight:'700', marginTop: spacing(0.5), marginBottom:4 },
  input:{ backgroundColor:'#1f1f1f', color:'#fff', padding: spacing(1.2), borderRadius:12, borderWidth:1, borderColor:'rgba(255,255,255,0.06)', marginBottom: spacing(1) },
  editBtn:{ backgroundColor:'#2a2a2a', padding: spacing(1.4), borderRadius:12, marginTop: spacing(1.5) },
  editText:{ color:'#fff', fontWeight:'800', textAlign:'center' },
  saveBtn:{ flex:1, backgroundColor: ORANGE, padding: spacing(1.4), borderRadius:12 },
  saveText:{ color:'#000', fontWeight:'900', textAlign:'center' },
  cancelBtn:{ flex:1, backgroundColor:'#333', padding: spacing(1.4), borderRadius:12 },
  cancelText:{ color:'#fff', fontWeight:'800', textAlign:'center' },

  statsCard:{ backgroundColor:'rgba(17,17,17,0.92)', borderRadius:16, padding: spacing(2), borderWidth:1, borderColor:'rgba(255,255,255,0.06)' },
  section:{ color: ORANGE, fontWeight:'800', marginBottom:10, fontSize:14 },
  passCard:{ backgroundColor:'rgba(17,17,17,0.92)', borderRadius:16, padding: spacing(2), borderWidth:1, borderColor:'rgba(255,255,255,0.06)', marginBottom: spacing(2) },
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
  passBtn:{ backgroundColor: ORANGE, paddingVertical:12, paddingHorizontal:14, borderRadius:12, alignItems:'center' },
  passBtnText:{ color:'#000', fontWeight:'900' },
  collabCard:{ backgroundColor:'rgba(17,17,17,0.92)', borderRadius:16, padding: spacing(2), borderWidth:1, borderColor:'rgba(255,90,0,0.18)', marginBottom: spacing(2) },
  collabIntro:{ color:'#bdbdbd', fontSize:13, lineHeight:20, marginBottom:14, fontWeight:'700' },
  collabBtn:{ backgroundColor: ORANGE, paddingVertical:14, paddingHorizontal:16, borderRadius:12 },
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
  collaborationTab:{ flex:1, backgroundColor:'#171717', borderWidth:1, borderColor:'rgba(255,255,255,0.08)', borderRadius:14, paddingVertical:12, paddingHorizontal:10, alignItems:'center' },
  collaborationTabActive:{ backgroundColor:ORANGE, borderColor:ORANGE },
  collaborationTabText:{ color:'#fff', fontSize:14, fontWeight:'900' },
  collaborationTabTextActive:{ color:'#000' },
  collaborationTabSub:{ color:'#999', fontSize:10, fontWeight:'800', marginTop:3 },
  collaborationTabSubActive:{ color:'#2a1000' },
  collaborationContentScroll:{ maxHeight:320, marginBottom:8 },
  collaborationItemLarge:{ backgroundColor:'#171717', borderRadius:16, borderWidth:1, borderColor:'rgba(255,255,255,0.07)', padding:15, marginBottom:10 },
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
  communityCard:{ backgroundColor:'rgba(17,17,17,0.92)', borderRadius:16, padding: spacing(2), borderWidth:1, borderColor:'rgba(255,255,255,0.06)', marginBottom: spacing(2) },
  communityText:{ color:'#bdbdbd', fontSize:13, lineHeight:20, marginBottom:14 },
  communityBtn:{ backgroundColor:'#25D366', paddingVertical:14, paddingHorizontal:16, borderRadius:12 },
  communityBtnText:{ color:'#000', fontWeight:'900', textAlign:'center' },
  achievementsCard:{ backgroundColor:'rgba(17,17,17,0.92)', borderRadius:16, padding: spacing(2), borderWidth:1, borderColor:'rgba(255,255,255,0.06)', marginBottom: spacing(2) },
  achievementsBtn:{ backgroundColor: ORANGE, paddingVertical:14, paddingHorizontal:16, borderRadius:12 },
  achievementsBtnText:{ color:'#000', fontWeight:'900', textAlign:'center' },
  grid:{ flexDirection:'row', flexWrap:'wrap', columnGap:10, rowGap:10, justifyContent:'space-between' },
  gridItem:{ width:'48%', backgroundColor:'#121212', borderRadius:14, paddingVertical:14, paddingHorizontal:12, borderWidth:1, borderColor:'rgba(255,255,255,0.05)' },
  gridValue:{ color:'#fff', fontSize:20, fontWeight:'900', marginBottom:4 },
  gridLabel:{ color:'#bdbdbd', fontSize:12, fontWeight:'700' },

  logoutBtn:{ backgroundColor: ORANGE, padding: spacing(1.5), borderRadius:12, marginTop: spacing(2) },
  logoutText:{ color:'#000', fontWeight:'900', textAlign:'center' },
  deleteBtn:{ backgroundColor: '#2b0b0b', padding: spacing(1.5), borderRadius:12, marginTop: spacing(1.2), borderWidth:1, borderColor:'rgba(255,90,0,0.35)' },
  deleteText:{ color:'#ffb3a8', fontWeight:'900', textAlign:'center' },
});