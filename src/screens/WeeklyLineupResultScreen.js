import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Image, Share, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { api } from '../api/client';

function formatWeek(weekStart, weekEnd) {
  const opts = { day: '2-digit', month: '2-digit' };
  const start = new Date(`${weekStart}T12:00:00Z`).toLocaleDateString('es-ES', opts);
  const end = new Date(`${weekEnd}T12:00:00Z`).toLocaleDateString('es-ES', opts);
  return `${start} - ${end}`;
}

function PlayerSpot({ player, empty }) {
  if (empty || !player) {
    return (
      <View style={styles.spot}>
        <View style={[styles.avatarRing, styles.avatarRingEmpty]}>
          <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.4)" />
        </View>
        <Text style={styles.spotNameEmpty}>Sin ganador</Text>
      </View>
    );
  }
  return (
    <View style={styles.spot}>
      <View style={styles.avatarRing}>
        {player.avatar_url ? (
          <Image source={{ uri: player.avatar_url }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarInitial}>{(player.name || '?').charAt(0).toUpperCase()}</Text>
        )}
      </View>
      <Text style={styles.spotName} numberOfLines={1}>{player.name}</Text>
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

  const lateral = winners.lateral || [];
  const centrocampista = winners.centrocampista || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={18} color="#ccc" />
        <Text style={styles.backText}>Volver</Text>
      </TouchableOpacity>
      <View ref={shareCardRef} collapsable={false} style={styles.shareCard}>
        <Text style={styles.screenTitle}>El 8 de la semana</Text>
        <Text style={styles.screenSubtitle}>{formatWeek(poll.week_start, poll.week_end)}</Text>

        <LinearGradient colors={['#1d6b3d', '#123d24']} style={styles.pitch}>
          <View style={styles.pitchLine} />
          <View style={[styles.pitchCircle]} />

          <View style={styles.row}>
            <PlayerSpot player={winners.delantero?.[0]} />
          </View>

          <View style={styles.row}>
            <PlayerSpot player={centrocampista[0]} />
            <PlayerSpot player={centrocampista[1]} />
          </View>

          <View style={styles.row}>
            <PlayerSpot player={lateral[0]} />
            <PlayerSpot player={winners.central?.[0]} />
            <PlayerSpot player={lateral[1]} />
          </View>

          <View style={styles.row}>
            <PlayerSpot player={winners.portero?.[0]} />
          </View>
        </LinearGradient>
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
  shareCard: { backgroundColor: '#000', paddingVertical: 4 },
  backRowFloating: { position: 'absolute', top: 16, left: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { color: '#ccc', fontSize: 13, fontWeight: '700' },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  emptySubtitle: { color: '#888', fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  screenTitle: { color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  screenSubtitle: { color: '#999', fontSize: 13, marginTop: 4, marginBottom: 20, textAlign: 'center' },
  pitch: { borderRadius: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', padding: 18, justifyContent: 'space-between', minHeight: 460, overflow: 'hidden' },
  pitchLine: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.18)' },
  pitchCircle: { position: 'absolute', top: '50%', left: '50%', width: 70, height: 70, borderRadius: 35, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', marginLeft: -35, marginTop: -35 },
  row: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' },
  spot: { alignItems: 'center', width: 84 },
  avatarRing: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarRingEmpty: { borderColor: 'rgba(255,255,255,0.35)', borderStyle: 'dashed' },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { color: '#fff', fontWeight: '900', fontSize: 18 },
  spotName: { color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 6, textAlign: 'center' },
  spotNameEmpty: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  shareButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ff5a00', borderRadius: 14, paddingVertical: 15, marginTop: 20 },
  shareButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
