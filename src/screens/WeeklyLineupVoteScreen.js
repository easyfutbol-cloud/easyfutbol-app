import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';

const POSITIONS = ['portero', 'defensa', 'centrocampista', 'delantero'];
const POSITION_LABELS = { portero: 'Portero', defensa: 'Defensa', centrocampista: 'Centrocampista', delantero: 'Delantero' };
const DEFAULT_LIMITS = { portero: 1, defensa: 3, centrocampista: 2, delantero: 2 };

export default function WeeklyLineupVoteScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [poll, setPoll] = useState(null);
  const [candidates, setCandidates] = useState(null);
  const [myVotes, setMyVotes] = useState({});
  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const [votingKey, setVotingKey] = useState(null);

  const fetchCurrent = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/weekly-lineup/current');
      setPoll(res.data?.poll || null);
      setCandidates(res.data?.candidates || null);
      setMyVotes(res.data?.my_votes || {});
      setLimits(res.data?.position_limits || DEFAULT_LIMITS);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo cargar la votación');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCurrent();
    }, [fetchCurrent])
  );

  const toggleVote = async (position, candidate) => {
    const current = myVotes[position] || [];
    const alreadySelected = current.includes(candidate.id);
    const limit = limits[position] ?? DEFAULT_LIMITS[position];

    if (!alreadySelected && current.length >= limit) {
      Alert.alert('Límite alcanzado', `Ya has elegido ${limit} en ${POSITION_LABELS[position].toLowerCase()}. Quita alguno para cambiarlo.`);
      return;
    }

    const key = `${position}-${candidate.id}`;
    try {
      setVotingKey(key);
      await api.post('/weekly-lineup/vote/toggle', { position, candidate_id: candidate.id });
      setMyVotes((prev) => {
        const list = prev[position] || [];
        const next = alreadySelected ? list.filter((id) => id !== candidate.id) : [...list, candidate.id];
        return { ...prev, [position]: next };
      });
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo registrar el voto');
    } finally {
      setVotingKey(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#ff5a00" />
        <Text style={styles.loadingText}>Cargando votación...</Text>
      </View>
    );
  }

  if (!poll) {
    return (
      <View style={styles.centeredContainer}>
        <TouchableOpacity style={styles.backRowFloating} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={18} color="#ccc" />
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <Ionicons name="football-outline" size={40} color="#444" />
        <Text style={styles.emptyTitle}>No hay votación abierta</Text>
        <Text style={styles.emptySubtitle}>Vuelve a mirar los lunes a las 19:00, cuando se abre la votación.</Text>
        <TouchableOpacity style={styles.resultLink} onPress={() => navigation.navigate('WeeklyLineupResult')}>
          <Text style={styles.resultLinkText}>Ver el último 8 ganador →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <TouchableOpacity style={styles.backRow} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={18} color="#ccc" />
        <Text style={styles.backText}>Volver</Text>
      </TouchableOpacity>
      <Text style={styles.screenTitle}>Vota el 8 de la semana</Text>
      <Text style={styles.screenSubtitle}>Elige a tus favoritos en cada posición. Puedes cambiar de opinión mientras la votación siga abierta.</Text>

      {POSITIONS.map((position) => {
        const options = candidates?.[position] || [];
        const selectedIds = myVotes[position] || [];
        const limit = limits[position] ?? DEFAULT_LIMITS[position];

        return (
          <View key={position} style={styles.positionBlock}>
            <View style={styles.positionHeader}>
              <Text style={styles.positionTitle}>{POSITION_LABELS[position]}</Text>
              <Text style={styles.positionCount}>{selectedIds.length}/{limit}</Text>
            </View>
            {options.length === 0 ? (
              <Text style={styles.noCandidates}>Sin candidatos esta semana.</Text>
            ) : (
              options.map((candidate) => {
                const selected = selectedIds.includes(candidate.id);
                const key = `${position}-${candidate.id}`;
                return (
                  <TouchableOpacity
                    key={candidate.id}
                    style={[styles.candidateRow, selected && styles.candidateRowSelected]}
                    onPress={() => toggleVote(position, candidate)}
                    disabled={votingKey === key}
                    activeOpacity={0.8}
                  >
                    {candidate.avatar_url ? (
                      <Image source={{ uri: candidate.avatar_url }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarPlaceholder]}>
                        <Text style={styles.avatarInitial}>{(candidate.name || '?').charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={styles.candidateNameCol}>
                      <Text style={[styles.candidateName, selected && styles.candidateNameSelected]}>{candidate.name}</Text>
                      {candidate.location ? <Text style={styles.candidateLocation}>{candidate.location}</Text> : null}
                    </View>
                    {votingKey === key ? (
                      <ActivityIndicator size="small" color="#ff5a00" />
                    ) : selected ? (
                      <Ionicons name="checkmark-circle" size={22} color="#ff5a00" />
                    ) : (
                      <Ionicons name="ellipse-outline" size={22} color="#444" />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        );
      })}

      <TouchableOpacity style={styles.resultButton} onPress={() => navigation.navigate('WeeklyLineupResult')}>
        <Text style={styles.resultButtonText}>Ver el último 8 ganador</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 16, paddingBottom: 40 },
  centeredContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  loadingText: { marginTop: 12, color: '#fff', fontSize: 16 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  backRowFloating: { position: 'absolute', top: 16, left: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { color: '#ccc', fontSize: 13, fontWeight: '700' },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  emptySubtitle: { color: '#888', fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  resultLink: { marginTop: 20 },
  resultLinkText: { color: '#ff8c4d', fontSize: 13, fontWeight: '700' },
  screenTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  screenSubtitle: { color: '#999', fontSize: 13, marginTop: 6, marginBottom: 18, lineHeight: 19 },
  positionBlock: { marginBottom: 18 },
  positionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  positionTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  positionCount: { color: '#ff8c4d', fontSize: 13, fontWeight: '800' },
  noCandidates: { color: '#666', fontSize: 12 },
  candidateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#111', borderWidth: 1, borderColor: '#222', borderRadius: 12, padding: 11, marginBottom: 8 },
  candidateRowSelected: { borderColor: '#ff5a00', backgroundColor: 'rgba(255,90,0,0.08)' },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#222' },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#999', fontWeight: '800' },
  candidateNameCol: { flex: 1 },
  candidateName: { color: '#eee', fontSize: 14, fontWeight: '700' },
  candidateNameSelected: { color: '#fff' },
  candidateLocation: { color: '#888', fontSize: 11, fontWeight: '600', marginTop: 1 },
  resultButton: { alignItems: 'center', paddingVertical: 14, marginTop: 6 },
  resultButtonText: { color: '#ff8c4d', fontSize: 13, fontWeight: '700' },
});
