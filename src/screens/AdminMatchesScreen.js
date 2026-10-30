

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://api.easyfutbol.es';

const STATUS_LABELS = {
  draft: 'Borrador',
  open: 'Abierto',
  full: 'Completo',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
  finished: 'Finalizado',
};

function formatDate(dateString) {
  if (!dateString) return 'Sin fecha';

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTime(timeString) {
  if (!timeString) return '--:--';
  return String(timeString).slice(0, 5);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SHORT_DATE = { day: 'numeric', month: 'short' };

// Lunes (a mediodía UTC, para no bailar con el horario de verano) de la semana del partido.
function weekStartOf(dateString) {
  const [year, month, day] = String(dateString || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - weekday * DAY_MS);
}

function currentWeekStart() {
  const now = new Date();
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return weekStartOf(local);
}

function weekLabel(start, thisWeek) {
  const diff = Math.round((start.getTime() - thisWeek.getTime()) / (7 * DAY_MS));
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const range = `${start.toLocaleDateString('es-ES', { ...SHORT_DATE, timeZone: 'UTC' })} – ${end.toLocaleDateString('es-ES', { ...SHORT_DATE, timeZone: 'UTC' })}`;
  if (diff === 0) return { title: 'Esta semana', range };
  if (diff === 1) return { title: 'Próxima semana', range };
  if (diff === -1) return { title: 'Semana pasada', range };
  return { title: `Semana del ${range}`, range: '' };
}

const matchDate = (match) => match.local_match_date || match.match_date;
const matchSortKey = (match) => `${String(matchDate(match) || '').slice(0, 10)} ${match.local_start_time || match.start_time || ''}`;

// Esta semana primero, luego las siguientes en orden, y al final las pasadas
// de la más reciente a la más antigua (plegadas por defecto).
function groupByWeek(matches) {
  const thisWeek = currentWeekStart();
  const weeks = new Map();
  matches.forEach((match) => {
    const start = weekStartOf(matchDate(match));
    const key = start ? start.toISOString().slice(0, 10) : 'sin-fecha';
    if (!weeks.has(key)) weeks.set(key, { key, start, data: [] });
    weeks.get(key).data.push(match);
  });
  return [...weeks.values()]
    .map((week) => ({
      ...week,
      past: Boolean(week.start) && week.start < thisWeek,
      ...(week.start ? weekLabel(week.start, thisWeek) : { title: 'Sin fecha', range: '' }),
      data: week.data.sort((a, b) => matchSortKey(a).localeCompare(matchSortKey(b))),
    }))
    .sort((a, b) => {
      if (!a.start || !b.start) return a.start ? -1 : 1;
      if (a.past !== b.past) return a.past ? 1 : -1;
      return a.past ? b.start - a.start : a.start - b.start;
    });
}

export default function AdminMatchesScreen({ navigation }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [expandedWeeks, setExpandedWeeks] = useState({});

  const fetchMatches = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError('');

      const token = await AsyncStorage.getItem('token');

      if (!token) {
        setError('No se encontró la sesión. Inicia sesión de nuevo.');
        setMatches([]);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/matches`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'No se pudieron cargar los partidos');
      }

      setMatches(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Error cargando partidos');
      setMatches([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchMatches();
    }, [fetchMatches])
  );

  const handleEditPress = (match) => {
    navigation.navigate('AdminMatchEdit', {
      matchId: match.id,
      matchTitle: match.title,
    });
  };

  const handleCreatePress = () => {
    if (navigation?.navigate) {
      navigation.navigate('AdminCreateMatch');
    } else {
      Alert.alert('Pantalla no disponible', 'Aún no está conectada la pantalla de crear partido.');
    }
  };

  const handleStatsPress = (match) => {
    navigation.navigate('AdminMatchStatsImport', {
      matchId: match.id,
      matchTitle: match.title,
    });
  };
  const handleRosterPress = (match) => navigation.navigate('AdminMatchRoster', { matchId:match.id,matchTitle:match.title });
  const handleLivePress = (match) => navigation.navigate('AdminMatchLive', { matchId:match.id,matchTitle:match.title });
  const markVideoUploaded = (match) => {
    const alreadySent = Boolean(match.video_available_at);
    Alert.alert(
      alreadySent ? 'Vídeo ya avisado' : 'Vídeo subido',
      alreadySent
        ? 'Ya se avisó a los jugadores de este partido. Solo recibirán el aviso los que no lo tuvieran.'
        : `Se enviará una notificación a los jugadores que fueron a ${match.title || 'este partido'} diciendo que el vídeo ya está disponible.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Avisar',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('token');
              const response = await fetch(`${API_BASE_URL}/api/admin/matches/${match.id}/video-available`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data?.error || 'No se pudo avisar');
              Alert.alert('Aviso enviado', `Notificados ${data.sent} de ${data.total} jugador(es).`);
              fetchMatches(true);
            } catch (err) {
              Alert.alert('Vídeo subido', err.message);
            }
          },
        },
      ]
    );
  };
  const duplicateMatch = (match) => Alert.alert('Duplicar partido',`Se creará una copia de ${match.title} exactamente una semana después.`,[{text:'Cancelar',style:'cancel'},{text:'Duplicar',onPress:async()=>{try{const token=await AsyncStorage.getItem('token');const response=await fetch(`${API_BASE_URL}/api/admin/matches/${match.id}/duplicate`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}});const data=await response.json();if(!response.ok)throw new Error(data?.error||'No se pudo duplicar');Alert.alert('Partido duplicado','La copia ya aparece en el listado.');fetchMatches();}catch(error){Alert.alert('Duplicar',error.message);}}}]);

  const locations = useMemo(() => {
    const byId = new Map();
    matches.forEach((match) => {
      const id = String(match.location_id ?? 'otras');
      if (!byId.has(id)) byId.set(id, { id, name: match.location_name || match.city || 'Otras', count: 0 });
      byId.get(id).count += 1;
    });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [matches]);

  const activeLocation = locations.some((location) => location.id === selectedLocation)
    ? selectedLocation
    : locations[0]?.id ?? null;

  const sections = useMemo(
    () => groupByWeek(matches.filter((match) => String(match.location_id ?? 'otras') === activeLocation)),
    [matches, activeLocation]
  );

  const isWeekOpen = (section) => expandedWeeks[section.key] ?? !section.past;
  const toggleWeek = (section) => setExpandedWeeks((current) => ({ ...current, [section.key]: !isWeekOpen(section) }));
  const visibleSections = sections.map((section) => (isWeekOpen(section) ? section : { ...section, data: [] }));

  const renderSectionHeader = ({ section }) => {
    const full = sections.find((week) => week.key === section.key);
    const open = isWeekOpen(section);
    return (
      <TouchableOpacity activeOpacity={0.8} style={styles.weekHeader} onPress={() => toggleWeek(section)}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.weekTitle, section.past && styles.weekTitlePast]}>{section.title}</Text>
          {section.range ? <Text style={styles.weekRange}>{section.range}</Text> : null}
        </View>
        <Text style={styles.weekCount}>{full?.data.length || 0} {full?.data.length === 1 ? 'partido' : 'partidos'}</Text>
        <Text style={styles.weekChevron}>{open ? '▾' : '▸'}</Text>
      </TouchableOpacity>
    );
  };

  const renderMatchCard = ({ item }) => {
    const statusLabel = STATUS_LABELS[item.status] || item.status || 'Sin estado';
    const played = new Date(item.starts_at).getTime() <= Date.now();

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.card}
        onPress={() => handleEditPress(item)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.title}>{item.title || 'Partido sin nombre'}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        </View>

        <Text style={styles.metaText}>
          {formatDate(item.local_match_date || item.match_date)} · {formatTime(item.local_start_time || item.start_time)} - {formatTime(item.local_end_time || item.end_time)}
        </Text>

        <Text style={styles.metaText}>
          {item.city || 'Sin ciudad'} · {item.field_name || 'Sin campo'}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Plazas</Text>
            <Text style={styles.statValue}>{item.total_slots ?? '-'}</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Libres</Text>
            <Text style={styles.statValue}>{item.available_slots ?? '-'}</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Espera</Text>
            <Text style={styles.statValue}>{item.waitlist_count ?? 0}</Text>
          </View>
        </View>

        {Number(item.risk)===1&&<View style={styles.riskCard}><Text style={styles.riskTitle}>RIESGO DE NO COMPLETARSE</Text><Text style={styles.riskText}>Faltan {item.available_slots} jugadores y quedan menos de 48 horas.</Text></View>}

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.editButton} onPress={() => handleEditPress(item)}>
            <Text style={styles.editButtonText}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.liveButton} onPress={() => handleLivePress(item)}>
            <Text style={styles.liveButtonText}>⚽ Apuntar eventos</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.secondaryRow}>
          <TouchableOpacity onPress={() => handleRosterPress(item)}><Text style={styles.secondaryLink}>Ver plantilla · {item.confirmed_count||0}</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => handleStatsPress(item)}><Text style={styles.secondaryLink}>Cargar CSV</Text></TouchableOpacity>
          <TouchableOpacity onPress={()=>duplicateMatch(item)}><Text style={styles.secondaryLink}>Duplicar</Text></TouchableOpacity>
        </View>

        {played && (
          <TouchableOpacity
            style={[styles.videoButton, item.video_available_at && styles.videoButtonDone]}
            onPress={() => markVideoUploaded(item)}
          >
            <Text style={[styles.videoButtonText, item.video_available_at && styles.videoButtonTextDone]}>
              {item.video_available_at ? '✓ Vídeo avisado' : '🎬 Vídeo subido · avisar jugadores'}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#ff5a00" />
        <Text style={styles.loadingText}>Cargando partidos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <Text style={styles.screenTitle}>Administrar partidos</Text>
        <Text style={styles.screenSubtitle}>
          Aquí puedes revisar y editar los partidos ya creados.
        </Text>

        <TouchableOpacity style={styles.createButton} onPress={handleCreatePress}>
          <Text style={styles.createButtonText}>Crear nuevo partido</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.scheduledButton} onPress={() => navigation.navigate('AdminScheduledMatches')}>
          <Text style={styles.scheduledButtonText}>Ver partidos programados</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchMatches()}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {locations.length > 0 && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.locationTabs}>
            {locations.map((location) => {
              const active = location.id === activeLocation;
              return (
                <TouchableOpacity
                  key={location.id}
                  style={[styles.locationTab, active && styles.locationTabActive]}
                  onPress={() => setSelectedLocation(location.id)}
                >
                  <Text style={[styles.locationTabText, active && styles.locationTabTextActive]}>
                    {location.name} · {location.count}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <SectionList
        sections={visibleSections}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderMatchCard}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled
        contentContainerStyle={sections.length === 0 ? styles.emptyListContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchMatches(true)}
            tintColor="#ff5a00"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No hay partidos disponibles</Text>
            <Text style={styles.emptySubtitle}>
              Cuando existan partidos creados, aparecerán aquí para editarlos.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#fff',
    fontSize: 16,
  },
  topSection: {
    marginBottom: 18,
  },
  screenTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 6,
  },
  screenSubtitle: {
    color: '#b3b3b3',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  createButton: {
    backgroundColor: '#ff5a00',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  scheduledButton: {
    borderWidth: 1,
    borderColor: '#ff5a00',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  scheduledButtonText: {
    color: '#ff8c4d',
    fontSize: 15,
    fontWeight: '800',
  },
  errorBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#ff5a00',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 10,
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#ff5a00',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  emptyState: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: '#1f1f1f',
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#9c9c9c',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#222',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  statusBadge: {
    backgroundColor: 'rgba(255, 90, 0, 0.16)',
    borderWidth: 1,
    borderColor: '#ff5a00',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    color: '#ff8c4d',
    fontSize: 12,
    fontWeight: '700',
  },
  metaText: {
    color: '#c2c2c2',
    fontSize: 14,
    marginBottom: 6,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 16,
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#181818',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#252525',
  },
  statLabel: {
    color: '#9f9f9f',
    fontSize: 12,
    marginBottom: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  editButton: {
    flex: 1,
    minHeight: 50,
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  liveButton: { flex: 1, minHeight: 50, backgroundColor: '#ff5a00', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  liveButtonText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  secondaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 2 },
  secondaryLink: { color: '#888', fontSize: 11, fontWeight: '700' },
  videoButton: { marginTop: 12, borderWidth: 1, borderColor: '#ff5a00', borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  videoButtonDone: { borderColor: '#2a2a2a', backgroundColor: '#151515' },
  videoButtonText: { color: '#ff8c4d', fontSize: 13, fontWeight: '800' },
  videoButtonTextDone: { color: '#22c55e' },
  locationTabs: { gap: 8, paddingBottom: 12 },
  locationTab: { borderWidth: 1, borderColor: '#2a2a2a', backgroundColor: '#111', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  locationTabActive: { backgroundColor: '#ff5a00', borderColor: '#ff5a00' },
  locationTabText: { color: '#bbb', fontSize: 13, fontWeight: '800' },
  locationTabTextActive: { color: '#fff' },
  weekHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#000', paddingVertical: 10, gap: 10 },
  weekTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  weekTitlePast: { color: '#8a8a8a' },
  weekRange: { color: '#777', fontSize: 12, marginTop: 2 },
  weekCount: { color: '#888', fontSize: 12, fontWeight: '700' },
  weekChevron: { color: '#ff8c4d', fontSize: 16, width: 16, textAlign: 'center' },
  riskCard:{backgroundColor:'rgba(244,201,93,.09)',borderWidth:1,borderColor:'rgba(244,201,93,.3)',borderRadius:12,padding:11,marginBottom:11},riskTitle:{color:'#f4c95d',fontSize:9,fontWeight:'900',letterSpacing:.8},riskText:{color:'#aaa07f',fontSize:10,marginTop:4},
});
