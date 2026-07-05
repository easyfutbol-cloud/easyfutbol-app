

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'https://easyfutbol.es/api';

const formatTournamentDate = (dateValue) => {
  if (!dateValue) return 'Fecha pendiente';

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha pendiente';
  }

  return date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
};

const formatTournamentTime = (dateValue) => {
  if (!dateValue) return 'Horario pendiente';

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return 'Horario pendiente';
  }

  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getStatusLabel = (status) => {
  if (status === 'open') return 'Inscripciones abiertas';
  if (status === 'full') return 'Completo';
  if (status === 'closed') return 'Inscripciones cerradas';
  if (status === 'finished') return 'Finalizado';
  return 'Próximamente';
};

const HomeTournamentScreen = ({ navigation }) => {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTournaments = async () => {
    try {
      const token = await AsyncStorage.getItem('token');

      const response = await fetch(`${API_URL}/tournaments`, {
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'No se pudieron cargar los torneos');
      }

      setTournaments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading tournaments:', error);
      Alert.alert('Error', error.message || 'No se pudieron cargar los torneos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadTournaments();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadTournaments();
  };

  const handleOpenTournament = (tournament) => {
    navigation.navigate('TournamentDetail', {
      tournamentId: tournament.id,
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Eventos EasyFutbol</Text>
          <Text style={styles.title}>Torneos</Text>
          <Text style={styles.subtitle}>
            Apúntate a los torneos especiales de EasyFutbol y vive una experiencia competitiva con buen ambiente.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Cargando torneos...</Text>
          </View>
        ) : tournaments.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🏆</Text>
            <Text style={styles.emptyTitle}>No hay torneos disponibles</Text>
            <Text style={styles.emptyText}>
              Cuando abramos inscripciones aparecerán aquí.
            </Text>
          </View>
        ) : (
          tournaments.map((tournament) => {
            const confirmedPlayers = Number(tournament.confirmed_players || 0);
            const maxPlayers = Number(tournament.max_players || 0);
            const availableSpots = Number(tournament.available_spots || 0);
            const isOpen = tournament.status === 'open' && availableSpots > 0;

            return (
              <TouchableOpacity
                key={tournament.id}
                style={styles.card}
                activeOpacity={0.88}
                onPress={() => handleOpenTournament(tournament)}
              >
                <View style={styles.cardTopRow}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>🏆 Torneo</Text>
                  </View>
                  <View style={[styles.statusPill, isOpen ? styles.statusOpen : styles.statusClosed]}>
                    <Text style={styles.statusText}>{getStatusLabel(tournament.status)}</Text>
                  </View>
                </View>

                <Text style={styles.cardTitle}>{tournament.title}</Text>

                <View style={styles.infoGrid}>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Fecha</Text>
                    <Text style={styles.infoValue}>{formatTournamentDate(tournament.date)}</Text>
                  </View>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Hora</Text>
                    <Text style={styles.infoValue}>{formatTournamentTime(tournament.date)}</Text>
                  </View>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Precio</Text>
                    <Text style={styles.infoValue}>{tournament.price_easypass} EP</Text>
                  </View>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Ciudad</Text>
                    <Text style={styles.infoValue}>{tournament.city || 'Pendiente'}</Text>
                  </View>
                </View>

                <View style={styles.progressHeader}>
                  <Text style={styles.progressText}>Plazas</Text>
                  <Text style={styles.progressText}>{confirmedPlayers}/{maxPlayers}</Text>
                </View>

                <View style={styles.progressBarBackground}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${maxPlayers > 0 ? Math.min((confirmedPlayers / maxPlayers) * 100, 100) : 0}%`,
                      },
                    ]}
                  />
                </View>

                <Text style={styles.availableText}>
                  {availableSpots > 0 ? `Quedan ${availableSpots} plazas disponibles` : 'Torneo completo'}
                </Text>

                <View style={styles.includesBox}>
                  <Text style={styles.includesText}>Incluye camiseta, partidos grabados y consumición en La Herminia.</Text>
                </View>

                <View style={styles.ctaButton}>
                  <Text style={styles.ctaText}>Ver torneo</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  container: {
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    marginBottom: 22,
  },
  eyebrow: {
    color: '#F97316',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 10,
  },
  subtitle: {
    color: '#CBD5E1',
    fontSize: 15,
    lineHeight: 22,
  },
  loadingBox: {
    marginTop: 48,
    alignItems: 'center',
  },
  loadingText: {
    color: '#CBD5E1',
    marginTop: 12,
    fontSize: 15,
  },
  emptyBox: {
    backgroundColor: '#111827',
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  emptyIcon: {
    fontSize: 42,
    marginBottom: 10,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  emptyText: {
    color: '#CBD5E1',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 26,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  badge: {
    backgroundColor: 'rgba(249, 115, 22, 0.16)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  badgeText: {
    color: '#FDBA74',
    fontSize: 13,
    fontWeight: '800',
  },
  statusPill: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },
  statusOpen: {
    backgroundColor: 'rgba(34, 197, 94, 0.16)',
  },
  statusClosed: {
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '900',
    lineHeight: 29,
    marginBottom: 16,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
    marginBottom: 14,
  },
  infoItem: {
    width: '50%',
    paddingHorizontal: 5,
    marginBottom: 10,
  },
  infoLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 3,
  },
  infoValue: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  progressText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '800',
  },
  progressBarBackground: {
    height: 9,
    borderRadius: 999,
    backgroundColor: '#1E293B',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#F97316',
  },
  availableText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  includesBox: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 12,
    marginTop: 14,
    marginBottom: 14,
  },
  includesText: {
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  ctaButton: {
    backgroundColor: '#F97316',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});

export default HomeTournamentScreen;