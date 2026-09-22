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
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';

const TYPE_LABEL = { goal: 'Gol', save: 'Parada', mvp: 'MVP' };
const TYPE_ICON = { goal: 'football', save: 'hand-left', mvp: 'star' };

function pad2(n) {
  return String(n).padStart(2, '0');
}

function PlayerRow({ player, onPress }) {
  return (
    <TouchableOpacity style={styles.playerRow} onPress={() => onPress(player)} activeOpacity={0.75}>
      {player.avatar_url ? (
        <Image source={{ uri: player.avatar_url }} style={styles.playerAvatar} />
      ) : (
        <View style={[styles.playerAvatar, styles.playerAvatarPlaceholder]}>
          <Text style={styles.playerAvatarInitial}>{(player.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
      <Text style={styles.playerId}>#{player.user_id}</Text>
    </TouchableOpacity>
  );
}

export default function AdminMatchLiveScreen({ navigation, route }) {
  const matchId = route?.params?.matchId;
  const matchTitle = route?.params?.matchTitle || '';

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [offsetMinutes, setOffsetMinutes] = useState(0);
  const [, setTick] = useState(0);
  const [editingMinute, setEditingMinute] = useState(false);
  const [minuteInput, setMinuteInput] = useState('');

  const [roster, setRoster] = useState({ white: [], black: [] });

  // picker: { mode: 'goal-scorer'|'goal-assist'|'save'|'mvp', minute, scorer? }
  const [picker, setPicker] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [editingEvent, setEditingEvent] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [applyingResult, setApplyingResult] = useState(false);

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

  const allPlayers = useMemo(
    () => [
      ...roster.white.map((p) => ({ ...p, user_id: p.user_id, color: 'white' })),
      ...roster.black.map((p) => ({ ...p, user_id: p.user_id, color: 'black' })),
    ],
    [roster]
  );

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

  const adjustMinute = (delta) => setOffsetMinutes((prev) => Math.max(0, prev + delta));

  const openMinuteEdit = () => {
    setMinuteInput(String(currentMinute));
    setEditingMinute(true);
  };

  const confirmMinuteEdit = () => {
    const minute = Number(minuteInput);
    if (!Number.isInteger(minute) || minute < 0) return Alert.alert('Minuto inválido', 'Escribe un número de minuto válido.');
    setOffsetMinutes(minute);
    if (running) setStartedAt(Date.now());
    setEditingMinute(false);
  };

  // --- flujo de registrar eventos con jugadores reales ---

  const startGoalFlow = () => {
    if (!allPlayers.length) return Alert.alert('Sin jugadores', 'Todavía no hay nadie confirmado en este partido.');
    setPicker({ mode: 'goal-scorer', minute: currentMinute });
  };

  const startSaveFlow = () => {
    if (!allPlayers.length) return Alert.alert('Sin jugadores', 'Todavía no hay nadie confirmado en este partido.');
    setPicker({ mode: 'save', minute: currentMinute });
  };

  const startMvpFlow = () => {
    if (!allPlayers.length) return Alert.alert('Sin jugadores', 'Todavía no hay nadie confirmado en este partido.');
    setPicker({ mode: 'mvp' });
  };

  const submitEvent = async (body) => {
    try {
      setSubmitting(true);
      const res = await api.post(`/admin/matches/${matchId}/events`, body);
      const created = res.data?.data;
      if (created) {
        setEvents((prev) => {
          const withoutOldMvp = created.type === 'mvp' ? prev.filter((e) => e.type !== 'mvp') : prev;
          return [...withoutOldMvp, created].sort((a, b) => (a.minute ?? -1) - (b.minute ?? -1) || a.id - b.id);
        });
      }
      setPicker(null);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo registrar el evento');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePickPlayer = (player) => {
    if (!picker) return;
    if (picker.mode === 'goal-scorer') {
      setPicker({ mode: 'goal-assist', minute: picker.minute, scorer: player });
      return;
    }
    if (picker.mode === 'goal-assist') {
      submitEvent({ type: 'goal', minute: picker.minute, user_id: picker.scorer.user_id, assist_user_id: player.user_id, team_color: picker.scorer.color });
      return;
    }
    if (picker.mode === 'save') {
      submitEvent({ type: 'save', minute: picker.minute, user_id: player.user_id, team_color: player.color });
      return;
    }
    if (picker.mode === 'mvp') {
      submitEvent({ type: 'mvp', user_id: player.user_id, team_color: player.color });
    }
  };

  const skipAssist = () => {
    submitEvent({ type: 'goal', minute: picker.minute, user_id: picker.scorer.user_id, team_color: picker.scorer.color });
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
    const message = event.type === 'mvp' ? `¿Quitar el MVP (${event.player_name})?` : `¿Borrar este ${TYPE_LABEL[event.type].toLowerCase()}?`;
    Alert.alert('Eliminar evento', message, [
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
    if (event.type === 'mvp') return; // el MVP se cambia eligiendo otro desde el botón MVP
    setEditingEvent({ ...event, minuteInput: String(event.minute ?? '') });
  };

  const saveEdit = async () => {
    if (!editingEvent) return;
    const minute = Number(editingEvent.minuteInput);
    if (!Number.isInteger(minute) || minute < 0) return Alert.alert('Minuto inválido', 'Escribe un minuto válido.');
    try {
      setSavingEdit(true);
      const res = await api.put(`/admin/matches/${matchId}/events/${editingEvent.id}`, { minute });
      const updated = res.data?.data;
      if (updated) setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)).sort((a, b) => (a.minute ?? -1) - (b.minute ?? -1) || a.id - b.id));
      setEditingEvent(null);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo guardar');
    } finally {
      setSavingEdit(false);
    }
  };

  const applyResult = (winner) => {
    const labels = { white: 'ganan los blancos', black: 'ganan los negros', draw: 'empate' };
    Alert.alert('Aplicar resultado', `Se marcará "${labels[winner]}" en las estadísticas de todos los jugadores confirmados. ¿Continuar?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aplicar',
        onPress: async () => {
          try {
            setApplyingResult(true);
            const res = await api.post(`/admin/matches/${matchId}/events/result`, { winner });
            Alert.alert('Listo', res.data?.msg || 'Resultado aplicado.');
          } catch (e) {
            Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo aplicar el resultado');
          } finally {
            setApplyingResult(false);
          }
        },
      },
    ]);
  };

  const mvpEvent = events.find((e) => e.type === 'mvp');
  const timelineEvents = events.filter((e) => e.type !== 'mvp');

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
          {editingMinute ? (
            <View style={styles.minuteEditRow}>
              <TextInput
                style={styles.minuteEditInput}
                value={minuteInput}
                onChangeText={setMinuteInput}
                keyboardType="number-pad"
                autoFocus
                selectTextOnFocus
                onSubmitEditing={confirmMinuteEdit}
              />
              <TouchableOpacity style={styles.minuteEditConfirm} onPress={confirmMinuteEdit}>
                <Ionicons name="checkmark" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.minuteEditCancel} onPress={() => setEditingMinute(false)}>
                <Ionicons name="close" size={20} color="#999" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={openMinuteEdit} activeOpacity={0.7}>
              <Text style={styles.timerValue}>{elapsedLabel}</Text>
              <Text style={styles.timerEditHint}>Toca para escribir el minuto</Text>
            </TouchableOpacity>
          )}
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
          <TouchableOpacity style={[styles.actionButton, styles.goalButton]} onPress={startGoalFlow}>
            <Ionicons name="football" size={28} color="#fff" />
            <Text style={styles.actionButtonText}>GOL</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.saveButton]} onPress={startSaveFlow}>
            <Ionicons name="hand-left" size={28} color="#fff" />
            <Text style={styles.actionButtonText}>PARADA</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.mvpButton}>
          <TouchableOpacity style={styles.mvpButtonMain} onPress={startMvpFlow}>
            <Ionicons name="star" size={20} color="#f4c95d" />
            <Text style={styles.mvpButtonText}>
              {mvpEvent ? `MVP: ${mvpEvent.player_name}` : 'Marcar MVP del partido'}
            </Text>
            {!mvpEvent && <Ionicons name="chevron-forward" size={16} color="#888" />}
          </TouchableOpacity>
          {mvpEvent && (
            <TouchableOpacity style={styles.mvpDeleteButton} onPress={() => deleteEvent(mvpEvent)}>
              <Ionicons name="trash-outline" size={18} color="#888" />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.sectionTitle}>Eventos registrados ({timelineEvents.length})</Text>

        {timelineEvents.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Todavía no hay goles ni paradas anotadas.</Text>
          </View>
        ) : (
          timelineEvents.map((event) => (
            <TouchableOpacity key={event.id} style={styles.eventRow} activeOpacity={0.85} onPress={() => openEdit(event)}>
              <View style={styles.eventMinuteBox}>
                <Text style={styles.eventMinuteText}>{event.minute}'</Text>
              </View>
              <Ionicons name={TYPE_ICON[event.type]} size={20} color={event.type === 'goal' ? '#ff8c4d' : '#4db1ff'} />
              <View style={styles.eventBody}>
                <Text style={styles.eventType}>{TYPE_LABEL[event.type]}</Text>
                <Text style={styles.eventPlayer}>
                  {event.player_name || 'Jugador'}
                  {event.assist_name ? ` · asiste ${event.assist_name}` : ''}
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

        <Text style={styles.sectionTitle}>Resultado del partido</Text>
        <Text style={styles.resultHint}>Aplica el resultado final para completar el ranking (victorias/derrotas/empates).</Text>
        <View style={styles.resultRow}>
          <TouchableOpacity style={styles.resultButtonWhite} onPress={() => applyResult('white')} disabled={applyingResult}>
            <Text style={styles.resultButtonWhiteText}>Ganan blancos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resultButtonDraw} onPress={() => applyResult('draw')} disabled={applyingResult}>
            <Text style={styles.resultButtonDrawText}>Empate</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resultButtonBlack} onPress={() => applyResult('black')} disabled={applyingResult}>
            <Text style={styles.resultButtonBlackText}>Ganan negros</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.summaryButton}
          onPress={() => navigation.navigate('AdminMatchSummary', { matchId, matchTitle })}
        >
          <Text style={styles.summaryButtonText}>Ver resumen para los recortes</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Selector de jugador: marcador, asistencia, portero de la parada, o MVP */}
      <Modal visible={!!picker} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>
              {picker?.mode === 'goal-scorer' && '¿Quién ha marcado?'}
              {picker?.mode === 'goal-assist' && '¿Alguna asistencia?'}
              {picker?.mode === 'save' && '¿Quién ha parado?'}
              {picker?.mode === 'mvp' && '¿Quién es el MVP?'}
            </Text>

            {picker?.mode === 'goal-assist' && (
              <TouchableOpacity style={styles.skipAssistButton} onPress={skipAssist} disabled={submitting}>
                <Text style={styles.skipAssistButtonText}>Sin asistencia</Text>
              </TouchableOpacity>
            )}

            {submitting ? (
              <ActivityIndicator color="#ff5a00" style={{ marginVertical: 20 }} />
            ) : (
              <ScrollView style={styles.pickerList}>
                <Text style={styles.pickerTeamLabel}>Blancos</Text>
                {roster.white.map((p) => (
                  <PlayerRow key={`w-${p.user_id}`} player={{ ...p, color: 'white' }} onPress={handlePickPlayer} />
                ))}
                <Text style={styles.pickerTeamLabel}>Negros</Text>
                {roster.black.map((p) => (
                  <PlayerRow key={`b-${p.user_id}`} player={{ ...p, color: 'black' }} onPress={handlePickPlayer} />
                ))}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.pickerCancelButton} onPress={() => setPicker(null)}>
              <Text style={styles.pickerCancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Editar minuto de un evento ya registrado */}
      <Modal visible={!!editingEvent} transparent animationType="fade" onRequestClose={() => setEditingEvent(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{editingEvent ? `${TYPE_LABEL[editingEvent.type]} · ${editingEvent.player_name}` : ''}</Text>

            <Text style={styles.modalLabel}>Minuto</Text>
            <TextInput
              style={styles.modalInput}
              value={editingEvent?.minuteInput ?? ''}
              onChangeText={(v) => setEditingEvent((prev) => ({ ...prev, minuteInput: v }))}
              keyboardType="number-pad"
            />

            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setEditingEvent(null)}>
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
  timerValue: { color: '#fff', fontSize: 44, fontWeight: '900', marginTop: 4, fontVariant: ['tabular-nums'], textAlign: 'center' },
  timerEditHint: { color: '#666', fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  minuteEditRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  minuteEditInput: { width: 100, backgroundColor: '#1c1c1c', borderWidth: 1, borderColor: '#333', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  minuteEditConfirm: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#ff5a00', alignItems: 'center', justifyContent: 'center' },
  minuteEditCancel: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  timerControls: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  timerAdjustButton: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  timerAdjustText: { color: '#fff', fontWeight: '800' },
  timerMainButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ff5a00', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12 },
  timerMainText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  actionButton: { flex: 1, borderRadius: 18, paddingVertical: 26, alignItems: 'center', gap: 6 },
  goalButton: { backgroundColor: '#ff5a00' },
  saveButton: { backgroundColor: '#1f6fb2' },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  mvpButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#181818', borderWidth: 1, borderColor: 'rgba(244,201,93,0.35)', borderRadius: 14, marginBottom: 24 },
  mvpButtonMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  mvpButtonText: { flex: 1, color: '#f4c95d', fontSize: 14, fontWeight: '800' },
  mvpDeleteButton: { paddingHorizontal: 14, paddingVertical: 14 },
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
  resultHint: { color: '#777', fontSize: 12, marginTop: -6, marginBottom: 12, lineHeight: 17 },
  resultRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  resultButtonWhite: { flex: 1, backgroundColor: '#f1f1f1', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  resultButtonWhiteText: { color: '#111', fontSize: 12, fontWeight: '900' },
  resultButtonDraw: { flex: 1, backgroundColor: '#222', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  resultButtonDrawText: { color: '#ccc', fontSize: 12, fontWeight: '900' },
  resultButtonBlack: { flex: 1, backgroundColor: '#000', borderWidth: 1, borderColor: '#333', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  resultButtonBlackText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  summaryButton: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  summaryButtonText: { color: '#111', fontSize: 15, fontWeight: '800' },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#141414', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: '#262626', padding: 18, maxHeight: '80%' },
  pickerTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  skipAssistButton: { backgroundColor: '#222', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 12 },
  skipAssistButtonText: { color: '#ccc', fontSize: 14, fontWeight: '800' },
  pickerList: { marginBottom: 10 },
  pickerTeamLabel: { color: '#888', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 10, marginBottom: 6 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1c1c1c', borderRadius: 14, padding: 12, marginBottom: 8, minHeight: 60 },
  playerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#333' },
  playerAvatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  playerAvatarInitial: { color: '#fff', fontWeight: '900' },
  playerName: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
  playerId: { color: '#666', fontSize: 11, fontWeight: '700' },
  pickerCancelButton: { paddingVertical: 12, alignItems: 'center' },
  pickerCancelButtonText: { color: '#888', fontSize: 13, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalBox: { width: '100%', maxWidth: 420, backgroundColor: '#141414', borderRadius: 18, borderWidth: 1, borderColor: '#262626', padding: 18 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  modalLabel: { color: '#999', fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  modalInput: { backgroundColor: '#1c1c1c', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 14 },
  modalButtonRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalCancelButton: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  modalCancelText: { color: '#ccc', fontWeight: '700' },
  modalSaveButton: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: '#ff5a00' },
  modalSaveText: { color: '#fff', fontWeight: '800' },
});
