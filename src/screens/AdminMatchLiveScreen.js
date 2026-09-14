import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';

const TYPE_LABEL = { goal: 'Gol', save: 'Parada' };
const TYPE_ICON = { goal: 'football', save: 'hand-left' };

function pad2(n) {
  return String(n).padStart(2, '0');
}

export default function AdminMatchLiveScreen({ navigation, route }) {
  const matchId = route?.params?.matchId;
  const matchTitle = route?.params?.matchTitle || '';

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);

  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [offsetMinutes, setOffsetMinutes] = useState(0);
  const [, setTick] = useState(0);

  const [roster, setRoster] = useState({ white: [], black: [] });
  const [editingEvent, setEditingEvent] = useState(null);
  const [editPlayerName, setEditPlayerName] = useState('');
  const [editTeamColor, setEditTeamColor] = useState('');
  const [editMinute, setEditMinute] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const intervalRef = useRef(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const currentMinute = useMemo(() => {
    const elapsed = running && startedAt ? Math.floor((Date.now() - startedAt) / 60000) : 0;
    return Math.max(0, offsetMinutes + elapsed);
  }, [running, startedAt, offsetMinutes]);

  const elapsedLabel = useMemo(() => {
    if (!running || !startedAt) return `${pad2(offsetMinutes)}:00`;
    const totalSeconds = Math.floor((Date.now() - startedAt) / 1000) + offsetMinutes * 60;
    const mm = Math.max(0, Math.floor(totalSeconds / 60));
    const ss = Math.max(0, totalSeconds % 60);
    return `${pad2(mm)}:${pad2(ss)}`;
  }, [running, startedAt, offsetMinutes]);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/admin/matches/${matchId}/events`);
      setEvents(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudieron cargar los eventos');
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  const fetchRoster = useCallback(async () => {
    try {
      const res = await api.get(`/admin/matches/${matchId}/roster`);
      setRoster({ white: res.data?.white || [], black: res.data?.black || [] });
    } catch {
      // el picker de jugadores es opcional, no bloquea el resto
    }
  }, [matchId]);

  useFocusEffect(
    useCallback(() => {
      fetchEvents();
      fetchRoster();
    }, [fetchEvents, fetchRoster])
  );

  const handleStartStop = () => {
    if (running) {
      setOffsetMinutes((prev) => prev + Math.floor((Date.now() - startedAt) / 60000));
      setRunning(false);
      setStartedAt(null);
    } else {
      setStartedAt(Date.now());
      setRunning(true);
    }
  };

  const adjustMinute = (delta) => {
    setOffsetMinutes((prev) => Math.max(0, prev + delta));
  };

  const logEvent = async (type) => {
    try {
      setLogging(true);
      const res = await api.post(`/admin/matches/${matchId}/events`, { type, minute: currentMinute });
      const created = res.data?.data;
      if (created) setEvents((prev) => [...prev, created].sort((a, b) => a.minute - b.minute || a.id - b.id));
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo registrar el evento');
    } finally {
      setLogging(false);
    }
  };

  const toggleCandidate = async (event) => {
    try {
      const res = await api.put(`/admin/matches/${matchId}/events/${event.id}`, { is_candidate: event.is_candidate ? 0 : 1 });
      const updated = res.data?.data;
      if (updated) setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo actualizar');
    }
  };

  const deleteEvent = (event) => {
    Alert.alert('Eliminar evento', `¿Borrar este ${TYPE_LABEL[event.type].toLowerCase()} del minuto ${event.minute}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/admin/matches/${matchId}/events/${event.id}`);
            setEvents((prev) => prev.filter((e) => e.id !== event.id));
          } catch (e) {
            Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo eliminar');
          }
        },
      },
    ]);
  };

  const openEdit = (event) => {
    setEditingEvent(event);
    setEditPlayerName(event.player_name || '');
    setEditTeamColor(event.team_color || '');
    setEditMinute(String(event.minute));
  };

  const closeEdit = () => setEditingEvent(null);

  const saveEdit = async () => {
    if (!editingEvent) return;
    const minute = Number(editMinute);
    if (!Number.isInteger(minute) || minute < 0) return Alert.alert('Minuto inválido', 'Escribe un minuto válido.');

    try {
      setSavingEdit(true);
      const res = await api.put(`/admin/matches/${matchId}/events/${editingEvent.id}`, {
        minute,
        player_name: editPlayerName,
        team_color: editTeamColor || null,
      });
      const updated = res.data?.data;
      if (updated) setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)).sort((a, b) => a.minute - b.minute || a.id - b.id));
      closeEdit();
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo guardar');
    } finally {
      setSavingEdit(false);
    }
  };

  const pickPlayerForEdit = (player, color) => {
    setEditPlayerName(player.name);
    setEditTeamColor(color);
  };

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#ff5a00" />
        <Text style={styles.loadingText}>Cargando partido...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.screenTitle}>{matchTitle || 'Partido en directo'}</Text>

        <View style={styles.timerBox}>
          <Text style={styles.timerLabel}>MINUTO</Text>
          <Text style={styles.timerValue}>{elapsedLabel}</Text>
          <View style={styles.timerControls}>
            <TouchableOpacity style={styles.timerAdjustButton} onPress={() => adjustMinute(-1)}>
              <Text style={styles.timerAdjustText}>-1</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.timerMainButton} onPress={handleStartStop}>
              <Ionicons name={running ? 'pause' : 'play'} size={18} color="#fff" />
              <Text style={styles.timerMainText}>{running ? 'Pausar' : 'Iniciar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.timerAdjustButton} onPress={() => adjustMinute(1)}>
              <Text style={styles.timerAdjustText}>+1</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionButton, styles.goalButton]} onPress={() => logEvent('goal')} disabled={logging}>
            <Ionicons name="football" size={26} color="#fff" />
            <Text style={styles.actionButtonText}>GOL</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.saveButton]} onPress={() => logEvent('save')} disabled={logging}>
            <Ionicons name="hand-left" size={26} color="#fff" />
            <Text style={styles.actionButtonText}>PARADA</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Eventos registrados ({events.length})</Text>

        {events.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Todavía no hay goles ni paradas anotadas.</Text>
          </View>
        ) : (
          events.map((event) => (
            <TouchableOpacity key={event.id} style={styles.eventRow} activeOpacity={0.85} onPress={() => openEdit(event)}>
              <View style={styles.eventMinuteBox}>
                <Text style={styles.eventMinuteText}>{event.minute}'</Text>
              </View>
              <Ionicons name={TYPE_ICON[event.type]} size={20} color={event.type === 'goal' ? '#ff8c4d' : '#4db1ff'} />
              <View style={styles.eventBody}>
                <Text style={styles.eventType}>{TYPE_LABEL[event.type]}</Text>
                <Text style={styles.eventPlayer}>
                  {event.player_name || 'Sin jugador · toca para añadir'}
                  {event.team_color ? ` · ${event.team_color === 'white' ? 'Blancos' : 'Negros'}` : ''}
                </Text>
              </View>
              <TouchableOpacity style={styles.starButton} onPress={() => toggleCandidate(event)}>
                <Ionicons name={event.is_candidate ? 'star' : 'star-outline'} size={22} color={event.is_candidate ? '#f4c95d' : '#666'} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => deleteEvent(event)}>
                <Ionicons name="trash-outline" size={18} color="#888" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}

        <TouchableOpacity
          style={styles.summaryButton}
          onPress={() => navigation.navigate('AdminMatchSummary', { matchId, matchTitle })}
        >
          <Text style={styles.summaryButtonText}>Finalizar y ver resumen</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={!!editingEvent} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{editingEvent ? TYPE_LABEL[editingEvent.type] : ''}</Text>

            <Text style={styles.modalLabel}>Minuto</Text>
            <TextInput
              style={styles.modalInput}
              value={editMinute}
              onChangeText={setEditMinute}
              keyboardType="number-pad"
            />

            <Text style={styles.modalLabel}>Jugador</Text>
            <TextInput
              style={styles.modalInput}
              value={editPlayerName}
              onChangeText={setEditPlayerName}
              placeholder="Nombre del jugador"
              placeholderTextColor="#666"
            />

            {(roster.white.length > 0 || roster.black.length > 0) && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                {roster.white.map((p) => (
                  <TouchableOpacity key={`w-${p.inscription_id}`} style={styles.chipWhite} onPress={() => pickPlayerForEdit(p, 'white')}>
                    <Text style={styles.chipWhiteText}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
                {roster.black.map((p) => (
                  <TouchableOpacity key={`b-${p.inscription_id}`} style={styles.chipBlack} onPress={() => pickPlayerForEdit(p, 'black')}>
                    <Text style={styles.chipBlackText}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={closeEdit}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveButton} onPress={saveEdit} disabled={savingEdit}>
                {savingEdit ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { padding: 16, paddingBottom: 40 },
  centeredContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  loadingText: { marginTop: 12, color: '#fff', fontSize: 16 },
  screenTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 16 },
  timerBox: { backgroundColor: '#111', borderRadius: 18, borderWidth: 1, borderColor: '#222', padding: 18, alignItems: 'center', marginBottom: 16 },
  timerLabel: { color: '#888', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  timerValue: { color: '#fff', fontSize: 44, fontWeight: '900', marginTop: 4, fontVariant: ['tabular-nums'] },
  timerControls: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  timerAdjustButton: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  timerAdjustText: { color: '#fff', fontWeight: '800' },
  timerMainButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ff5a00', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 },
  timerMainText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionButton: { flex: 1, borderRadius: 18, paddingVertical: 22, alignItems: 'center', gap: 6 },
  goalButton: { backgroundColor: '#ff5a00' },
  saveButton: { backgroundColor: '#1f6fb2' },
  actionButtonText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 10 },
  emptyState: { backgroundColor: '#111', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#1f1f1f', alignItems: 'center' },
  emptyText: { color: '#888', fontSize: 13, textAlign: 'center' },
  eventRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 14, borderWidth: 1, borderColor: '#222', padding: 12, marginBottom: 10, gap: 10 },
  eventMinuteBox: { width: 40, height: 34, borderRadius: 9, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  eventMinuteText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  eventBody: { flex: 1 },
  eventType: { color: '#fff', fontWeight: '700', fontSize: 14 },
  eventPlayer: { color: '#999', fontSize: 12, marginTop: 2 },
  starButton: { padding: 6 },
  deleteButton: { padding: 6 },
  summaryButton: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  summaryButtonText: { color: '#111', fontSize: 15, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalBox: { width: '100%', maxWidth: 420, backgroundColor: '#141414', borderRadius: 18, borderWidth: 1, borderColor: '#262626', padding: 18 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  modalLabel: { color: '#999', fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  modalInput: { backgroundColor: '#1c1c1c', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 14 },
  chipRow: { marginTop: 12 },
  chipWhite: { backgroundColor: '#f1f1f1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
  chipWhiteText: { color: '#111', fontSize: 12, fontWeight: '700' },
  chipBlack: { backgroundColor: '#222', borderWidth: 1, borderColor: '#3a3a3a', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
  chipBlackText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  modalButtonRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalCancelButton: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  modalCancelText: { color: '#ccc', fontWeight: '700' },
  modalSaveButton: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: '#ff5a00' },
  modalSaveText: { color: '#fff', fontWeight: '800' },
});
