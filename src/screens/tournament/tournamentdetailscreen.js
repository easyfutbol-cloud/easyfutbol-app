
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

const API_URL = 'https://api.easyfutbol.es/api';
const SHIRT_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const REGISTRATION_TYPES = [
  { key: 'solo', label: 'Solo yo', description: '1 jugador' },
  { key: 'group', label: 'Con amigos', description: '2 a 7 jugadores' },
  { key: 'full_team', label: 'Equipo completo', description: '8 a 10 jugadores' },
];
const MAX_PLAYERS = 10;

const formatDateForApi = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateFromPlayerValue = (birthDate) => {
  if (!birthDate) return new Date(2000, 0, 1);

  const [year, month, day] = String(birthDate).split('-').map(Number);

  if (!year || !month || !day) return new Date(2000, 0, 1);

  return new Date(year, month - 1, day);
};

const createEmptyPlayer = () => ({
  full_name: '',
  dni: '',
  birth_date: '',
  phone: '',
  email: '',
  shirt_size: 'L',
  shirt_name: '',
  shirt_number: '',
});

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
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [isInscribed, setIsInscribed] = useState(false);
  const [registrationType, setRegistrationType] = useState('solo');
  const [players, setPlayers] = useState([createEmptyPlayer()]);
  const [birthDatePickerIndex, setBirthDatePickerIndex] = useState(null);
  const [showFullRules, setShowFullRules] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const totalEasyPass = useMemo(() => {
    return players.length * Number(tournament?.price_easypass || 7);
  }, [players.length, tournament?.price_easypass]);

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

    const rawText = await response.text();
    let data = null;

    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (parseError) {
      console.error('Tournament response is not JSON:', rawText.slice(0, 300));
      throw new Error('El servidor no está devolviendo la ruta de torneos correctamente.');
    }

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

      const confirmedRegistrations = Array.isArray(inscriptionData?.registrations)
        ? inscriptionData.registrations.filter((registration) => registration.status === 'confirmed')
        : [];

      setTournament(tournamentData);
      setMyRegistrations(confirmedRegistrations);
      setMyInscription(confirmedRegistrations[0] || inscriptionData?.inscription || null);
      setIsInscribed(confirmedRegistrations.length > 0 || Boolean(inscriptionData?.is_inscribed));
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

  const updateRegistrationType = (type) => {
    setRegistrationType(type);

    if (type === 'solo') {
      setPlayers((currentPlayers) => [currentPlayers[0] || createEmptyPlayer()]);
    } else if (type === 'full_team' && players.length < 8) {
      setPlayers((currentPlayers) => {
        const nextPlayers = [...currentPlayers];
        while (nextPlayers.length < 8) {
          nextPlayers.push(createEmptyPlayer());
        }
        return nextPlayers;
      });
    }
  };

  const updatePlayerField = (index, field, value) => {
    setPlayers((currentPlayers) => {
      const nextPlayers = [...currentPlayers];
      nextPlayers[index] = {
        ...nextPlayers[index],
        [field]: value,
      };
      return nextPlayers;
    });
  };

  const handleBirthDateChange = (event, selectedDate) => {
    if (Platform.OS !== 'ios') {
      setBirthDatePickerIndex(null);
    }

    if (event?.type === 'dismissed' || birthDatePickerIndex === null) {
      return;
    }

    if (selectedDate) {
      updatePlayerField(birthDatePickerIndex, 'birth_date', formatDateForApi(selectedDate));
    }
  };

  const openBirthDatePicker = (index) => {
    setBirthDatePickerIndex(index);
  };

  const closeBirthDatePicker = () => {
    setBirthDatePickerIndex(null);
  };

  const addPlayer = () => {
    if (players.length >= MAX_PLAYERS) {
      Alert.alert('Límite alcanzado', `Puedes añadir hasta ${MAX_PLAYERS} jugadores en una inscripción.`);
      return;
    }

    setPlayers((currentPlayers) => [...currentPlayers, createEmptyPlayer()]);

    if (registrationType === 'solo') {
      setRegistrationType('group');
    }
  };

  const removePlayer = (index) => {
    if (players.length === 1) {
      return;
    }

    setPlayers((currentPlayers) => currentPlayers.filter((_, playerIndex) => playerIndex !== index));
  };

  const validateForm = () => {
    if (registrationType === 'solo' && players.length !== 1) {
      return 'La inscripción individual debe tener 1 jugador.';
    }

    if (registrationType === 'full_team' && players.length < 8) {
      return 'Para equipo completo tienes que añadir al menos 8 jugadores.';
    }

    for (let index = 0; index < players.length; index += 1) {
      const player = players[index];
      const number = Number(player.shirt_number);
      const playerNumber = index + 1;

      if (!player.full_name.trim()) return `Falta el nombre completo del jugador ${playerNumber}.`;
      if (!player.dni.trim()) return `Falta el DNI del jugador ${playerNumber}.`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(player.birth_date.trim())) {
        return `La fecha de nacimiento del jugador ${playerNumber} debe tener formato YYYY-MM-DD.`;
      }
      if (!player.phone.trim()) return `Falta el teléfono del jugador ${playerNumber}.`;
      if (!player.email.trim()) return `Falta el correo electrónico del jugador ${playerNumber}.`;
      if (!player.shirt_name.trim()) return `Falta el nombre para camiseta del jugador ${playerNumber}.`;
      if (!Number.isInteger(number) || number < 1 || number > 99) {
        return `El número de camiseta del jugador ${playerNumber} debe estar entre 1 y 99.`;
      }
    }

    return null;
  };

  const handleInscribe = () => {
    const validationError = validateForm();

    if (validationError) {
      Alert.alert('Revisa los datos', validationError);
      return;
    }

    Alert.alert(
      'Confirmar inscripción',
      `Vas a apuntar ${players.length} jugador${players.length === 1 ? '' : 'es'} por ${totalEasyPass} EasyPass en total.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              setSubmitting(true);

              await fetchJson(`${API_URL}/tournaments/${tournamentId}/inscribe`, {
                method: 'POST',
                body: JSON.stringify({
                  registration_type: registrationType,
                  players: players.map((player) => ({
                    full_name: player.full_name.trim(),
                    dni: player.dni.trim(),
                    birth_date: player.birth_date.trim(),
                    phone: player.phone.trim(),
                    email: player.email.trim(),
                    shirt_size: player.shirt_size,
                    shirt_name: player.shirt_name.trim(),
                    shirt_number: Number(player.shirt_number),
                  })),
                }),
              });

              Alert.alert('Inscripción confirmada', 'La inscripción al torneo se ha completado correctamente.');
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

  const handleCancelInscription = (registrationGroupId) => {
    Alert.alert(
      'Cancelar inscripción',
      'Puedes cancelar hasta 5 días antes del torneo. Si cancelas ahora, se te devolverán los EasyPass de esta inscripción.',
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
                body: JSON.stringify({
                  registration_group_id: registrationGroupId,
                }),
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
        keyboardShouldPersistTaps="handled"
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
              <Text style={styles.infoValue}>{tournament.price_easypass} EasyPass / jugador</Text>
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
          <Text style={styles.ruleText}>• No se puede cancelar con menos de 5 días de antelación.</Text>
          <Text style={styles.ruleText}>• Inscripciones abiertas hasta el miércoles 22 de julio.</Text>

          <TouchableOpacity
            style={styles.rulesButton}
            activeOpacity={0.85}
            onPress={() => setShowFullRules((currentValue) => !currentValue)}
          >
            <Text style={styles.rulesButtonText}>
              {showFullRules ? 'Ocultar reglamento completo' : 'Ver reglamento completo'}
            </Text>
          </TouchableOpacity>

          {showFullRules && (
            <View style={styles.fullRulesBox}>
              <Text style={styles.fullRulesTitle}>Reglamento completo del torneo</Text>
              <Text style={styles.fullRuleText}>1. Los equipos deberán estar preparados antes del inicio de cada partido.</Text>
              <Text style={styles.fullRuleText}>2. Cada partido tendrá una duración de 15 minutos, salvo la final principal, que será de 20 minutos.</Text>
              <Text style={styles.fullRuleText}>3. El torneo se jugará con fase de grupos, winner bracket y loser bracket.</Text>
              <Text style={styles.fullRuleText}>4. Todos los jugadores deben respetar a rivales, compañeros, árbitros y organización.</Text>
              <Text style={styles.fullRuleText}>5. Las decisiones arbitrales y de la organización serán definitivas durante el torneo.</Text>
              <Text style={styles.fullRuleText}>6. Las conductas antideportivas podrán suponer expulsión del partido o del torneo.</Text>
              <Text style={styles.fullRuleText}>7. No se podrá cancelar la inscripción con menos de 5 días de antelación.</Text>
              <Text style={styles.fullRuleText}>8. Las inscripciones estarán abiertas hasta el miércoles 22 de julio o hasta completar plazas.</Text>
              <Text style={styles.fullRuleText}>9. La organización podrá ajustar horarios, campos o emparejamientos por necesidades del torneo.</Text>
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Tu inscripción</Text>

          {isInscribed && (
            <View style={styles.confirmedBox}>
              <Text style={styles.confirmedTitle}>Tus inscripciones confirmadas ✅</Text>
              <Text style={styles.confirmedText}>Puedes añadir más jugadores creando otra inscripción o cancelar una inscripción concreta.</Text>

              {myRegistrations.map((registration, registrationIndex) => (
                <View key={registration.registration_group_id || registrationIndex} style={styles.registrationSummaryCard}>
                  <View style={styles.registrationSummaryHeader}>
                    <Text style={styles.registrationSummaryTitle}>Inscripción {registrationIndex + 1}</Text>
                    <Text style={styles.registrationSummaryTag}>{registration.total_players || 1} jugador{Number(registration.total_players || 1) === 1 ? '' : 'es'}</Text>
                  </View>

                  <Text style={styles.confirmedText}>Tipo: {registration.registration_type || 'Inscripción'}</Text>
                  <Text style={styles.confirmedText}>EasyPass usados: {registration.easypass_used || tournament.price_easypass}</Text>

                  {Array.isArray(registration.players) && registration.players.map((player, index) => (
                    <View key={player.player_registration_id || index} style={styles.confirmedPlayerBox}>
                      <Text style={styles.confirmedPlayerName}>{index + 1}. {player.full_name}</Text>
                      <Text style={styles.confirmedText}>Talla: {player.shirt_size} · Camiseta: {player.shirt_name} #{player.shirt_number}</Text>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={[styles.cancelSingleButton, submitting && styles.buttonDisabled]}
                    onPress={() => handleCancelInscription(registration.registration_group_id)}
                    disabled={submitting}
                  >
                    <Text style={styles.cancelSingleButtonText}>{submitting ? 'Procesando...' : 'Cancelar esta inscripción'}</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <Text style={styles.confirmedText}>Recuerda estar puntual para confirmar equipos y explicar las normas.</Text>
            </View>
          )}

          {isOpen ? (
            <>
              <Text style={styles.bodyText}>{isInscribed ? 'Añade más jugadores creando una nueva inscripción.' : 'Puedes apuntarte solo, con amigos o reservar un equipo completo.'}</Text>

              <View style={styles.registrationTypeGrid}>
                {REGISTRATION_TYPES.map((type) => {
                  const selected = registrationType === type.key;
                  return (
                    <TouchableOpacity
                      key={type.key}
                      style={[styles.registrationTypeButton, selected && styles.registrationTypeButtonSelected]}
                      onPress={() => updateRegistrationType(type.key)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.registrationTypeTitle, selected && styles.registrationTypeTextSelected]}>{type.label}</Text>
                      <Text style={[styles.registrationTypeDescription, selected && styles.registrationTypeTextSelected]}>{type.description}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.summaryBox}>
                <Text style={styles.summaryText}>Jugadores: {players.length}</Text>
                <Text style={styles.summaryText}>Total: {totalEasyPass} EasyPass</Text>
              </View>

              {players.map((player, index) => (
                <View key={`player-${index}`} style={styles.playerCard}>
                  <View style={styles.playerHeader}>
                    <Text style={styles.playerTitle}>Jugador {index + 1}</Text>
                    {players.length > 1 && (
                      <TouchableOpacity onPress={() => removePlayer(index)} style={styles.removeButton}>
                        <Text style={styles.removeButtonText}>Quitar</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <TextInput
                    style={styles.input}
                    placeholder="Nombre completo"
                    placeholderTextColor="#64748B"
                    value={player.full_name}
                    onChangeText={(value) => updatePlayerField(index, 'full_name', value)}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="DNI"
                    placeholderTextColor="#64748B"
                    value={player.dni}
                    autoCapitalize="characters"
                    onChangeText={(value) => updatePlayerField(index, 'dni', value)}
                  />
                  <TouchableOpacity
                    style={styles.dateButton}
                    activeOpacity={0.85}
                    onPress={() => openBirthDatePicker(index)}
                  >
                    <Text style={[styles.dateButtonText, !player.birth_date && styles.dateButtonPlaceholder]}>
                      {player.birth_date || 'Fecha de nacimiento'}
                    </Text>
                  </TouchableOpacity>

                  {birthDatePickerIndex === index && (
                    <View style={styles.datePickerBox}>
                      <DateTimePicker
                        value={getDateFromPlayerValue(player.birth_date)}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        maximumDate={new Date()}
                        locale="es-ES"
                        style={styles.datePicker}
                        onChange={handleBirthDateChange}
                      />
                      {Platform.OS === 'ios' && (
                        <TouchableOpacity style={styles.datePickerDoneButton} onPress={closeBirthDatePicker}>
                          <Text style={styles.datePickerDoneText}>Aceptar fecha</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                  <TextInput
                    style={styles.input}
                    placeholder="Teléfono"
                    placeholderTextColor="#64748B"
                    value={player.phone}
                    keyboardType="phone-pad"
                    onChangeText={(value) => updatePlayerField(index, 'phone', value)}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Correo electrónico"
                    placeholderTextColor="#64748B"
                    value={player.email}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    onChangeText={(value) => updatePlayerField(index, 'email', value)}
                  />

                  <Text style={styles.inputLabel}>Talla camiseta</Text>
                  <View style={styles.sizeGrid}>
                    {SHIRT_SIZES.map((size) => {
                      const selected = player.shirt_size === size;
                      return (
                        <TouchableOpacity
                          key={`${index}-${size}`}
                          style={[styles.sizeButton, selected && styles.sizeButtonSelected]}
                          onPress={() => updatePlayerField(index, 'shirt_size', size)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.sizeButtonText, selected && styles.sizeButtonTextSelected]}>{size}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TextInput
                    style={styles.input}
                    placeholder="Nombre camiseta"
                    placeholderTextColor="#64748B"
                    value={player.shirt_name}
                    autoCapitalize="characters"
                    maxLength={30}
                    onChangeText={(value) => updatePlayerField(index, 'shirt_name', value)}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Número camiseta 1-99"
                    placeholderTextColor="#64748B"
                    value={String(player.shirt_number)}
                    keyboardType="number-pad"
                    maxLength={2}
                    onChangeText={(value) => updatePlayerField(index, 'shirt_number', value.replace(/[^0-9]/g, ''))}
                  />
                </View>
              ))}

              {players.length < MAX_PLAYERS && (
                <TouchableOpacity style={styles.addPlayerButton} onPress={addPlayer}>
                  <Text style={styles.addPlayerButtonText}>+ Añadir jugador</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <View style={styles.closedBox}>
              <Text style={styles.closedText}>Las inscripciones no están disponibles ahora mismo.</Text>
            </View>
          )}

          {isOpen && (
            <TouchableOpacity
              style={[styles.primaryButton, submitting && styles.buttonDisabled]}
              onPress={handleInscribe}
              disabled={submitting}
            >
              <Text style={styles.primaryButtonText}>
                {submitting ? 'Procesando...' : `Confirmar por ${totalEasyPass} EasyPass`}
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
  rulesButton: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  rulesButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  fullRulesBox: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 12,
  },
  fullRulesTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 10,
  },
  fullRuleText: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
    fontWeight: '700',
  },
  registrationTypeGrid: {
    gap: 10,
    marginTop: 8,
    marginBottom: 14,
  },
  registrationTypeButton: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  registrationTypeButtonSelected: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
  registrationTypeTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
  },
  registrationTypeDescription: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
  },
  registrationTypeTextSelected: {
    color: '#FFFFFF',
  },
  summaryBox: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  summaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
  },
  playerCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 14,
  },
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  playerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  removeButton: {
    backgroundColor: '#7F1D1D',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  removeButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  input: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  inputLabel: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
  },
  dateButton: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 14,
    marginBottom: 10,
  },
  dateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  dateButtonPlaceholder: {
    color: '#64748B',
  },
  datePickerBox: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePicker: {
    alignSelf: 'center',
    width: Platform.OS === 'ios' ? 320 : '100%',
  },
  datePickerDoneButton: {
    backgroundColor: '#F97316',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  datePickerDoneText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  sizeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  sizeButton: {
    minWidth: 58,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    backgroundColor: '#111827',
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
  addPlayerButton: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  addPlayerButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
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
  confirmedPlayerBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: 12,
    padding: 10,
    marginVertical: 6,
  },
  registrationSummaryCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(187, 247, 208, 0.22)',
    marginTop: 12,
  },
  registrationSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  registrationSummaryTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  registrationSummaryTag: {
    color: '#BBF7D0',
    fontSize: 12,
    fontWeight: '900',
  },
  cancelSingleButton: {
    backgroundColor: '#7F1D1D',
    borderRadius: 14,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 10,
  },
  cancelSingleButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  closedBox: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  closedText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  confirmedPlayerName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 3,
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