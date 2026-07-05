

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

export default function MisPartidosScreen({ navigation }) {
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
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

      const response = await api.get('/inscriptions/me/inscriptions', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.data || response.data?.matches || response.data?.partidos || [];

      const upcomingMatches = data
        .filter((item) => item.status === 'confirmed' && item.starts_at)
        .filter((item) => new Date(item.starts_at).getTime() >= Date.now() - 2 * 60 * 60 * 1000)
        .map((item) => ({
          ...item,
          id: item.match_id,
          date: item.starts_at,
          start_time: item.starts_at,
          title: item.title,
          field: item.field_name,
          camiseta: item.ticket_type,
          status: item.status === 'confirmed' ? 'Confirmado' : item.status,
          players: item.players || item.inscritos || item.attendees || [],
        }));

      setMatches(upcomingMatches);
    } catch (error) {
      console.log('Error cargando mis inscripciones:', error?.response?.data || error.message);
      Alert.alert('Error', 'No se han podido cargar tus partidos inscritos. Inténtalo de nuevo.');
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
                  <Text key={`white-${player.id || index}`} style={styles.playerText}>
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
                  <Text key={`black-${player.id || index}`} style={styles.playerText}>
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
                <Text key={`pending-${player.id || index}`} style={styles.playerText}>
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

      {matches.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="football-outline" size={42} color={ORANGE} />
          <Text style={styles.emptyTitle}>No tienes partidos próximos</Text>
          <Text style={styles.emptyText}>Cuando te apuntes a un partido, aparecerá aquí toda la información importante.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigation?.navigate?.('Home')}>
            <Text style={styles.primaryButtonText}>Ver partidos disponibles</Text>
          </TouchableOpacity>
        </View>
      ) : (
        matches.map((match, index) => {
          const field = getFieldDetails(match.field || match.campo || match.location);
          const date = match.date || match.fecha || match.start_date || match.starts_at;
          const startTime = match.start_time || match.hora_inicio || match.time || match.starts_at;
          const ticket = getTicketColor(match.camiseta || match.ticket_type || match.ticketType);
          const status = match.status || match.estado || 'Confirmado';

          return (
            <TouchableOpacity
              key={match.id || index}
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
});