import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';

function eventLine(event) {
  const player = event.player_name ? ` — ${event.player_name}` : '';
  const team = event.team_color ? ` (${event.team_color === 'white' ? 'Blancos' : 'Negros'})` : '';
  return `${event.minute}'${player}${team}`;
}

function buildShareText(match, data) {
  const lines = [`Resumen · ${match?.title || 'Partido'}`, ''];

  lines.push(`GOLES (${data.goals.length})`);
  if (data.goals.length) data.goals.forEach((e) => lines.push(`${e.is_candidate ? '⭐ ' : ''}${eventLine(e)}`));
  else lines.push('Sin goles registrados');

  lines.push('', `PARADAS (${data.saves.length})`);
  if (data.saves.length) data.saves.forEach((e) => lines.push(`${e.is_candidate ? '⭐ ' : ''}${eventLine(e)}`));
  else lines.push('Sin paradas registradas');

  if (data.goal_candidates.length || data.save_candidates.length) {
    lines.push('', 'CANDIDATOS DE LA SEMANA');
    data.goal_candidates.forEach((e) => lines.push(`⚽ Gol ${eventLine(e)}`));
    data.save_candidates.forEach((e) => lines.push(`🧤 Parada ${eventLine(e)}`));
  }

  return lines.join('\n');
}

export default function AdminMatchSummaryScreen({ route }) {
  const matchId = route?.params?.matchId;
  const matchTitle = route?.params?.matchTitle || '';

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState(null);
  const [data, setData] = useState(null);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/admin/matches/${matchId}/events/summary`);
      setMatch(res.data?.match || null);
      setData(res.data?.data || null);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo cargar el resumen');
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useFocusEffect(
    useCallback(() => {
      fetchSummary();
    }, [fetchSummary])
  );

  const handleShare = async () => {
    if (!data) return;
    try {
      await Share.share({ message: buildShareText(match, data) });
    } catch {
      // el usuario canceló el share, no hace falta avisar
    }
  };

  if (loading || !data) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#ff5a00" />
        <Text style={styles.loadingText}>Generando resumen...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>{match?.title || matchTitle}</Text>
      <Text style={styles.screenSubtitle}>Resumen listo para preparar los recortes.</Text>

      {(data.goal_candidates.length > 0 || data.save_candidates.length > 0) && (
        <View style={styles.candidatesBox}>
          <View style={styles.candidatesHeader}>
            <Ionicons name="star" size={16} color="#f4c95d" />
            <Text style={styles.candidatesTitle}>Candidatos de la semana</Text>
          </View>
          {data.goal_candidates.map((e) => (
            <Text key={`gc-${e.id}`} style={styles.candidateLine}>⚽ Gol · {eventLine(e)}</Text>
          ))}
          {data.save_candidates.map((e) => (
            <Text key={`sc-${e.id}`} style={styles.candidateLine}>🧤 Parada · {eventLine(e)}</Text>
          ))}
        </View>
      )}

      <Section title={`Goles (${data.goals.length})`} events={data.goals} emptyLabel="Sin goles registrados" />
      <Section title={`Paradas (${data.saves.length})`} events={data.saves} emptyLabel="Sin paradas registradas" />

      <TouchableOpacity style={styles.copyButton} onPress={handleShare}>
        <Ionicons name="share-outline" size={18} color="#fff" />
        <Text style={styles.copyButtonText}>Compartir resumen</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Section({ title, events, emptyLabel }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {events.length === 0 ? (
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      ) : (
        events.map((e) => (
          <View key={e.id} style={styles.eventRow}>
            <View style={styles.eventMinuteBox}>
              <Text style={styles.eventMinuteText}>{e.minute}'</Text>
            </View>
            <Text style={styles.eventText}>
              {e.player_name || 'Jugador sin especificar'}
              {e.team_color ? ` · ${e.team_color === 'white' ? 'Blancos' : 'Negros'}` : ''}
            </Text>
            {e.is_candidate ? <Ionicons name="star" size={16} color="#f4c95d" /> : null}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 16, paddingBottom: 40 },
  centeredContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  loadingText: { marginTop: 12, color: '#fff', fontSize: 16 },
  screenTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  screenSubtitle: { color: '#999', fontSize: 13, marginTop: 4, marginBottom: 20 },
  candidatesBox: { backgroundColor: 'rgba(244,201,93,0.08)', borderWidth: 1, borderColor: 'rgba(244,201,93,0.35)', borderRadius: 16, padding: 14, marginBottom: 22 },
  candidatesHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  candidatesTitle: { color: '#f4c95d', fontWeight: '800', fontSize: 14 },
  candidateLine: { color: '#e8d9ae', fontSize: 13, marginTop: 4 },
  section: { marginBottom: 22 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 10 },
  emptyText: { color: '#777', fontSize: 13 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#222', padding: 11, marginBottom: 8 },
  eventMinuteBox: { width: 38, height: 30, borderRadius: 8, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  eventMinuteText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  eventText: { flex: 1, color: '#ddd', fontSize: 13 },
  copyButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ff5a00', borderRadius: 14, paddingVertical: 15, marginTop: 8 },
  copyButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
