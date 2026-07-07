

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';

const ORANGE = '#ff5a00';
const DARK = '#050505';
const CARD = '#151515';
const CARD_SOFT = '#1f1f1f';
const TEXT = '#ffffff';
const MUTED = '#aaaaaa';
const BORDER = '#2a2a2a';

const fieldInfo = {
  rondilla: {
    name: 'Rondilla',
    mapsUrl: 'https://maps.google.com/?q=Campo+La+Rondilla+Valladolid',
    instructions:
      'Intenta llegar por la entrada principal del complejo. Si es tu primera vez, ve con algo de margen para localizar el campo de fútbol 7.',
  },
  canterac: {
    name: 'Canterac',
    mapsUrl: 'https://maps.google.com/?q=Complejo+Deportivo+Canterac+Valladolid',
    instructions:
      'Accede por la entrada principal del complejo deportivo. El campo de fútbol 7 está dentro de la instalación.',
  },
  ribera: {
    name: 'Ribera de Castilla',
    mapsUrl: 'https://maps.google.com/?q=Ribera+de+Castilla+Valladolid+campo+futbol',
    instructions:
      'Accede al recinto con tiempo suficiente. Busca la zona de campos de fútbol y revisa el grupo por si hay alguna indicación extra.',
  },
  'ribera de castilla': {
    name: 'Ribera de Castilla',
    mapsUrl: 'https://maps.google.com/?q=Ribera+de+Castilla+Valladolid+campo+futbol',
    instructions:
      'Accede al recinto con tiempo suficiente. Busca la zona de campos de fútbol y revisa el grupo por si hay alguna indicación extra.',
  },
  'san pedro': {
    name: 'San Pedro Regalado',
    mapsUrl: 'https://maps.google.com/?q=Campo+San+Pedro+Regalado+Valladolid',
    instructions:
      'Llega con margen para encontrar el acceso correcto al campo. Revisa la camiseta antes de salir de casa.',
  },
  'san pedro regalado': {
    name: 'San Pedro Regalado',
    mapsUrl: 'https://maps.google.com/?q=Campo+San+Pedro+Regalado+Valladolid',
    instructions:
      'Llega con margen para encontrar el acceso correcto al campo. Revisa la camiseta antes de salir de casa.',
  },
  'hermanos lesmes': {
    name: 'Hermanos Lesmes',
    mapsUrl: 'https://maps.google.com/?q=Campo+Hermanos+Lesmes+Valladolid',
    instructions:
      'Accede al campo con unos minutos de margen para organizar equipos y empezar puntuales.',
  },
  'martin luquero': {
    name: 'Martín Luquero',
    mapsUrl: 'https://maps.google.com/?q=Campo+Martin+Luquero+Valladolid',
    instructions:
      'Ve con algo de tiempo si no conoces el campo. Revisa bien el color de camiseta antes de llegar.',
  },
  'martín luquero': {
    name: 'Martín Luquero',
    mapsUrl: 'https://maps.google.com/?q=Campo+Martin+Luquero+Valladolid',
    instructions:
      'Ve con algo de tiempo si no conoces el campo. Revisa bien el color de camiseta antes de llegar.',
  },
};

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function formatDate(value) {
  if (!value) return 'Fecha pendiente';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatTime(value) {
  if (!value) return '';

  const stringValue = String(value);
  if (/^\d{2}:\d{2}/.test(stringValue)) {
    return stringValue.slice(0, 5);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return stringValue;

  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getFieldDetails(fieldName) {
  const normalized = normalizeText(fieldName);

  if (fieldInfo[normalized]) {
    return fieldInfo[normalized];
  }

  const key = Object.keys(fieldInfo).find((item) => normalized.includes(item));

  if (key) {
    return fieldInfo[key];
  }

  return {
    name: fieldName || 'Campo pendiente',
    mapsUrl: `https://maps.google.com/?q=${encodeURIComponent(fieldName || 'EasyFutbol')}`,
    instructions:
      'Revisa la ubicación antes de salir y llega con margen para organizar equipos y empezar a tiempo.',
  };
}

function getTicketColor(ticketType) {
  const normalized = normalizeText(ticketType);

  if (normalized.includes('blanca') || normalized.includes('blanco')) return 'Blanca';
  if (normalized.includes('negra') || normalized.includes('negro')) return 'Negra';

  return ticketType || 'Por confirmar';
}

function getPlayerName(player) {
  return player?.name || player?.nombre || player?.username || player?.user_name || 'Jugador';
}

function getPlayerTicket(player) {
  return player?.ticket_type || player?.ticketType || player?.camiseta || player?.shirt || '';
}

function getItemUserId(item) {
  return item?.user_id || item?.userId || item?.user?.id || item?.player_id || item?.playerId || item?.id;
}

function getItemMatchId(item) {
  return item?.match_id || item?.matchId || item?.match?.id || item?.id;
}

function getItemStartsAt(item) {
  return (
    item?.starts_at ||
    item?.start_time ||
    item?.date ||
    item?.fecha ||
    item?.match?.starts_at ||
    item?.match?.start_time ||
    item?.match?.date ||
    item?.match?.fecha
  );
}

function getItemEndsAt(item) {
  return (
    item?.ends_at ||
    item?.end_time ||
    item?.hora_fin ||
    item?.match?.ends_at ||
    item?.match?.end_time ||
    item?.match?.hora_fin
  );
}

function getItemResult(item) {
  return (
    item?.result ||
    item?.resultado ||
    item?.score ||
    item?.final_score ||
    item?.match?.result ||
    item?.match?.resultado ||
    item?.match?.score ||
    item?.match?.final_score ||
    'Resultado pendiente'
  );
}

function getItemMvp(item) {
  return (
    item?.mvp_name ||
    item?.mvp ||
    item?.mvp_player ||
    item?.match?.mvp_name ||
    item?.match?.mvp ||
    item?.match?.mvp_player ||
    'MVP pendiente'
  );
}

function getPersonalStatValue(item, keys, fallback = 0) {
  for (const key of keys) {
    if (item?.[key] !== undefined && item?.[key] !== null) return item[key];
    if (item?.stats?.[key] !== undefined && item?.stats?.[key] !== null) return item.stats[key];
    if (item?.personal_stats?.[key] !== undefined && item?.personal_stats?.[key] !== null) return item.personal_stats[key];
  }

  return fallback;
}

function getInscriptionId(entry) {
  return entry?.inscription_id || entry?.inscriptionId || entry?.inscription?.id || entry?.id;
}

async function cancelInscriptionRequest(inscriptionId, token) {
  const endpoints = [
    { method: 'patch', url: `/inscriptions/${inscriptionId}/cancel` },
    { method: 'post', url: `/inscriptions/${inscriptionId}/cancel` },
    { method: 'delete', url: `/inscriptions/${inscriptionId}` },
  ];

  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      if (endpoint.method === 'delete') {
        return await api.delete(endpoint.url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }

      return await api[endpoint.method](endpoint.url, null, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;

      if (status !== 404 && status !== 405) {
        throw error;
      }
    }
  }

  throw lastError;
}

function getItemPlayers(item) {
  return (
    item?.players ||
    item?.inscritos ||
    item?.attendees ||
    item?.inscriptions ||
    item?.confirmedPlayers ||
    item?.confirmed_players ||
    item?.match?.players ||
    item?.match?.inscritos ||
    []
  );
}

function extractArrayFromResponse(responseData) {
  return Array.isArray(responseData)
    ? responseData
    : responseData?.data ||
        responseData?.inscriptions ||
        responseData?.matches ||
        responseData?.partidos ||
        responseData?.results ||
        [];
}

async function fetchMyMatchesData(token) {
  try {
    const response = await api.get('/me/inscriptions', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log('Mis partidos cargado desde: /me/inscriptions');
    return {
      endpoint: '/me/inscriptions',
      data: extractArrayFromResponse(response.data),
    };
  } catch (error) {
    console.log('Error cargando /me/inscriptions:', error?.response?.data || error.message);
    throw error;
  }
}

function itemBelongsToUser(item, userId) {
  if (!userId) return true;

  const directUserId = item?.user_id || item?.userId || item?.user?.id || item?.inscription?.user_id;

  if (directUserId && String(directUserId) === String(userId)) {
    return true;
  }

  const players = getItemPlayers(item);

  if (!Array.isArray(players) || players.length === 0) {
    return false;
  }

  return players.some((player) => String(getItemUserId(player)) === String(userId));
}

export default function MisPartidosScreen({ navigation }) {
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const selectedField = useMemo(() => {
    if (!selectedMatch) return null;
    return getFieldDetails(selectedMatch.field || selectedMatch.campo || selectedMatch.location);
  }, [selectedMatch]);

  const teamWhite = useMemo(() => {
    const players = selectedMatch?.players || selectedMatch?.inscritos || selectedMatch?.attendees || [];
    return players.filter((player) => normalizeText(getPlayerTicket(player)).includes('blanc'));
  }, [selectedMatch]);

  const teamBlack = useMemo(() => {
    const players = selectedMatch?.players || selectedMatch?.inscritos || selectedMatch?.attendees || [];
    return players.filter((player) => normalizeText(getPlayerTicket(player)).includes('negr'));
  }, [selectedMatch]);

  const playersWithoutTeam = useMemo(() => {
    const players = selectedMatch?.players || selectedMatch?.inscritos || selectedMatch?.attendees || [];
    return players.filter((player) => {
      const ticket = normalizeText(getPlayerTicket(player));
      return !ticket.includes('blanc') && !ticket.includes('negr');
    });
  }, [selectedMatch]);

  const loadMatches = async () => {
    try {
      const token = await AsyncStorage.getItem('token');

      if (!token) {
        setMatches([]);
        return;
      }

      const storedUser = await AsyncStorage.getItem('user');
      const user = storedUser ? JSON.parse(storedUser) : null;
      const userId = user?.id;

      const { data } = await fetchMyMatchesData(token);
      console.log('Mis inscripciones recibidas:', data.length);

      const groupedByMatch = data.reduce((acc, item) => {
        const match = item.match || item;
        const matchId = getItemMatchId(item);
        const startsAt = getItemStartsAt(item);

        if (!matchId || !startsAt) return acc;

        const rawStatus = normalizeText(item.status || item.estado || item.inscription_status || item?.inscription?.status);
        const isConfirmed = !rawStatus || rawStatus === 'confirmed' || rawStatus === 'confirmado';

        if (!isConfirmed) return acc;

        if (!acc[matchId]) {
          acc[matchId] = {
            ...match,
            id: matchId,
            date: startsAt,
            start_time: startsAt,
            end_time: getItemEndsAt(item),
            title: item.title || item.match_title || item.nombre || item.name || match.title || match.nombre || match.name,
            field: item.field_name || item.field || item.campo || item.location || match.field_name || match.field || match.campo || match.location,
            status: 'Confirmado',
            result: getItemResult(item),
            mvp: getItemMvp(item),
            inscriptions: [],
            players: [],
          };
        }

        acc[matchId].inscriptions.push({
          ...item,
          id: item.inscription_id || item.inscriptionId || item.inscription?.id || item.id,
          ticket_type: item.ticket_type || item.ticketType || item.camiseta || item.inscription?.ticket_type,
        });

        acc[matchId].players.push({
          ...item,
          id: item.user_id || item.userId || item.player_id || item.playerId || item.user?.id || item.id,
          name: item.name || item.nombre || item.user_name || item.user?.name || item.player_name || 'Jugador',
          ticket_type: item.ticket_type || item.ticketType || item.camiseta || item.inscription?.ticket_type,
        });

        return acc;
      }, {});

      const groupedMatches = Object.values(groupedByMatch).sort((a, b) => {
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      });

      console.log('Mis partidos visibles:', groupedMatches.length);
      setMatches(groupedMatches);
    } catch (error) {
      console.log('Error cargando mis inscripciones:', error?.response?.data || error.message);
      setMatches([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMatches();
  }, []);

  const openLocation = async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);

      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Ubicación no disponible', 'No se ha podido abrir la ubicación del campo.');
      }
    } catch (error) {
      Alert.alert('Ubicación no disponible', 'No se ha podido abrir la ubicación del campo.');
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadMatches();
  };

  const handleCancelInscription = (entry) => {
    const inscriptionId = getInscriptionId(entry);

    if (!inscriptionId) {
      Alert.alert('No se puede cancelar', 'No se ha encontrado el identificador de esta entrada.');
      return;
    }

    Alert.alert(
      'Cancelar entrada',
      '¿Quieres cancelar solo esta entrada? Las demás entradas del partido seguirán activas.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('token');

              if (!token) {
                Alert.alert('Sesión expirada', 'Vuelve a iniciar sesión para cancelar la entrada.');
                return;
              }

              await cancelInscriptionRequest(inscriptionId, token);

              setMatches((currentMatches) =>
                currentMatches
                  .map((match) => {
                    const updatedInscriptions = (match.inscriptions || []).filter(
                      (item) => String(getInscriptionId(item)) !== String(inscriptionId)
                    );

                    if (updatedInscriptions.length === 0) {
                      return null;
                    }

                    return {
                      ...match,
                      inscriptions: updatedInscriptions,
                      players: updatedInscriptions,
                      camiseta:
                        updatedInscriptions[0]?.ticket_type ||
                        updatedInscriptions[0]?.ticketType ||
                        updatedInscriptions[0]?.camiseta ||
                        match.camiseta,
                    };
                  })
                  .filter(Boolean)
              );

              setSelectedMatch((currentMatch) => {
                if (!currentMatch) return currentMatch;

                const updatedInscriptions = (currentMatch.inscriptions || []).filter(
                  (item) => String(getInscriptionId(item)) !== String(inscriptionId)
                );

                if (updatedInscriptions.length === 0) {
                  return null;
                }

                return {
                  ...currentMatch,
                  inscriptions: updatedInscriptions,
                  players: updatedInscriptions,
                  camiseta:
                    updatedInscriptions[0]?.ticket_type ||
                    updatedInscriptions[0]?.ticketType ||
                    updatedInscriptions[0]?.camiseta ||
                    currentMatch.camiseta,
                };
              });

              Alert.alert('Entrada cancelada', 'Se ha cancelado solo esta entrada.');
              loadMatches();
            } catch (error) {
              const message =
                error?.response?.data?.message ||
                error?.response?.data?.error ||
                'No se ha podido cancelar la entrada. Inténtalo de nuevo.';

              Alert.alert('No se pudo cancelar', message);
            }
          },
        },
      ]
    );
  };

  const now = Date.now();
  const upcomingMatches = matches.filter((match) => new Date(match.start_time || match.date).getTime() >= now - 2 * 60 * 60 * 1000);
  const pastMatches = matches
    .filter((match) => new Date(match.start_time || match.date).getTime() < now - 2 * 60 * 60 * 1000)
    .sort((a, b) => new Date(b.start_time || b.date).getTime() - new Date(a.start_time || a.date).getTime());
  const visibleMatches = activeTab === 'upcoming' ? upcomingMatches : pastMatches;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={ORANGE} />
        <Text style={styles.loadingText}>Cargando tus partidos...</Text>
      </View>
    );
  }

  if (selectedMatch) {
    const date = selectedMatch.date || selectedMatch.fecha || selectedMatch.start_date || selectedMatch.starts_at;
    const startTime = selectedMatch.start_time || selectedMatch.hora_inicio || selectedMatch.time || selectedMatch.starts_at;
    const endTime = selectedMatch.end_time || selectedMatch.hora_fin;
    const ticket = getTicketColor(selectedMatch.camiseta || selectedMatch.ticket_type || selectedMatch.ticketType);
    const status = selectedMatch.status || selectedMatch.estado || 'Confirmado';
    const totalPlayers = teamWhite.length + teamBlack.length + playersWithoutTeam.length;
    const isPastMatch = new Date(date).getTime() < Date.now() - 2 * 60 * 60 * 1000;
    const inscriptions = selectedMatch.inscriptions || [];
    const firstInscription = inscriptions[0] || selectedMatch;
    const goals = getPersonalStatValue(firstInscription, ['goals', 'goles']);
    const assists = getPersonalStatValue(firstInscription, ['assists', 'asistencias']);
    const saves = getPersonalStatValue(firstInscription, ['saves', 'paradas']);
    const personalMvp = Boolean(firstInscription.is_mvp || firstInscription.mvp || firstInscription.es_mvp);

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.backButton} onPress={() => setSelectedMatch(null)}>
          <Ionicons name="chevron-back" size={22} color={TEXT} />
          <Text style={styles.backButtonText}>Volver a mis partidos</Text>
        </TouchableOpacity>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Partido EasyFutbol</Text>
          <Text style={styles.heroTitle}>{selectedMatch.title || selectedMatch.nombre || selectedMatch.name || 'Tu partido'}</Text>

          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={18} color={ORANGE} />
            <Text style={styles.infoText}>{formatDate(date)}</Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={18} color={ORANGE} />
            <Text style={styles.infoText}>
              {formatTime(startTime)}{endTime ? ` - ${formatTime(endTime)}` : ''}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={18} color={ORANGE} />
            <Text style={styles.infoText}>{selectedField?.name}</Text>
          </View>
        </View>

        <View style={styles.twoColumns}>
          <View style={styles.smallCard}>
            <Text style={styles.smallCardLabel}>Tu camiseta</Text>
            <Text style={styles.shirtText}>{ticket}</Text>
          </View>

          <View style={styles.smallCard}>
            <Text style={styles.smallCardLabel}>Estado</Text>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        </View>

        {inscriptions.length > 0 && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="ticket-outline" size={20} color={ORANGE} />
              <Text style={styles.sectionTitle}>Tus entradas</Text>
            </View>
            {inscriptions.map((entry, index) => {
              const entryId = getInscriptionId(entry);

              return (
                <View key={`entry-detail-${entryId || index}-${index}`} style={styles.entryRow}>
                  <View style={styles.entryInfo}>
                    <Text style={styles.entryText}>Entrada {index + 1}</Text>
                    <Text style={styles.entryMuted}>Camiseta {getTicketColor(entry.ticket_type || entry.ticketType || entry.camiseta)}</Text>
                  </View>

                  {!isPastMatch && (
                    <TouchableOpacity style={styles.cancelEntryButton} onPress={() => handleCancelInscription(entry)}>
                      <Text style={styles.cancelEntryButtonText}>Cancelar</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {isPastMatch && (
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="stats-chart-outline" size={20} color={ORANGE} />
              <Text style={styles.sectionTitle}>Resumen del partido</Text>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.smallCardLabel}>Resultado</Text>
                <Text style={styles.statValue}>{selectedMatch.result || 'Pendiente'}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.smallCardLabel}>MVP</Text>
                <Text style={styles.statValue}>{selectedMatch.mvp || 'Pendiente'}</Text>
              </View>
            </View>

            <Text style={styles.personalStatsTitle}>Tus estadísticas</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.smallCardLabel}>Goles</Text>
                <Text style={styles.statValue}>{goals}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.smallCardLabel}>Asistencias</Text>
                <Text style={styles.statValue}>{assists}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.smallCardLabel}>Paradas</Text>
                <Text style={styles.statValue}>{saves}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.smallCardLabel}>MVP</Text>
                <Text style={styles.statValue}>{personalMvp ? 'Sí' : 'No'}</Text>
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity style={styles.locationButton} onPress={() => openLocation(selectedField.mapsUrl)}>
          <Ionicons name="navigate" size={20} color={TEXT} />
          <Text style={styles.locationButtonText}>Abrir ubicación</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="alarm-outline" size={20} color={ORANGE} />
            <Text style={styles.sectionTitle}>Puntualidad</Text>
          </View>
          <Text style={styles.paragraph}>
            Intenta estar en el campo 10 minutos antes del inicio. Así podemos organizar equipos, revisar camisetas y empezar el partido a tiempo.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="map-outline" size={20} color={ORANGE} />
            <Text style={styles.sectionTitle}>Indicaciones del campo</Text>
          </View>
          <Text style={styles.paragraph}>{selectedField.instructions}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeaderBetween}>
            <View style={styles.sectionHeaderInline}>
              <Ionicons name="people-outline" size={20} color={ORANGE} />
              <Text style={styles.sectionTitle}>Equipos e inscritos</Text>
            </View>
            <Text style={styles.totalPlayers}>{totalPlayers} jugadores</Text>
          </View>

          <View style={styles.teamsContainer}>
            <View style={styles.teamBox}>
              <Text style={styles.teamTitle}>Equipo blanco</Text>
              {teamWhite.length > 0 ? (
                teamWhite.map((player, index) => (
                  <Text key={`white-${getInscriptionId(player) || player.id || index}-${index}`} style={styles.playerText}>
                    {index + 1}. {getPlayerName(player)}
                  </Text>
                ))
              ) : (
                <Text style={styles.emptyTeamText}>Sin jugadores asignados</Text>
              )}
            </View>

            <View style={styles.teamBox}>
              <Text style={styles.teamTitle}>Equipo negro</Text>
              {teamBlack.length > 0 ? (
                teamBlack.map((player, index) => (
                  <Text key={`black-${getInscriptionId(player) || player.id || index}-${index}`} style={styles.playerText}>
                    {index + 1}. {getPlayerName(player)}
                  </Text>
                ))
              ) : (
                <Text style={styles.emptyTeamText}>Sin jugadores asignados</Text>
              )}
            </View>
          </View>

          {playersWithoutTeam.length > 0 && (
            <View style={styles.pendingPlayersBox}>
              <Text style={styles.teamTitle}>Por confirmar camiseta</Text>
              {playersWithoutTeam.map((player, index) => (
                <Text key={`pending-${getInscriptionId(player) || player.id || index}-${index}`} style={styles.playerText}>
                  {index + 1}. {getPlayerName(player)}
                </Text>
              ))}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="checkmark-circle-outline" size={20} color={ORANGE} />
            <Text style={styles.sectionTitle}>Normas rápidas</Text>
          </View>
          <Text style={styles.rule}>• Ven puntual y respeta el color de camiseta.</Text>
          <Text style={styles.rule}>• Las faltas y fueras se gestionan con honestidad.</Text>
          <Text style={styles.rule}>• Si no hay portero fijo, se rota durante el partido.</Text>
          <Text style={styles.rule}>• Buen ambiente ante todo.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Mis partidos</Text>
        <Text style={styles.subtitle}>Consulta tus próximos partidos, camiseta, ubicación e inscritos.</Text>
      </View>

      <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh} disabled={refreshing}>
        <Ionicons name="refresh" size={18} color={ORANGE} />
        <Text style={styles.refreshButtonText}>{refreshing ? 'Actualizando...' : 'Actualizar'}</Text>
      </TouchableOpacity>

      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'upcoming' && styles.tabButtonActive]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'upcoming' && styles.tabButtonTextActive]}>
            Próximos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'past' && styles.tabButtonActive]}
          onPress={() => setActiveTab('past')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'past' && styles.tabButtonTextActive]}>
            Anteriores
          </Text>
        </TouchableOpacity>
      </View>

      {visibleMatches.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="football-outline" size={42} color={ORANGE} />
          <Text style={styles.emptyTitle}>{activeTab === 'upcoming' ? 'No tienes partidos próximos' : 'No tienes partidos anteriores'}</Text>
          <Text style={styles.emptyText}>{activeTab === 'upcoming' ? 'Cuando te apuntes a un partido, aparecerá aquí toda la información importante.' : 'Cuando finalice un partido, podrás consultar aquí el resultado, el MVP y tus estadísticas personales.'}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation?.navigate?.('Home')}>
            <Text style={styles.primaryButtonText}>Ver partidos disponibles</Text>
          </TouchableOpacity>
        </View>
      ) : (
        visibleMatches.map((match, index) => {
          const field = getFieldDetails(match.field || match.campo || match.location);
          const date = match.date || match.fecha || match.start_date || match.starts_at;
          const startTime = match.start_time || match.hora_inicio || match.time || match.starts_at;
          const ticket = getTicketColor(match.camiseta || match.ticket_type || match.ticketType);
          const status = match.status || match.estado || 'Confirmado';
          const entryCount = match.inscriptions?.length || 1;
          const isPastCard = activeTab === 'past';

          return (
            <TouchableOpacity
              key={`match-card-${match.id || match.match_id || index}-${index}`}
              style={styles.matchCard}
              activeOpacity={0.85}
              onPress={() => setSelectedMatch(match)}
            >
              <View style={styles.matchCardTop}>
                <View>
                  <Text style={styles.matchDate}>{formatDate(date)}</Text>
                  <Text style={styles.matchTitle}>{match.title || match.nombre || match.name || field.name}</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color={MUTED} />
              </View>

              <View style={styles.matchInfoGrid}>
                <View style={styles.matchInfoItem}>
                  <Ionicons name="time-outline" size={17} color={ORANGE} />
                  <Text style={styles.matchInfoText}>{formatTime(startTime) || 'Hora pendiente'}</Text>
                </View>

                <View style={styles.matchInfoItem}>
                  <Ionicons name="location-outline" size={17} color={ORANGE} />
                  <Text style={styles.matchInfoText}>{field.name}</Text>
                </View>

                <View style={styles.matchInfoItem}>
                  <Ionicons name="shirt-outline" size={17} color={ORANGE} />
                  <Text style={styles.matchInfoText}>Camiseta {ticket}</Text>
                </View>

                <View style={styles.matchInfoItem}>
                  <Ionicons name="checkmark-circle-outline" size={17} color={ORANGE} />
                  <Text style={styles.matchInfoText}>{status}</Text>
                </View>
              </View>

              {entryCount > 1 && (
                <View style={styles.entryHintBox}>
                  <Ionicons name="ticket-outline" size={16} color={ORANGE} />
                  <Text style={styles.entryHintText}>Tienes {entryCount} entradas. Pulsa para verlas todas.</Text>
                </View>
              )}

              {isPastCard && (
                <View style={styles.entryHintBox}>
                  <Ionicons name="stats-chart-outline" size={16} color={ORANGE} />
                  <Text style={styles.entryHintText}>Pulsa para ver resultado, MVP y tus estadísticas.</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK,
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: DARK,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    color: TEXT,
    marginTop: 12,
    fontSize: 15,
  },
  header: {
    marginBottom: 18,
  },
  title: {
    color: TEXT,
    fontSize: 30,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  subtitle: {
    color: MUTED,
    fontSize: 15,
    marginTop: 6,
    lineHeight: 21,
  },
  refreshButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 14,
  },
  refreshButtonText: {
    color: TEXT,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 24,
    alignItems: 'center',
    marginTop: 18,
  },
  emptyTitle: {
    color: TEXT,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 12,
    textAlign: 'center',
  },
  emptyText: {
    color: MUTED,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 18,
    marginTop: 18,
  },
  primaryButtonText: {
    color: TEXT,
    fontWeight: '900',
    fontSize: 15,
  },
  matchCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 14,
  },
  matchCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  matchDate: {
    color: ORANGE,
    fontWeight: '900',
    fontSize: 13,
    textTransform: 'uppercase',
  },
  matchTitle: {
    color: TEXT,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 3,
  },
  matchInfoGrid: {
    gap: 8,
  },
  matchInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  matchInfoText: {
    color: MUTED,
    fontSize: 14,
    fontWeight: '600',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 14,
  },
  backButtonText: {
    color: TEXT,
    fontWeight: '800',
    fontSize: 15,
  },
  heroCard: {
    backgroundColor: CARD,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginBottom: 14,
  },
  heroLabel: {
    color: ORANGE,
    fontWeight: '900',
    fontSize: 13,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroTitle: {
    color: TEXT,
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 8,
  },
  infoText: {
    color: TEXT,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  twoColumns: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  smallCard: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 15,
  },
  smallCardLabel: {
    color: MUTED,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 5,
  },
  shirtText: {
    color: TEXT,
    fontSize: 21,
    fontWeight: '900',
  },
  statusText: {
    color: ORANGE,
    fontSize: 19,
    fontWeight: '900',
  },
  locationButton: {
    backgroundColor: ORANGE,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  locationButtonText: {
    color: TEXT,
    fontSize: 16,
    fontWeight: '900',
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 9,
  },
  sectionHeaderBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeaderInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: TEXT,
    fontSize: 17,
    fontWeight: '900',
  },
  paragraph: {
    color: MUTED,
    fontSize: 14,
    lineHeight: 21,
  },
  totalPlayers: {
    color: MUTED,
    fontSize: 13,
    fontWeight: '700',
  },
  teamsContainer: {
    gap: 12,
  },
  teamBox: {
    backgroundColor: CARD_SOFT,
    borderRadius: 14,
    padding: 13,
  },
  pendingPlayersBox: {
    backgroundColor: CARD_SOFT,
    borderRadius: 14,
    padding: 13,
    marginTop: 12,
  },
  teamTitle: {
    color: ORANGE,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  playerText: {
    color: TEXT,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 5,
  },
  emptyTeamText: {
    color: MUTED,
    fontSize: 14,
    fontStyle: 'italic',
  },
  rule: {
    color: MUTED,
    fontSize: 14,
    lineHeight: 22,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 4,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: ORANGE,
  },
  tabButtonText: {
    color: MUTED,
    fontSize: 14,
    fontWeight: '900',
  },
  tabButtonTextActive: {
    color: TEXT,
  },
  entryHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: CARD_SOFT,
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
  },
  entryHintText: {
    color: TEXT,
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingVertical: 9,
  },
  entryText: {
    color: TEXT,
    fontSize: 14,
    fontWeight: '800',
  },
  entryMuted: {
    color: MUTED,
    fontSize: 14,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statBox: {
    width: '48%',
    backgroundColor: CARD_SOFT,
    borderRadius: 14,
    padding: 12,
  },
  statValue: {
    color: TEXT,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  personalStatsTitle: {
    color: ORANGE,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 16,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  entryInfo: {
    flex: 1,
    paddingRight: 10,
  },
  cancelEntryButton: {
    borderWidth: 1,
    borderColor: '#ff3b30',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  cancelEntryButtonText: {
    color: '#ff3b30',
    fontSize: 13,
    fontWeight: '900',
  },
});