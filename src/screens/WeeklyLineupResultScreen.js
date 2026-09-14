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
const POSITION_SPOTS = {
  delantero: [{ top: 0.4, left: 0.4 }, { top: 0.4, left: 0.6 }],
  centrocampista: [{ top: 0.505, left: 0.385 }, { top: 0.505, left: 0.615 }],
  central: [{ top: 0.645, left: 0.5 }],
  lateral: [{ top: 0.645, left: 0.345 }, { top: 0.645, left: 0.655 }],
  portero: [{ top: 0.775, left: 0.5 }],
};

function formatWeek(weekStart, weekEnd) {
  const opts = { day: '2-digit', month: '2-digit' };
  const start = new Date(`${weekStart}T12:00:00Z`).toLocaleDateString('es-ES', opts);
  const end = new Date(`${weekEnd}T12:00:00Z`).toLocaleDateString('es-ES', opts);
  return `${start} - ${end}`;
}

function PlayerPin({ player, spot }) {
  const pinStyle = { top: `${spot.top * 100}%`, left: `${spot.left * 100}%` };
  return (
    <View style={[styles.pin, pinStyle]}>
      <View style={styles.avatarRing}>
        {player?.avatar_url ? (
          <Image source={{ uri: player.avatar_url }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarInitial}>{(player?.name || '?').charAt(0).toUpperCase()}</Text>
        )}
      </View>
      {player ? (
        <View style={styles.pinLabel}>
          <Text style={styles.pinName} numberOfLines={1}>{player.name}</Text>
          {player.location ? <Text style={styles.pinLocation} numberOfLines={1}>{player.location}</Text> : null}
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
  section('Central', winners.central);
  section('Laterales', winners.lateral);
  section('Centrocampistas', winners.centrocampista);
  section('Delantero', winners.delantero);
  return lines.join('\n');
}

export default function WeeklyLineupResultScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [poll, setPoll] = useState(null);
  const [winners, setWinners] = useState(null);
  const [sharing, setSharing] = useState(false);
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

      <View ref={shareCardRef} collapsable={false} style={styles.templateWrap}>
        <Image source={TEMPLATE_IMAGE} style={styles.templateImage} resizeMode="contain" />
        {Object.entries(POSITION_SPOTS).map(([position, spots]) =>
          spots.map((spot, index) => (
            <PlayerPin key={`${position}-${index}`} player={(winners[position] || [])[index]} spot={spot} />
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
  pin: { position: 'absolute', alignItems: 'center', width: 72, marginLeft: -36, marginTop: -22 },
  avatarRing: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: '#000', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { color: '#fff', fontWeight: '900', fontSize: 15 },
  pinLabel: { marginTop: 3, backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, maxWidth: 90 },
  pinName: { color: '#fff', fontSize: 9, fontWeight: '800', textAlign: 'center' },
  pinLocation: { color: 'rgba(255,255,255,0.7)', fontSize: 7, fontWeight: '700', textAlign: 'center' },
  shareButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ff5a00', borderRadius: 14, paddingVertical: 15, marginTop: 20 },
  shareButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
