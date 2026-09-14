import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';

const POSITIONS = ['portero', 'central', 'lateral', 'centrocampista', 'delantero'];
const POSITION_LABELS = { portero: 'Portero', central: 'Central', lateral: 'Laterales', centrocampista: 'Centrocampistas', delantero: 'Delantero' };
const POSITION_SLOTS = { portero: 1, central: 1, lateral: 2, centrocampista: 2, delantero: 1 };

const STATUS_LABELS = { draft: 'Borrador', open: 'Abierta', closed: 'Cerrada' };

function formatWeek(weekStart, weekEnd) {
  const opts = { day: '2-digit', month: '2-digit' };
  const start = new Date(`${weekStart}T12:00:00Z`).toLocaleDateString('es-ES', opts);
  const end = new Date(`${weekEnd}T12:00:00Z`).toLocaleDateString('es-ES', opts);
  return `${start} - ${end}`;
}

export default function AdminWeeklyLineupScreen() {
  const [polls, setPolls] = useState([]);
  const [selectedPollId, setSelectedPollId] = useState(null);
  const [pollDetail, setPollDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchPosition, setSearchPosition] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const fetchPolls = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/weekly-lineup/polls');
      const data = Array.isArray(res.data?.data) ? res.data.data : [];
      setPolls(data);
      if (!selectedPollId) {
        const firstDraft = data.find((p) => p.status === 'draft') || data[0];
        if (firstDraft) setSelectedPollId(firstDraft.id);
      }
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudieron cargar las votaciones');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDetail = useCallback(async (pollId) => {
    if (!pollId) return;
    try {
      const res = await api.get(`/admin/weekly-lineup/polls/${pollId}`);
      setPollDetail(res.data);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo cargar la votación');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPolls();
    }, [fetchPolls])
  );

  useEffect(() => {
    fetchDetail(selectedPollId);
  }, [selectedPollId, fetchDetail]);

  useEffect(() => {
    if (!searchPosition || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await api.get('/admin/weekly-lineup/users-search', { params: { q: searchQuery.trim() } });
        if (!cancelled) setSearchResults(Array.isArray(res.data?.data) ? res.data.data : []);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [searchQuery, searchPosition]);

  const isDraft = pollDetail?.poll?.status === 'draft';

  const addCandidate = async (position, user) => {
    try {
      const res = await api.post(`/admin/weekly-lineup/polls/${selectedPollId}/candidates`, { position, user_id: user.id });
      setPollDetail({ poll: res.data.poll, candidates: res.data.candidates });
      setSearchPosition(null);
      setSearchQuery('');
      setSearchResults([]);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo añadir el candidato');
    }
  };

  const removeCandidate = async (candidate) => {
    try {
      const res = await api.delete(`/admin/weekly-lineup/polls/${selectedPollId}/candidates/${candidate.id}`);
      setPollDetail({ poll: res.data.poll, candidates: res.data.candidates });
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo eliminar');
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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.screenTitle}>El 8 de la semana</Text>
        <Text style={styles.screenSubtitle}>
          Añade candidatos a cada posición del borrador. La votación se abre sola cuando empieza su semana
          (con al menos 1 candidato por posición) y se cierra sola al terminarla.
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weekTabs}>
          {polls.map((poll) => (
            <TouchableOpacity
              key={poll.id}
              style={[styles.weekTab, selectedPollId === poll.id && styles.weekTabActive]}
              onPress={() => setSelectedPollId(poll.id)}
            >
              <Text style={[styles.weekTabText, selectedPollId === poll.id && styles.weekTabTextActive]}>
                {formatWeek(poll.week_start, poll.week_end)}
              </Text>
              <Text style={[styles.weekTabStatus, selectedPollId === poll.id && styles.weekTabStatusActive]}>
                {STATUS_LABELS[poll.status]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {!pollDetail ? null : (
          <>
            {!isDraft ? (
              <View style={styles.readOnlyNotice}>
                <Ionicons name="lock-closed-outline" size={14} color="#f4c95d" />
                <Text style={styles.readOnlyText}>
                  {pollDetail.poll.status === 'open' ? 'Votación abierta: solo lectura, ya no se pueden cambiar candidatos.' : 'Votación cerrada.'}
                </Text>
              </View>
            ) : null}

            {POSITIONS.map((position) => {
              const candidates = pollDetail.candidates?.[position] || [];
              return (
                <View key={position} style={styles.positionBlock}>
                  <View style={styles.positionHeader}>
                    <Text style={styles.positionTitle}>{POSITION_LABELS[position]}</Text>
                    <Text style={styles.positionSlots}>{candidates.length} candidato{candidates.length === 1 ? '' : 's'} · {POSITION_SLOTS[position]} hueco{POSITION_SLOTS[position] === 1 ? '' : 's'}</Text>
                  </View>

                  {candidates.map((c) => (
                    <View key={c.id} style={styles.candidateRow}>
                      {c.avatar_url ? (
                        <Image source={{ uri: c.avatar_url }} style={styles.candidateAvatar} />
                      ) : (
                        <View style={[styles.candidateAvatar, styles.candidateAvatarPlaceholder]}>
                          <Text style={styles.candidateAvatarInitial}>{(c.name || '?').charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <Text style={styles.candidateName}>{c.name}</Text>
                      {!isDraft ? <Text style={styles.candidateVotes}>{c.votes} votos</Text> : null}
                      {isDraft ? (
                        <TouchableOpacity onPress={() => removeCandidate(c)} style={styles.removeButton}>
                          <Ionicons name="close" size={16} color="#888" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}

                  {isDraft ? (
                    searchPosition === position ? (
                      <View style={styles.searchBox}>
                        <TextInput
                          style={styles.searchInput}
                          placeholder="Buscar jugador por nombre..."
                          placeholderTextColor="#666"
                          value={searchQuery}
                          onChangeText={setSearchQuery}
                          autoFocus
                        />
                        {searching ? <ActivityIndicator color="#ff5a00" style={{ marginTop: 8 }} /> : null}
                        {searchResults.map((user) => (
                          <TouchableOpacity key={user.id} style={styles.searchResultRow} onPress={() => addCandidate(position, user)}>
                            {user.avatar_url ? (
                              <Image source={{ uri: user.avatar_url }} style={styles.candidateAvatar} />
                            ) : (
                              <View style={[styles.candidateAvatar, styles.candidateAvatarPlaceholder]}>
                                <Text style={styles.candidateAvatarInitial}>{(user.name || '?').charAt(0).toUpperCase()}</Text>
                              </View>
                            )}
                            <Text style={styles.candidateName}>{user.name}</Text>
                          </TouchableOpacity>
                        ))}
                        <TouchableOpacity onPress={() => { setSearchPosition(null); setSearchQuery(''); }}>
                          <Text style={styles.cancelSearchText}>Cancelar</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity style={styles.addButton} onPress={() => setSearchPosition(position)}>
                        <Ionicons name="add" size={16} color="#ff8c4d" />
                        <Text style={styles.addButtonText}>Añadir candidato</Text>
                      </TouchableOpacity>
                    )
                  ) : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 16, paddingBottom: 40 },
  centeredContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 12, color: '#fff', fontSize: 16 },
  screenTitle: { color: '#fff', fontSize: 26, fontWeight: '800' },
  screenSubtitle: { color: '#999', fontSize: 13, marginTop: 6, marginBottom: 16, lineHeight: 19 },
  weekTabs: { marginBottom: 18 },
  weekTab: { backgroundColor: '#111', borderWidth: 1, borderColor: '#222', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginRight: 10, alignItems: 'center' },
  weekTabActive: { backgroundColor: '#ff5a00', borderColor: '#ff5a00' },
  weekTabText: { color: '#ccc', fontSize: 13, fontWeight: '800' },
  weekTabTextActive: { color: '#fff' },
  weekTabStatus: { color: '#777', fontSize: 10, fontWeight: '700', marginTop: 2 },
  weekTabStatusActive: { color: 'rgba(255,255,255,0.85)' },
  readOnlyNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(244,201,93,0.08)', borderWidth: 1, borderColor: 'rgba(244,201,93,0.3)', borderRadius: 12, padding: 12, marginBottom: 16 },
  readOnlyText: { color: '#e8d9ae', fontSize: 12, flex: 1 },
  positionBlock: { backgroundColor: '#111', borderRadius: 16, borderWidth: 1, borderColor: '#222', padding: 14, marginBottom: 14 },
  positionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  positionTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  positionSlots: { color: '#888', fontSize: 11, fontWeight: '600' },
  candidateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  candidateAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#222' },
  candidateAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  candidateAvatarInitial: { color: '#999', fontWeight: '800', fontSize: 13 },
  candidateName: { flex: 1, color: '#eee', fontSize: 14, fontWeight: '600' },
  candidateVotes: { color: '#ff8c4d', fontSize: 12, fontWeight: '800' },
  removeButton: { padding: 6 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingVertical: 8 },
  addButtonText: { color: '#ff8c4d', fontSize: 13, fontWeight: '700' },
  searchBox: { marginTop: 8, backgroundColor: '#191919', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a2a', padding: 10 },
  searchInput: { backgroundColor: '#111', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 14 },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#222', marginTop: 6 },
  cancelSearchText: { color: '#888', fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'center' },
});
