// Añadir amigos en persona: "Mi código" enseña tu QR (se renueva solo, cada
// token vale 15 minutos) y "Escanear" lee el de otro jugador y os hace amigos
// al momento.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import ScreenHeader from '../components/ScreenHeader';
import { SocialAvatar } from '../components/social/SocialComponents';
import { connectByFriendQr, parseFriendQr } from '../utils/friendQr';

const REFRESH_MS = 12 * 60 * 1000;

export default function FriendQrScreen({ navigation, route }) {
  const [mode, setMode] = useState(route.params?.mode === 'scan' ? 'scan' : 'code');
  const [me, setMe] = useState(null);
  const [qr, setQr] = useState(null);
  const [qrError, setQrError] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [connecting, setConnecting] = useState(false);
  const [added, setAdded] = useState(null);
  const scanLock = useRef(false);

  const loadQr = useCallback(async () => {
    try {
      setQrError(null);
      const res = await api.get('/social/qr');
      setQr(res.data);
    } catch (error) {
      setQrError(error.response?.data?.msg || 'No se pudo crear tu QR');
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('user').then((raw) => setMe(raw ? JSON.parse(raw) : null)).catch(() => {});
  }, []);

  // Mientras la pantalla está abierta el QR se renueva antes de caducar.
  useFocusEffect(useCallback(() => {
    if (mode !== 'code') return undefined;
    loadQr();
    const timer = setInterval(loadQr, REFRESH_MS);
    return () => clearInterval(timer);
  }, [mode, loadQr]));

  const onScanned = async ({ data }) => {
    if (scanLock.current) return;
    const parsed = parseFriendQr(data);
    if (!parsed) return; // Otros QR se ignoran sin molestar.
    scanLock.current = true;
    if (!parsed.token) {
      navigation.navigate('PlayerSocialProfile', { slug: parsed.slug });
      return;
    }
    try {
      setConnecting(true);
      setAdded(await connectByFriendQr(parsed.slug, parsed.token));
    } catch (error) {
      Alert.alert('Añadir amigo', error.response?.data?.msg || 'No se pudo añadir', [{ text: 'Vale', onPress: () => { scanLock.current = false; } }]);
    } finally {
      setConnecting(false);
    }
  };

  const scanAgain = () => { setAdded(null); scanLock.current = false; };

  return (
    <View style={styles.page}>
      <ScreenHeader
        eyebrow="AÑADIR EN PERSONA"
        title="Código QR"
        description="Enseña tu código o escanea el de otro jugador para ser amigos al momento."
        action={<TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver"><Ionicons name="chevron-back" size={20} color="#fff" /></TouchableOpacity>}
      />

      <View style={styles.tabs}>
        {[['code', 'Mi código', 'qr-code-outline'], ['scan', 'Escanear', 'scan-outline']].map(([key, label, icon]) => (
          <TouchableOpacity key={key} onPress={() => { setMode(key); scanAgain(); }} style={[styles.tab, mode === key && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: mode === key }}>
            <Ionicons name={icon} size={17} color={mode === key ? '#fff' : '#999'} />
            <Text style={[styles.tabText, mode === key && styles.tabTextOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'code' ? (
        <View style={styles.body}>
          <View style={styles.codeCard}>
            <SocialAvatar uri={me?.avatar_url} name={me?.name} size={58} />
            <Text style={styles.codeName} numberOfLines={1}>{me?.name || 'Tu perfil'}</Text>
            <View style={styles.qrBox}>
              {qr?.url ? <QRCode value={qr.url} size={220} backgroundColor="#ffffff" color="#0b0b0d" ecl="M" />
                : qrError ? <Text style={styles.error}>{qrError}</Text>
                : <ActivityIndicator color="#ff5a00" />}
            </View>
            <Text style={styles.codeHint}>Quien lo escanee desde EasyFutbol será tu amigo al instante. El código cambia cada pocos minutos.</Text>
          </View>
          {qr?.url ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => Share.share({ message: `⚽ Añádeme en EasyFutbol: ${qr.url}` })} accessibilityRole="button">
              <Ionicons name="share-social" size={17} color="#fff" />
              <Text style={styles.secondaryText}>Enviar por WhatsApp u otra app</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : !permission ? (
        <ActivityIndicator color="#ff5a00" style={{ marginTop: 40 }} />
      ) : !permission.granted ? (
        <View style={styles.permission}>
          <Ionicons name="camera-outline" size={40} color="#ff5a00" />
          <Text style={styles.permissionTitle}>Necesitamos la cámara</Text>
          <Text style={styles.permissionText}>Solo para leer el código QR de otros jugadores.</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{permission.canAskAgain ? 'Permitir cámara' : 'Abrir ajustes'}</Text>
          </TouchableOpacity>
        </View>
      ) : added ? (
        <View style={styles.permission}>
          <View style={styles.successIcon}><Ionicons name="checkmark" size={36} color="#fff" /></View>
          <Text style={styles.permissionTitle}>{added.already ? `Ya erais amigos` : `¡${added.name} y tú ya sois amigos!`}</Text>
          <Text style={styles.permissionText}>{added.already ? `${added.name} ya estaba en tu lista.` : 'Ya podéis veros en partidos, invitaros y comparar estadísticas.'}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('PlayerSocialProfile', { userId: added.user_id })} accessibilityRole="button">
            <Text style={styles.primaryText}>Ver su perfil</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkButton} onPress={scanAgain} accessibilityRole="button">
            <Text style={styles.linkText}>Escanear otro</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.cameraBox}>
            <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={connecting ? undefined : onScanned} />
            <View style={styles.frame} pointerEvents="none" />
            {connecting ? <View style={styles.connecting}><ActivityIndicator color="#fff" /><Text style={styles.connectingText}>Añadiendo…</Text></View> : null}
          </View>
          <Text style={styles.codeHint}>Apunta al código QR que te enseñe el otro jugador desde su app.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0b0b0d' },
  back: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#191c22', borderWidth: 1, borderColor: '#30343c', alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 4, padding: 4, borderRadius: 16, backgroundColor: '#17171a' },
  tab: { flex: 1, height: 42, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabOn: { backgroundColor: '#ff5a00' },
  tabText: { color: '#999', fontWeight: '900', fontSize: 13 },
  tabTextOn: { color: '#fff' },
  body: { padding: 16, alignItems: 'center' },
  codeCard: { alignSelf: 'stretch', alignItems: 'center', borderRadius: 26, padding: 20, backgroundColor: '#171719', borderWidth: 1, borderColor: '#29292d' },
  codeName: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 10 },
  qrBox: { width: 252, height: 252, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  codeHint: { color: '#8d9097', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 14, paddingHorizontal: 10 },
  error: { color: '#d46d6d', fontSize: 13, fontWeight: '800', textAlign: 'center', padding: 16 },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, backgroundColor: '#222327', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13 },
  secondaryText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  cameraBox: { width: '100%', aspectRatio: 1, borderRadius: 26, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  frame: { width: '62%', aspectRatio: 1, borderRadius: 24, borderWidth: 3, borderColor: '#ff5a00' },
  connecting: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.6)', alignItems: 'center', justifyContent: 'center', gap: 8 },
  connectingText: { color: '#fff', fontWeight: '900' },
  permission: { alignItems: 'center', padding: 28, marginTop: 20 },
  permissionTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 14, textAlign: 'center' },
  permissionText: { color: '#8d9097', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  primaryButton: { marginTop: 20, backgroundColor: '#ff5a00', borderRadius: 14, paddingHorizontal: 22, paddingVertical: 14 },
  primaryText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  successIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#2fbf71', alignItems: 'center', justifyContent: 'center' },
  linkButton: { marginTop: 14, padding: 8 },
  linkText: { color: '#a5a8ae', fontWeight: '800' },
});
