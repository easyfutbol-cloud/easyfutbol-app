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

const POSITIONS = ['portero', 'defensa', 'centrocampista', 'delantero'];
const POSITION_LABELS = { portero: 'Portero', defensa: 'Defensa', centrocampista: 'Centrocampista', delantero: 'Delantero' };
// Cuántos gana cada posición (y elige cada votante) / tamaño máximo del grupo de candidatos.
const POSITION_SLOTS = { portero: 1, defensa: 3, centrocampista: 2, delantero: 2 };
const POSITION_CANDIDATE_POOL = { portero: 3, defensa: 5, centrocampista: 4, delantero: 4 };

const STATUS_LABELS = { draft: 'Borrador', open: 'Abierta', closed: 'Cerrada' };

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

function formatDateTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
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

  const openPoll = async () => {
    try {
      const res = await api.post(`/admin/weekly-lineup/polls/${selectedPollId}/open`);
      setPolls(Array.isArray(res.data?.data) ? res.data.data : []);
      await fetchDetail(selectedPollId);
    } catch (e) {
      Alert.alert('No se pudo abrir', e?.response?.data?.msg || e.message || 'Revisa que haya candidatos en todas las posiciones');
    }
  };

  const closeNow = () => {
    Alert.alert(
      'Cerrar ahora (modo prueba)',
      'Esto cierra la votación de esta semana al momento, aunque no haya terminado, para que puedas ver ya la pantalla de resultado. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar ya',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await api.post(`/admin/weekly-lineup/polls/${selectedPollId}/close-now`);
              setPolls(Array.isArray(res.data?.data) ? res.data.data : []);
              await fetchDetail(selectedPollId);
              Alert.alert('Listo', 'Ya puedes ver el resultado en "El 8 de la semana" desde la portada.');
            } catch (e) {
              Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo cerrar');
            }
          },
        },
      ]
    );
  };

  const deletePoll = () => {
    Alert.alert(
      'Eliminar esta votación',
      'Se borra entera (candidatos y votos incluidos). Úsalo para limpiar pruebas. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await api.delete(`/admin/weekly-lineup/polls/${selectedPollId}`);
              const data = Array.isArray(res.data?.data) ? res.data.data : [];
              setPolls(data);
              setPollDetail(null);
              setSelectedPollId(data[0]?.id || null);
            } catch (e) {
              Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo eliminar');
            }
          },
        },
      ]
    );
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
          Añade candidatos a cada posición del borrador y ábrela tú cuando esté lista (de momento la apertura es manual).
          Se cierra sola en la hora prevista (miércoles 19:00).
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
            {(pollDetail.poll.scheduled_open_at || pollDetail.poll.scheduled_close_at) ? (
              <Text style={styles.scheduleText}>
                Previsto: abre {formatDateTime(pollDetail.poll.scheduled_open_at) || '—'} · cierra {formatDateTime(pollDetail.poll.scheduled_close_at) || '—'}
              </Text>
            ) : null}

            {isDraft ? (
              <TouchableOpacity style={styles.openButton} onPress={openPoll}>
                <Ionicons name="play-outline" size={14} color="#fff" />
                <Text style={styles.openButtonText}>Abrir votación ahora</Text>
              </TouchableOpacity>
            ) : null}

            {pollDetail.poll.status !== 'closed' ? (
              <TouchableOpacity style={styles.closeNowButton} onPress={closeNow}>
                <Ionicons name="flash-outline" size={14} color="#ff8c4d" />
                <Text style={styles.closeNowButtonText}>Cerrar ahora (modo prueba) — ver resultado ya</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.deletePollButton} onPress={deletePoll}>
              <Ionicons name="trash-outline" size={14} color="#ff6b6b" />
              <Text style={styles.deletePollButtonText}>Eliminar esta votación</Text>
            </TouchableOpacity>

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
              const pool = POSITION_CANDIDATE_POOL[position];
              return (
                <View key={position} style={styles.positionBlock}>
                  <View style={styles.positionHeader}>
                    <Text style={styles.positionTitle}>{POSITION_LABELS[position]}</Text>
                    <Text style={styles.positionSlots}>{candidates.length}/{pool} candidatos · cada uno elige {POSITION_SLOTS[position]}</Text>
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
                      <View style={styles.candidateNameCol}>
                        <Text style={styles.candidateName}>{c.name} <Text style={styles.candidateId}>#{c.user_id}</Text></Text>
                        {c.location ? <Text style={styles.candidateLocation}>{c.location}</Text> : null}
                      </View>
                      {!isDraft ? <Text style={styles.candidateVotes}>{c.votes} votos</Text> : null}
                      {isDraft ? (
                        <TouchableOpacity onPress={() => removeCandidate(c)} style={styles.removeButton}>
                          <Ionicons name="close" size={16} color="#888" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}

                  {isDraft && candidates.length >= pool ? (
                    <Text style={styles.limitReachedText}>Máximo de {pool} candidatos alcanzado.</Text>
                  ) : isDraft ? (
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
                            <View style={styles.candidateNameCol}>
                              <Text style={styles.candidateName}>{user.name} <Text style={styles.candidateId}>#{user.id}</Text></Text>
                              {user.location ? <Text style={styles.candidateLocation}>{user.location}</Text> : null}
                            </View>
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
  scheduleText: { color: '#777', fontSize: 11, fontWeight: '600', marginBottom: 10, textTransform: 'capitalize' },
  openButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#ff5a00', borderRadius: 12, paddingVertical: 12, marginBottom: 10 },
  openButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  closeNowButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,90,0,0.1)', borderWidth: 1, borderColor: '#ff5a00', borderRadius: 12, paddingVertical: 11, marginBottom: 14 },
  closeNowButtonText: { color: '#ff8c4d', fontSize: 12, fontWeight: '800' },
  deletePollButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginBottom: 14 },
  deletePollButtonText: { color: '#ff6b6b', fontSize: 12, fontWeight: '700' },
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
  candidateNameCol: { flex: 1 },
  candidateName: { color: '#eee', fontSize: 14, fontWeight: '600' },
  candidateId: { color: '#666', fontSize: 11, fontWeight: '600' },
  candidateLocation: { color: '#888', fontSize: 11, fontWeight: '600', marginTop: 1 },
  candidateVotes: { color: '#ff8c4d', fontSize: 12, fontWeight: '800' },
  removeButton: { padding: 6 },
  limitReachedText: { color: '#666', fontSize: 12, fontWeight: '600', marginTop: 6, fontStyle: 'italic' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingVertical: 8 },
  addButtonText: { color: '#ff8c4d', fontSize: 13, fontWeight: '700' },
  searchBox: { marginTop: 8, backgroundColor: '#191919', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a2a', padding: 10 },
  searchInput: { backgroundColor: '#111', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 14 },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#222', marginTop: 6 },
  cancelSearchText: { color: '#888', fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'center' },
});
