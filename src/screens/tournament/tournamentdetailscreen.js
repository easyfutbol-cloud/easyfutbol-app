

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
const SHIRT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

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
    year: 'numeric',
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

const TournamentDetailScreen = ({ route, navigation }) => {
  const { tournamentId } = route.params || {};

  const [tournament, setTournament] = useState(null);
  const [myInscription, setMyInscription] = useState(null);
  const [isInscribed, setIsInscribed] = useState(false);
  const [selectedSize, setSelectedSize] = useState('L');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchJson = async (url, options = {}) => {
    const token = await AsyncStorage.getItem('token');

    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.message || 'Ha ocurrido un error');
    }

    return data;
  };

  const loadTournament = async () => {
    if (!tournamentId) {
      Alert.alert('Error', 'No se ha encontrado el torneo');
      navigation.goBack();
      return;
    }

    try {
      const [tournamentData, inscriptionData] = await Promise.all([
        fetchJson(`${API_URL}/tournaments/${tournamentId}`),
        fetchJson(`${API_URL}/tournaments/${tournamentId}/my-inscription`),
      ]);

      setTournament(tournamentData);
      setMyInscription(inscriptionData?.inscription || null);
      setIsInscribed(Boolean(inscriptionData?.is_inscribed));

      if (inscriptionData?.inscription?.shirt_size) {
        setSelectedSize(inscriptionData.inscription.shirt_size);
      }
    } catch (error) {
      console.error('Error loading tournament detail:', error);
      Alert.alert('Error', error.message || 'No se pudo cargar el torneo');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadTournament();
    }, [tournamentId])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadTournament();
  };

  const handleInscribe = () => {
    if (!selectedSize) {
      Alert.alert('Talla necesaria', 'Selecciona una talla de camiseta para apuntarte.');
      return;
    }

    Alert.alert(
      'Confirmar inscripción',
      `Te vas a apuntar al torneo por ${tournament?.price_easypass || 7} EasyPass con talla ${selectedSize}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apuntarme',
          onPress: async () => {
            try {
              setSubmitting(true);

              await fetchJson(`${API_URL}/tournaments/${tournamentId}/inscribe`, {
                method: 'POST',
                body: JSON.stringify({ shirt_size: selectedSize }),
              });

              Alert.alert('Inscripción confirmada', 'Ya estás apuntado al torneo.');
              await loadTournament();
            } catch (error) {
              console.error('Error inscribing tournament:', error);
              Alert.alert('Error', error.message || 'No se pudo completar la inscripción');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleCancelInscription = () => {
    Alert.alert(
      'Cancelar inscripción',
      'Puedes cancelar hasta 2 días antes del torneo. Si cancelas ahora, se te devolverán los EasyPass.',
      [
        { text: 'No cancelar', style: 'cancel' },
        {
          text: 'Cancelar inscripción',
          style: 'destructive',
          onPress: async () => {
            try {
              setSubmitting(true);

              await fetchJson(`${API_URL}/tournaments/${tournamentId}/cancel`, {
                method: 'POST',
                body: JSON.stringify({}),
              });

              Alert.alert('Inscripción cancelada', 'Tu inscripción se ha cancelado correctamente.');
              await loadTournament();
            } catch (error) {
              console.error('Error cancelling tournament inscription:', error);
              Alert.alert('Error', error.message || 'No se pudo cancelar la inscripción');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Cargando torneo...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!tournament) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyBoxFull}>
          <Text style={styles.emptyIcon}>🏆</Text>
          <Text style={styles.emptyTitle}>Torneo no encontrado</Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const confirmedPlayers = Number(tournament.confirmed_players || 0);
  const maxPlayers = Number(tournament.max_players || 0);
  const availableSpots = Number(tournament.available_spots || 0);
  const isOpen = tournament.status === 'open' && availableSpots > 0;
  const progressWidth = maxPlayers > 0 ? Math.min((confirmedPlayers / maxPlayers) * 100, 100) : 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Volver</Text>
        </TouchableOpacity>

        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🏆 Torneo</Text>
            </View>
            <View style={[styles.statusPill, isOpen ? styles.statusOpen : styles.statusClosed]}>
              <Text style={styles.statusText}>{getStatusLabel(tournament.status)}</Text>
            </View>
          </View>

          <Text style={styles.title}>{tournament.title}</Text>
          <Text style={styles.description}>{tournament.description}</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Fecha</Text>
              <Text style={styles.infoValue}>{formatTournamentDate(tournament.date)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Hora inicio</Text>
              <Text style={styles.infoValue}>{formatTournamentTime(tournament.date)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Horario</Text>
              <Text style={styles.infoValue}>19:00 - 23:00</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Precio</Text>
              <Text style={styles.infoValue}>{tournament.price_easypass} EP</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Ciudad</Text>
              <Text style={styles.infoValue}>{tournament.city || 'Pendiente'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Ubicación</Text>
              <Text style={styles.infoValue}>{tournament.location || 'Pendiente'}</Text>
            </View>
          </View>

          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>Plazas ocupadas</Text>
            <Text style={styles.progressText}>{confirmedPlayers}/{maxPlayers}</Text>
          </View>
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${progressWidth}%` }]} />
          </View>
          <Text style={styles.availableText}>
            {availableSpots > 0 ? `Quedan ${availableSpots} plazas disponibles` : 'Torneo completo'}
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Qué incluye</Text>
          <View style={styles.featureRow}>
            <Text style={styles.featureIcon}>⚽</Text>
            <Text style={styles.featureText}>Mínimo 4 partidos por equipo.</Text>
          </View>
          <View style={styles.featureRow}>
            <Text style={styles.featureIcon}>🎥</Text>
            <Text style={styles.featureText}>Partidos grabados con 2 cámaras.</Text>
          </View>
          <View style={styles.featureRow}>
            <Text style={styles.featureIcon}>👕</Text>
            <Text style={styles.featureText}>Camiseta oficial del torneo incluida.</Text>
          </View>
          <View style={styles.featureRow}>
            <Text style={styles.featureIcon}>🍻</Text>
            <Text style={styles.featureText}>Consumición gratuita en La Herminia.</Text>
          </View>
          <View style={styles.featureRow}>
            <Text style={styles.featureIcon}>🏅</Text>
            <Text style={styles.featureText}>Premios para campeones y premios individuales.</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Formato</Text>
          <Text style={styles.bodyText}>8 equipos, fase de grupos, winner bracket y loser bracket.</Text>
          <Text style={styles.bodyText}>Partidos de 15 minutos y final principal de 20 minutos.</Text>
          <Text style={styles.bodyText}>Dos campos funcionando a la vez para que el torneo tenga ritmo.</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Reglamento básico</Text>
          <Text style={styles.ruleText}>• Puntualidad obligatoria.</Text>
          <Text style={styles.ruleText}>• Respeto y fairplay durante todo el torneo.</Text>
          <Text style={styles.ruleText}>• La organización decidirá en caso de duda importante.</Text>
          <Text style={styles.ruleText}>• No se puede cancelar con menos de 2 días de antelación.</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Tu inscripción</Text>

          {isInscribed ? (
            <View style={styles.confirmedBox}>
              <Text style={styles.confirmedTitle}>Ya estás inscrito ✅</Text>
              <Text style={styles.confirmedText}>Talla camiseta: {myInscription?.shirt_size || selectedSize}</Text>
              <Text style={styles.confirmedText}>Recuerda estar puntual para confirmar equipos y explicar las normas.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.bodyText}>Selecciona tu talla de camiseta antes de apuntarte.</Text>
              <View style={styles.sizeGrid}>
                {SHIRT_SIZES.map((size) => {
                  const selected = selectedSize === size;
                  return (
                    <TouchableOpacity
                      key={size}
                      style={[styles.sizeButton, selected && styles.sizeButtonSelected]}
                      onPress={() => setSelectedSize(size)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.sizeButtonText, selected && styles.sizeButtonTextSelected]}>{size}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {isInscribed ? (
            <TouchableOpacity
              style={[styles.cancelButton, submitting && styles.buttonDisabled]}
              onPress={handleCancelInscription}
              disabled={submitting}
            >
              <Text style={styles.cancelButtonText}>{submitting ? 'Procesando...' : 'Cancelar inscripción'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, (!isOpen || submitting) && styles.buttonDisabled]}
              onPress={handleInscribe}
              disabled={!isOpen || submitting}
            >
              <Text style={styles.primaryButtonText}>
                {submitting ? 'Procesando...' : `Apuntarme por ${tournament.price_easypass} EP`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
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
    paddingBottom: 42,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 14,
    paddingVertical: 8,
    paddingRight: 12,
  },
  backButtonText: {
    color: '#FDBA74',
    fontSize: 15,
    fontWeight: '900',
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#CBD5E1',
    marginTop: 12,
    fontSize: 15,
  },
  emptyBoxFull: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyIcon: {
    fontSize: 46,
    marginBottom: 12,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 16,
  },
  heroCard: {
    backgroundColor: '#111827',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
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
  title: {
    color: '#FFFFFF',
    fontSize: 29,
    fontWeight: '900',
    lineHeight: 36,
    marginBottom: 10,
  },
  description: {
    color: '#CBD5E1',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
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
    marginBottom: 12,
  },
  infoLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
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
  sectionCard: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1F2937',
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  featureIcon: {
    fontSize: 18,
    width: 24,
  },
  featureText: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  bodyText: {
    color: '#CBD5E1',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  ruleText: {
    color: '#CBD5E1',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 6,
  },
  sizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
    marginBottom: 16,
  },
  sizeButton: {
    minWidth: 58,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  sizeButtonSelected: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  sizeButtonText: {
    color: '#CBD5E1',
    fontSize: 15,
    fontWeight: '900',
  },
  sizeButtonTextSelected: {
    color: '#FFFFFF',
  },
  confirmedBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(34, 197, 94, 0.35)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
  },
  confirmedTitle: {
    color: '#BBF7D0',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 6,
  },
  confirmedText: {
    color: '#DCFCE7',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#F97316',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  cancelButton: {
    backgroundColor: '#7F1D1D',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    backgroundColor: '#F97316',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});

export default TournamentDetailScreen;