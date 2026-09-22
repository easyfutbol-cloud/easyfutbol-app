import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Image, Share, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { api } from '../api/client';

const TEMPLATE_IMAGE = require('../../assets/weekly-lineup-template.png');
const TEMPLATE_ASPECT_RATIO = 1080 / 1350;

// Posición de cada hueco sobre la plantilla, en % del ancho/alto de la imagen
// (ajustado a ojo sobre el campo dibujado en weekly-lineup-template.png).
// Repartidas con hueco de sobra entre filas para que quepan foto + etiqueta
// sin solaparse, sea cual sea el ancho real de pantalla (ver AVATAR_RATIO).
const POSITION_SPOTS = {
  delantero: [{ top: 0.35, left: 0.37 }, { top: 0.35, left: 0.63 }],
  centrocampista: [{ top: 0.495, left: 0.35 }, { top: 0.495, left: 0.65 }],
  defensa: [{ top: 0.64, left: 0.26 }, { top: 0.64, left: 0.5 }, { top: 0.64, left: 0.74 }],
  portero: [{ top: 0.79, left: 0.5 }],
};

// Diámetro de la foto como fracción del ancho real del campo en pantalla,
// para que escale igual en un móvil pequeño que en una tablet.
const AVATAR_RATIO = 0.105;

function parseDateOnly(value) {
  const str = String(value ?? '');
  // mysql2 devuelve las columnas DATE como Date, que Express serializa a ISO
  // completo ("2026-09-14T00:00:00.000Z") — no hay que volver a añadirle hora.
  if (str.length > 10) return new Date(str);
  return new Date(`${str}T12:00:00Z`);
}

function formatWeek(weekStart, weekEnd) {
  const opts = { day: '2-digit', month: '2-digit' };
  const start = parseDateOnly(weekStart).toLocaleDateString('es-ES', opts);
  const end = parseDateOnly(weekEnd).toLocaleDateString('es-ES', opts);
  return `${start} - ${end}`;
}

function PlayerPin({ player, spot, containerWidth }) {
  if (!containerWidth) return null;

  const avatarSize = containerWidth * AVATAR_RATIO;
  const pinStyle = {
    top: `${spot.top * 100}%`,
    left: `${spot.left * 100}%`,
    width: avatarSize * 1.7,
    marginLeft: -(avatarSize * 1.7) / 2,
    marginTop: -avatarSize / 2,
  };
  const avatarStyle = { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 };

  return (
    <View style={[styles.pin, pinStyle]}>
      <View style={[styles.avatarRing, avatarStyle]}>
        {player?.avatar_url ? (
          <Image source={{ uri: player.avatar_url }} style={styles.avatarImage} />
        ) : (
          <Text style={[styles.avatarInitial, { fontSize: avatarSize * 0.4 }]}>{(player?.name || '?').charAt(0).toUpperCase()}</Text>
        )}
      </View>
      {player ? (
        <View style={styles.pinLabel}>
          <Text style={[styles.pinName, { fontSize: avatarSize * 0.19 }]} numberOfLines={1}>{player.name}</Text>
          {player.location ? <Text style={[styles.pinLocation, { fontSize: avatarSize * 0.15 }]} numberOfLines={1}>{player.location}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function buildShareText(poll, winners) {
  const lines = [`⚽ El 8 de la semana · ${formatWeek(poll.week_start, poll.week_end)}`, ''];
  const section = (label, list) => {
    lines.push(`${label}: ${(list || []).map((p) => p.name).join(', ') || '—'}`);
  };
  section('Portero', winners.portero);
  section('Defensa', winners.defensa);
  section('Centrocampistas', winners.centrocampista);
  section('Delanteros', winners.delantero);
  return lines.join('\n');
}

export default function WeeklyLineupResultScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [poll, setPoll] = useState(null);
  const [winners, setWinners] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const shareCardRef = useRef(null);

  const fetchResult = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/weekly-lineup/latest-result');
      setPoll(res.data?.poll || null);
      setWinners(res.data?.winners || null);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo cargar el resultado');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchResult();
    }, [fetchResult])
  );

  const handleShare = async () => {
    if (!poll || !winners) return;
    try {
      setSharing(true);
      const canShareImage = shareCardRef.current && (await Sharing.isAvailableAsync());
      if (canShareImage) {
        const uri = await captureRef(shareCardRef, { format: 'png', quality: 0.95 });
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir el 8 de la semana' });
        return;
      }
    } catch (e) {
      // si falla la captura, seguimos con el share de texto de siempre
    } finally {
      setSharing(false);
    }
    try {
      await Share.share({ message: buildShareText(poll, winners) });
    } catch {
      // cancelado por el usuario
    }
  };

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#ff5a00" />
        <Text style={styles.loadingText}>Cargando...</Text>
      </View>
    );
  }

  if (!poll || !winners) {
    return (
      <View style={styles.centeredContainer}>
        <TouchableOpacity style={styles.backRowFloating} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={18} color="#ccc" />
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <Ionicons name="trophy-outline" size={40} color="#444" />
        <Text style={styles.emptyTitle}>Todavía no hay ningún 8 publicado</Text>
        <Text style={styles.emptySubtitle}>En cuanto se cierre la primera votación semanal aparecerá aquí.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={18} color="#ccc" />
        <Text style={styles.backText}>Volver</Text>
      </TouchableOpacity>
      <Text style={styles.screenSubtitle}>{formatWeek(poll.week_start, poll.week_end)}</Text>

      <View
        ref={shareCardRef}
        collapsable={false}
        style={styles.templateWrap}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      >
        <Image source={TEMPLATE_IMAGE} style={styles.templateImage} resizeMode="contain" />
        {Object.entries(POSITION_SPOTS).map(([position, spots]) =>
          spots.map((spot, index) => (
            <PlayerPin
              key={`${position}-${index}`}
              player={(winners[position] || [])[index]}
              spot={spot}
              containerWidth={containerWidth}
            />
          ))
        )}
      </View>

      <TouchableOpacity style={styles.shareButton} onPress={handleShare} disabled={sharing}>
        {sharing ? <ActivityIndicator color="#fff" /> : (
          <>
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={styles.shareButtonText}>Compartir</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 16, paddingBottom: 40 },
  centeredContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  loadingText: { marginTop: 12, color: '#fff', fontSize: 16 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  backRowFloating: { position: 'absolute', top: 16, left: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { color: '#ccc', fontSize: 13, fontWeight: '700' },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  emptySubtitle: { color: '#888', fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  screenSubtitle: { color: '#999', fontSize: 13, marginBottom: 14, textAlign: 'center' },
  templateWrap: { width: '100%', aspectRatio: TEMPLATE_ASPECT_RATIO, borderRadius: 16, overflow: 'hidden', backgroundColor: '#c1410a' },
  templateImage: { width: '100%', height: '100%' },
  pin: { position: 'absolute', alignItems: 'center' },
  avatarRing: { backgroundColor: '#1a1a1a', borderWidth: 3, borderColor: '#000', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { color: '#fff', fontWeight: '900' },
  pinLabel: { marginTop: 4, backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3, maxWidth: '100%' },
  pinName: { color: '#fff', fontWeight: '800', textAlign: 'center' },
  pinLocation: { color: 'rgba(255,255,255,0.7)', fontWeight: '700', textAlign: 'center' },
  shareButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ff5a00', borderRadius: 14, paddingVertical: 15, marginTop: 20 },
  shareButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
