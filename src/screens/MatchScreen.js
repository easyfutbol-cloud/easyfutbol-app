import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity, ActivityIndicator, Alert, ImageBackground, Image, ScrollView } from 'react-native';
import { colors, layout, radii, spacing, typography } from '../theme';
import { api } from '../api/client';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';


const MAX_TICKETS_PER_PURCHASE = 8;
const EASY_PASS_COST = 1;

const SCREEN_BACKGROUND = require('../../assets/matches/match-6.jpg');
const EASYPASS_LOGO = require('../../assets/easypass-logo.png');


const pitchImage = {
  uri: 'https://images.pexels.com/photos/399187/football-pitch-sport-play-399187.jpeg?auto=compress&cs=tinysrgb&w=1200',
};

const defaultPlayerAvatar = {
  uri: 'https://easyfutbol.es/wp-content/uploads/2026/05/Diseno-sin-titulo-7.png',
};

const normalizeFieldKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const FIELD_CONFIGS = {
  canterac: {
    image: {
      uri: 'https://easyfutbol.es/wp-content/uploads/2025/08/CANTERAC.jpeg',
    },
    arrivalInstructions:
      'El acceso al campo de Canterac se realiza por la entrada principal del complejo. Recomendamos llegar 10 minutos antes para organizar equipos y camisetas.',
  },
  la_rondilla: {
    image: {
      uri: 'https://images.pexels.com/photos/399187/football-pitch-sport-play-399187.jpeg?auto=compress&cs=tinysrgb&w=1200',
    },
    arrivalInstructions:
      'El partido se juega en La Rondilla. Entra por el acceso principal y busca la zona de campos de fútbol. Recomendamos llegar con unos minutos de margen.',
  },
  ribera_de_castilla: {
    image: {
      uri: 'https://easyfutbol.es/wp-content/uploads/2025/08/RIBERA-DE-CASTILLA.jpeg',
    },
    arrivalInstructions:
      'El partido se juega en Ribera de Castilla. Recomendamos llegar 10 minutos antes para organizar equipos y camisetas.',
  },
};

const getFieldConfig = (fieldName) => {
  const key = normalizeFieldKey(fieldName);
  if (!key) return null;

  if (FIELD_CONFIGS[key]) return FIELD_CONFIGS[key];

  const matchedKey = Object.keys(FIELD_CONFIGS).find(
    (fieldKey) => key.includes(fieldKey) || fieldKey.includes(key)
  );

  return matchedKey ? FIELD_CONFIGS[matchedKey] : null;
};

const WORLD_CUP_FLAGS = {
  spain: '🇪🇸',
  argentina: '🇦🇷',
  brazil: '🇧🇷',
  ecuador: '🇪🇨',
  dominican_republic: '🇩🇴',
  south_korea: '🇰🇷',
  nicaragua: '🇳🇮',
  germany: '🇩🇪',
};

const getWorldCupFlag = (team) => {
  if (!team) return null;
  return WORLD_CUP_FLAGS[String(team).trim().toLowerCase()] || null;
};

export default function MatchScreen({ route, navigation }) {
  const matchId = route?.params?.matchId;
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [ticketType, setTicketType] = useState('white'); // 'white' | 'black'
  const [myTicketsCount, setMyTicketsCount] = useState(0);
  const [myTicketsLoading, setMyTicketsLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [easyPassBalance, setEasyPassBalance] = useState(0);
  const [easyPassLoading, setEasyPassLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  const [attendees, setAttendees] = useState([]);
  const [attendeesLoading, setAttendeesLoading] = useState(true);

  const attendeesNormalized = useMemo(() => {
    const apiBase = (api?.defaults?.baseURL || '').replace(/\/+$/, '');
    const assetBase = apiBase.replace(/\/api$/, '');

    // Normalizamos y a la vez evitamos duplicados por user_id (por si hay inscripciones duplicadas)
    const seen = new Set();
    const out = [];

    (attendees || []).forEach((a, idx) => {
      const userId = a.user_id ?? a.id ?? a.player_id ?? null;
      const username = a.username || a.user_login || a.handle || a.name || 'Jugador';
      let avatar = a.avatar_url || a.avatarUrl || a.avatar || '';

      // Si viene path relativo (/uploads/avatars/...), lo convertimos a URL absoluta
      if (avatar && avatar.startsWith('/')) {
        avatar = `${assetBase}${avatar}`;
      }

      // Key estable y única
      const stableId = userId != null ? String(userId) : `${username}-${idx}`;

      // Evitar duplicados por userId cuando exista
      if (userId != null) {
        if (seen.has(stableId)) return;
        seen.add(stableId);
      }

      const ticketColor = a.ticket_color || a.ticketColor || a.ticket_type || a.ticketType || 'orange';
      const worldcupTeam = a.worldcup_team || a.worldcupTeam || null;

      out.push({
        key: stableId,
        id: userId,
        username,
        avatar,
        rawAvatar: a.avatar_url || a.avatarUrl || a.avatar || '',
        ticketColor,
        worldcupTeam,
        flag: getWorldCupFlag(worldcupTeam),
      });
    });

    return out;
  }, [attendees]);

  useEffect(() => {
    if (!matchId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const res = await api.get(`/matches/${matchId}`);
        const data = res.data?.data;
        if (!cancelled) {
          setMatch(data);
        }
      } catch (e) {
        if (!cancelled) {
          console.log('Error cargando partido', e.message);
          Alert.alert('Error', 'No se ha podido cargar el partido');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [matchId]);

  useEffect(() => {
    if (!matchId) {
      setMyTicketsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await api.get('/me/inscriptions');
        const payload = res.data;
        if (cancelled || !payload?.ok) return;

        const all = payload.data?.inscriptions || [];
        const mid = Number(matchId);
        const countForMatch = all.filter(
          (ins) => ins.match_id === mid && ins.status === 'confirmed'
        ).length;

        if (!cancelled) {
          setMyTicketsCount(countForMatch);
        }
      } catch (err) {
        if (!cancelled) {
          const status = err?.response?.status;

          if (status === 401 || status === 403) {
            setIsGuest(true);
            setMyTicketsCount(0);
          } else {
            console.log('Error cargando mis inscripciones', err?.message || err);
          }
        }
      } finally {
        if (!cancelled) {
          setMyTicketsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const loadEasyPassCredits = useCallback(async () => {
    try {
      setEasyPassLoading(true);
      const res = await api.get('/me/credits');
      const payload = res?.data;
      setIsGuest(false);
      setEasyPassBalance(Number(payload?.easyPassBalance ?? payload?.credits ?? 0));
    } catch (err) {
      const status = err?.response?.status;

      if (status === 401 || status === 403) {
        setIsGuest(true);
        setEasyPassBalance(0);
      } else {
        console.log('Error cargando EasyPass', err?.message || err);
        setEasyPassBalance(0);
      }
    } finally {
      setEasyPassLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEasyPassCredits();
  }, [loadEasyPassCredits]);

  useFocusEffect(
    useCallback(() => {
      loadEasyPassCredits();
    }, [loadEasyPassCredits])
  );

  useEffect(() => {
    if (!matchId) {
      setAttendeesLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setAttendeesLoading(true);

        // 1) Endpoint dedicado (recomendado)
        try {
          const res = await api.get(`/matches/${matchId}/attendees`);
          const payload = res?.data;
          if (!cancelled && payload?.ok) {
            setAttendees(payload.data?.attendees || []);
            return;
          }
        } catch (_) {
          // fallback abajo
        }

        // 2) Fallback: si el endpoint del partido ya incluye asistentes
        if (match?.attendees && Array.isArray(match.attendees)) {
          if (!cancelled) setAttendees(match.attendees);
          return;
        }

        if (!cancelled) setAttendees([]);
      } catch (e) {
        if (!cancelled) {
          console.log('Error cargando asistentes', e?.message || e);
          setAttendees([]);
        }
      } finally {
        if (!cancelled) setAttendeesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [matchId, match?.attendees]);

  const fieldName = match?.field_name || match?.field || match?.fieldName || match?.venue || match?.location || match?.campo || '';
  const fieldConfig = getFieldConfig(fieldName);
  
  useEffect(() => {
    if (match) {
      console.log('Match field debug', {
        field_name: match?.field_name,
        field: match?.field,
        fieldName: match?.fieldName,
        venue: match?.venue,
        location: match?.location,
        campo: match?.campo,
        resolvedFieldName: fieldName,
        normalizedFieldKey: normalizeFieldKey(fieldName),
        hasFieldConfig: !!fieldConfig,
      });
    }
  }, [match, fieldName, fieldConfig]);
  const city = match?.city || '';
  const easyPassCost = match?.easypass_cost ?? EASY_PASS_COST;
  const hasAftergame =
    match?.has_aftergame === true ||
    match?.has_aftergame === 1 ||
    match?.aftergame === true ||
    match?.aftergame === 1 ||
    match?.aftergame_enabled === true ||
    match?.aftergame_enabled === 1;

  const capacity = match?.capacity ?? null;
  const spotsTaken = match?.spots_taken ?? 0;
  const isScheduled = match?.status === 'scheduled';
  const isOpen = match?.status === 'open';
  const isPayable = isScheduled || isOpen;
  const isFull = capacity !== null && spotsTaken >= capacity;
  const canPay = isPayable && !isFull && !paying;

  const isAdmin = match?.is_admin === true;

  const handleGoToStats = () => {
    if (!matchId) return;
    // Navegamos a la pantalla de stats de admin pasando el id del partido
    navigation?.navigate('AdminMatchStats', { id: Number(matchId) });
  };

  const handleGoToEasyPass = () => {
    navigation?.navigate('EasyPass');
  };

  const handleGoToLogin = () => {
    navigation?.navigate('Access');
  };

  const handleGoToRegister = () => {
    navigation?.navigate('Access');
  };


  const totalEasyPassCost = quantity * easyPassCost;
  const canJoinWithEasyPass = easyPassBalance >= totalEasyPassCost;

  const handlePay = async () => {
    if (!matchId || !match) return;

    if (!isPayable) {
      Alert.alert('No disponible', 'Este partido ya no está disponible para reserva');
      return;
    }

    if (isFull) {
      Alert.alert('Partido completo', 'Este partido ya ha alcanzado el máximo de plazas');
      return;
    }

    if (isGuest) {
      Alert.alert(
        'Inicia sesión',
        'Inicia sesión o regístrate para apuntarte a este partido.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Iniciar sesión', onPress: () => navigation?.navigate('Access', { mode: 'login' }) },
          { text: 'Registrarme', onPress: () => navigation?.navigate('Access', { mode: 'register' }) },
        ]
      );
      return;
    }

    if (easyPassBalance < totalEasyPassCost) {
      Alert.alert(
        'Sin EasyPass',
        `No tienes ${totalEasyPassCost} EasyPass disponibles para reservar ${quantity} plaza${quantity > 1 ? 's' : ''}. Compra más EasyPass para continuar.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Comprar EasyPass', onPress: handleGoToEasyPass },
        ]
      );
      return;
    }

    try {
      setPaying(true);

      const res = await api.post(`/matches/${matchId}/join-with-easypass`, {
        ticketType,
        quantity,
      });
      const data = res?.data;

      if (!data?.ok) {
        const msg = data?.msg || 'No se ha podido completar la reserva con EasyPass';
        Alert.alert('Error', msg);
        return;
      }

      setEasyPassBalance((prev) => Math.max(Number(prev || 0) - totalEasyPassCost, 0));
      loadEasyPassCredits();
      setMyTicketsCount((prev) => Number(prev || 0) + quantity);
      setMatch((prev) => {
        if (!prev) return prev;
        const currentSpots = Number(prev.spots_taken || 0);
        return {
          ...prev,
          spots_taken: currentSpots + quantity,
        };
      });

      Alert.alert(
        'Reserva confirmada',
        `Te has inscrito al partido con ${quantity} plaza${quantity > 1 ? 's' : ''} usando ${totalEasyPassCost} EasyPass.`
      );
    } catch (e) {
      const status = e?.response?.status;

      if (status === 401 || status === 403) {
        setIsGuest(true);
        Alert.alert(
          'Inicia sesión',
          'Inicia sesión o regístrate para apuntarte a este partido.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Iniciar sesión', onPress: () => navigation?.navigate('Access', { mode: 'login' }) },
            { text: 'Registrarme', onPress: () => navigation?.navigate('Access', { mode: 'register' }) },
          ]
        );
      } else {
        console.log('Error usando EasyPass', e?.response?.data || e.message || e);
        const msg = e?.response?.data?.msg || 'No se ha podido completar la reserva con EasyPass';
        Alert.alert('Error', msg);
      }
    } finally {
      setPaying(false);
    }
  };

  if (!matchId) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.loading}>No se ha encontrado el partido.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={colors.orange} />
        <Text style={styles.loading}>Cargando partido...</Text>
      </View>
    );
  }

  if (!match) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.loading}>No se ha encontrado el partido.</Text>
      </View>
    );
  }

  const startsAt = match.starts_at;
  const dateObj = startsAt ? new Date(startsAt) : null;
  const dateLabel = dateObj ? dateObj.toLocaleString('es-ES') : '';
  const dateLabelNice = dateObj
    ? dateObj.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : '';
  const timeLabel = dateObj
    ? dateObj.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
  const remainingSpots =
    capacity != null ? Math.max(capacity - spotsTaken, 0) : null;

  return (
    <ImageBackground
      source={SCREEN_BACKGROUND}
      style={styles.container}
      imageStyle={styles.worldCupBgImage}
    >
      <View style={styles.worldCupOverlay} />
      <StatusBar barStyle="light-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation?.goBack?.()}
        accessibilityRole="button"
        accessibilityLabel="Volver a próximos partidos"
      >
        <Text style={styles.backButtonIcon}>‹</Text>
        <Text style={styles.backButtonLabel}>Próximos partidos</Text>
      </TouchableOpacity>

      <Text style={styles.matchEyebrow}>PARTIDO EASYFUTBOL</Text>
      <Text style={styles.title}>{match.title}</Text>

      <View style={styles.heroCard}>
        <ImageBackground
          source={fieldConfig?.image || pitchImage}
          style={styles.heroBg}
          imageStyle={styles.heroImage}
        >
          <LinearGradient
            colors={['rgba(5,7,10,0.12)', 'rgba(5,7,10,0.94)']}
            style={styles.heroContent}
          >
            {!!dateLabelNice && (
              <Text style={styles.heroDate}>{dateLabelNice}</Text>
            )}
            {!!timeLabel && <Text style={styles.heroTime}>{timeLabel}</Text>}
            {!!(fieldName || city) && (
              <Text style={styles.heroLocation}>
                {[fieldName, city].filter(Boolean).join(' · ')}
              </Text>
            )}

          </LinearGradient>
        </ImageBackground>
      </View>

      <View style={styles.matchSummary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>COSTE</Text>
          <Text style={styles.summaryValue}>{easyPassCost}</Text>
          <Text style={styles.summaryUnit}>EasyPass</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>DISPONIBLES</Text>
          <Text style={[styles.summaryValue, remainingSpots === 0 && styles.summaryValueFull]}>
            {remainingSpots ?? '—'}
          </Text>
          <Text style={styles.summaryUnit}>plazas</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>OCUPACIÓN</Text>
          <Text style={styles.summaryValue}>{spotsTaken}</Text>
          <Text style={styles.summaryUnit}>de {capacity ?? '—'}</Text>
        </View>
      </View>
      {hasAftergame && (
        <View style={styles.aftergameCard}>
          <Text style={styles.aftergameTitle}>Aftergame incluido</Text>
          <Text style={styles.aftergameText}>
            Este partido incluye ofertas especiales del aftergame para los jugadores.
          </Text>
        </View>
      )}

      <View style={styles.attendeesSectionCard}>
        <Text style={styles.attendeesSectionTitle}>Jugadores apuntados</Text>

      {attendeesLoading ? (
        <View style={styles.attendeesLoadingRow}>
          <ActivityIndicator size="small" color={colors.orange} />
          <Text style={styles.attendeesLoadingText}>Cargando jugadores...</Text>
        </View>
      ) : attendeesNormalized.length === 0 ? (
        <Text style={styles.meta}>Aún no hay jugadores confirmados.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.attendeesRow}
        >
          {attendeesNormalized.map((p) => (
            <View key={p.key} style={styles.attendeeCard}>
              <View style={styles.attendeeAvatarOuter}>
                {p.ticketColor === 'mixed' ? (
                  <View style={styles.attendeeAvatarMixedBorder}>
                    <View style={styles.attendeeAvatarMixedHalfWhite} />
                    <View style={styles.attendeeAvatarMixedHalfBlack} />
                  </View>
                ) : (
                  <View
                    style={[
                      styles.attendeeAvatarColorBorder,
                      p.ticketColor === 'white' && styles.attendeeAvatarBorderWhite,
                      p.ticketColor === 'black' && styles.attendeeAvatarBorderBlack,
                      p.ticketColor !== 'white' && p.ticketColor !== 'black' && styles.attendeeAvatarBorderOrange,
                    ]}
                  />
                )}

                <View style={styles.attendeeAvatarWrap}>
                  {p.avatar ? (
                    <Image
                      source={{ uri: p.avatar }}
                      style={styles.attendeeAvatar}
                      onError={(e) => {
                        console.log('Error cargando avatar', {
                          username: p.username,
                          rawAvatar: p.rawAvatar,
                          resolvedAvatar: p.avatar,
                          error: e?.nativeEvent,
                        });
                      }}
                    />
                  ) : (
                    <Image
                      source={defaultPlayerAvatar}
                      style={styles.attendeeAvatar}
                    />
                  )}
                </View>

                {!!p.flag && (
                  <View style={styles.attendeeFlagBadge}>
                    <Text style={styles.attendeeFlagText}>{p.flag}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.attendeeName} numberOfLines={1}>
                {p.username}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
      </View>
      {isGuest ? (
        <View style={styles.loginPromptCard}>
          <Text style={styles.loginPromptTitle}>Inicia sesión para poder apuntarte</Text>
          <Text style={styles.loginPromptText}>
            Necesitas iniciar sesión o registrarte para reservar tu plaza en este partido y ver tus EasyPass disponibles.
          </Text>

          <View style={styles.guestActionsRow}>
            <TouchableOpacity
              style={[styles.easyPassBtn, styles.guestActionBtn, styles.guestActionBtnLeft]}
              onPress={handleGoToLogin}
              activeOpacity={0.85}
            >
              <Text style={styles.easyPassBtnText}>Iniciar sesión</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.easyPassBtn, styles.guestActionBtn]}
              onPress={handleGoToRegister}
              activeOpacity={0.85}
            >
              <Text style={styles.easyPassBtnText}>Registrarme</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.reservationCard}>
          <Text style={styles.reservationEyebrow}>CONFIGURA TU RESERVA</Text>
          <Text style={styles.reservationTitle}>Tu plaza</Text>
          <Text style={styles.label}>Elige tu camiseta</Text>
          <View style={styles.shirtRow}>
            <TouchableOpacity
              style={[
                styles.shirtOption,
                ticketType === 'white' && styles.shirtOptionActive,
              ]}
              onPress={() => setTicketType('white')}
              disabled={!canPay}
              accessibilityRole="radio"
              accessibilityState={{ selected: ticketType === 'white', disabled: !canPay }}
            >
              <View style={styles.shirtIconWrapper}>
                <View
                  style={[
                    styles.shirtIconBody,
                    { backgroundColor: '#ffffff' },
                  ]}
                />
              </View>
              <Text style={styles.shirtOptionText}>Camiseta blanca</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.shirtOption,
                styles.shirtOptionLast,
                ticketType === 'black' && styles.shirtOptionActive,
              ]}
              onPress={() => setTicketType('black')}
              disabled={!canPay}
              accessibilityRole="radio"
              accessibilityState={{ selected: ticketType === 'black', disabled: !canPay }}
            >
              <View style={styles.shirtIconWrapper}>
                <View
                  style={[
                    styles.shirtIconBody,
                    { backgroundColor: '#000000' },
                  ]}
                />
              </View>
              <Text style={styles.shirtOptionText}>Camiseta negra</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Número de entradas</Text>
          <View style={styles.quantityRow}>
            <TouchableOpacity
              style={[styles.quantityButton, quantity <= 1 && styles.quantityButtonDisabled]}
              onPress={() => quantity > 1 && setQuantity(quantity - 1)}
              disabled={!canPay || quantity <= 1}
              accessibilityRole="button"
              accessibilityLabel="Reducir número de entradas"
            >
              <Text style={styles.quantityButtonText}>-</Text>
            </TouchableOpacity>

            <Text style={styles.quantityValue}>{quantity}</Text>

            <TouchableOpacity
              style={[
                styles.quantityButton,
                quantity >= Math.min(MAX_TICKETS_PER_PURCHASE, remainingSpots != null ? remainingSpots : MAX_TICKETS_PER_PURCHASE) && styles.quantityButtonDisabled,
              ]}
              onPress={() => {
                const maxByCapacity = remainingSpots != null ? remainingSpots : MAX_TICKETS_PER_PURCHASE;
                const nextMax = Math.min(MAX_TICKETS_PER_PURCHASE, maxByCapacity);
                if (quantity < nextMax) {
                  setQuantity(quantity + 1);
                }
              }}
              disabled={
                !canPay ||
                quantity >= Math.min(MAX_TICKETS_PER_PURCHASE, remainingSpots != null ? remainingSpots : MAX_TICKETS_PER_PURCHASE)
              }
              accessibilityRole="button"
              accessibilityLabel="Aumentar número de entradas"
            >
              <Text style={styles.quantityButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.meta}>
            Coste total: {totalEasyPassCost} EasyPass
          </Text>
          {match.white_remaining != null && match.black_remaining != null && (
            <Text style={styles.meta}>
              Quedan {match.white_remaining} blancas 
              · {match.black_remaining} negras
            </Text>
          )}

          {!!match.description && (
            <Text style={[styles.meta, { marginTop: spacing(2) }]}>
              {match.description}
            </Text>
          )}

          <TouchableOpacity
            style={styles.btn}
            onPress={handlePay}
            disabled={!canPay}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPay, busy: paying }}
          >
            <Text style={styles.btnText}>
              {!isPayable
                ? 'No disponible'
                : isFull
                ? 'Partido completo'
                : paying
                ? 'Reservando...'
                : canJoinWithEasyPass
                ? `Reservar ${quantity} plaza${quantity > 1 ? 's' : ''} por ${totalEasyPassCost} EasyPass`
                : `Comprar EasyPass (${totalEasyPassCost}) para reservar`}
            </Text>
          </TouchableOpacity>
          </View>

          <View style={styles.easyPassCard}>
            <View style={styles.easyPassHeader}>
              <Image source={EASYPASS_LOGO} style={styles.easyPassLogo} resizeMode="contain" />
              <Text style={styles.easyPassTitle}>Tus EasyPass</Text>
            </View>
            <Text style={styles.easyPassValue}>
              {easyPassLoading ? 'Cargando...' : easyPassBalance}
            </Text>
            <Text style={styles.easyPassHint}>
              {easyPassLoading
                ? 'Estamos consultando tu saldo'
                : easyPassBalance > 0
                ? `Tienes ${easyPassBalance} EasyPass. Esta reserva cuesta ${totalEasyPassCost} EasyPass para ${quantity} plaza${quantity > 1 ? 's' : ''}.`
                : 'Compra más EasyPass para reservar tus próximos partidos más rápido.'}
            </Text>

            <TouchableOpacity
              style={styles.easyPassBtn}
              onPress={handleGoToEasyPass}
              activeOpacity={0.85}
            >
              <Text style={styles.easyPassBtnText}>Comprar más EasyPass</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {isAdmin && (
        <TouchableOpacity
          style={[
            styles.btn,
            {
              marginTop: spacing(1.5),
              backgroundColor: '#222',
              borderWidth: 1,
              borderColor: colors.orange,
            },
          ]}
          onPress={handleGoToStats}
        >
          <Text style={[styles.btnText, { color: colors.white }]}>
            Ver estadísticas (admin)
          </Text>
        </TouchableOpacity>
      )}

      {!myTicketsLoading && myTicketsCount > 0 && (
        <Text style={styles.infoText}>
          {`Ya tienes ${myTicketsCount} entrada${
            myTicketsCount > 1 ? 's' : ''
          } para este partido.`}
        </Text>
      )}
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor:colors.background, paddingHorizontal:spacing(2) },
  worldCupBgImage: {
    resizeMode: 'cover',
    opacity: 0.72,
  },
  worldCupOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,7,10,0.82)',
  },
  scrollContent:{ width:'100%', maxWidth:layout.maxContentWidth, alignSelf:'center', paddingTop:spacing(1), paddingBottom:spacing(5) },
  backButton:{ minHeight:layout.minTouchTarget, alignSelf:'flex-start', flexDirection:'row', alignItems:'center', marginBottom:spacing(1.5) },
  backButtonIcon:{ color:colors.white, fontSize:32, lineHeight:34, fontWeight:'300', marginRight:spacing(0.5), marginTop:-2 },
  backButtonLabel:{ color:colors.textMuted, ...typography.caption },
  matchEyebrow:{ color:colors.orange, ...typography.overline, marginBottom:spacing(0.5) },
  title:{ color:colors.white, ...typography.title, marginBottom:spacing(2) },
  meta:{ color:colors.textMuted, ...typography.caption, marginBottom:spacing(0.5) },
  heroCard: {
    borderRadius: radii.large,
    overflow: 'hidden',
    marginBottom: spacing(2),
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroBg: {
    minHeight: 220,
    justifyContent: 'flex-end',
  },
  heroImage: {
    resizeMode: 'cover',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,7,10,0.48)',
  },
  heroContent: {
    flex: 1,
    minHeight: 220,
    justifyContent: 'flex-end',
    padding: spacing(2),
  },
  heroDate: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  heroTime: {
    color: colors.white,
    fontSize: 14,
    marginTop: 2,
  },
  heroLocation: {
    color: '#f5f5f5',
    fontSize: 13,
    marginTop: spacing(0.5),
  },
  matchSummary: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.large,
    paddingVertical: spacing(2),
    marginBottom: spacing(1.5),
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(0.5),
  },
  summaryDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  summaryLabel: {
    color: colors.textSubtle,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.7,
    textAlign: 'center',
  },
  summaryValue: {
    color: colors.orange,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    marginTop: spacing(0.25),
  },
  summaryValueFull: {
    color: colors.danger,
  },
  summaryUnit: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  aftergameCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.orange,
    borderRadius: radii.medium,
    padding: spacing(1.5),
    marginBottom: spacing(1.2),
  },
  aftergameTitle: {
    color: colors.orange,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: spacing(0.5),
  },
  aftergameText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
  },
  reservationCard: {
    padding: spacing(2),
    marginTop: spacing(2),
    borderRadius: radii.large,
    backgroundColor: 'rgba(17,21,27,0.96)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  reservationEyebrow: {
    color: colors.orange,
    ...typography.overline,
  },
  reservationTitle: {
    color: colors.white,
    ...typography.heading,
    marginTop: spacing(0.5),
    marginBottom: spacing(0.5),
  },
  shirtIconWrapper: {
    marginBottom: spacing(0.5),
  },
  shirtIconBody: {
    width: 34,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#888',
  },
  label:{ color:colors.white, ...typography.bodyStrong, marginTop:spacing(2), marginBottom:spacing(1) },
  shirtRow:{ flexDirection:'row', marginBottom:spacing(1) },
  shirtOption:{
    flex:1,
    minHeight:96,
    paddingVertical:spacing(1.2),
    borderRadius:radii.medium,
    borderWidth:1,
    borderColor:colors.border,
    alignItems:'center',
    justifyContent: 'center',
    backgroundColor:colors.surface,
    marginRight:spacing(1),
  },
  shirtOptionLast:{
    marginRight:0,
  },
  shirtOptionActive:{
    borderColor:colors.orange,
    backgroundColor:colors.surfaceElevated,
  },
  shirtOptionText:{
    color:colors.white,
    fontWeight:'600',
    fontSize:14,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing(1),
    marginBottom: spacing(2),
  },
  quantityButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  quantityButtonDisabled: {
    opacity: 0.4,
  },
  quantityButtonText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '800',
  },
  quantityValue: {
    marginHorizontal: spacing(2),
    color: colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  infoText: {
    marginTop: spacing(1),
    textAlign: 'center',
    color: '#aaaaaa',
    fontSize: 13,
  },
  loginPromptCard: {
    marginTop: spacing(2),
    padding: spacing(2),
    borderRadius: radii.large,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loginPromptTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: spacing(0.75),
  },
  loginPromptText: {
    color: '#aaaaaa',
    fontSize: 13,
    lineHeight: 18,
  },
  easyPassCard: {
    marginTop: spacing(2),
    padding: spacing(2),
    borderRadius: radii.large,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  easyPassHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(0.75),
  },
  easyPassLogo: {
    width: 32,
    height: 32,
    marginRight: spacing(1),
  },
  easyPassTitle: {
    color: colors.orange,
    fontSize: 14,
    fontWeight: '800',
  },
  easyPassValue: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '900',
  },
  easyPassHint: {
    color: '#aaaaaa',
    fontSize: 13,
    marginTop: spacing(0.5),
    lineHeight: 18,
  },
  easyPassBtn: {
    minHeight: layout.minTouchTarget,
    marginTop: spacing(1.5),
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: colors.orange,
    paddingVertical: spacing(1.2),
    borderRadius: radii.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  easyPassBtnText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 14,
  },
  guestActionsRow: {
    flexDirection: 'row',
    marginTop: spacing(1.5),
  },
  guestActionBtn: {
    flex: 1,
    marginTop: 0,
  },
  guestActionBtnLeft: {
    marginRight: spacing(1),
  },
  loading:{ color:colors.gray, textAlign:'center', marginTop:spacing(4) },
  btn:{ minHeight:layout.minTouchTarget, backgroundColor:colors.orange, paddingVertical:spacing(1.5), borderRadius:radii.medium, alignItems:'center', justifyContent:'center', marginTop:spacing(3) },
  btnText:{ color:colors.black, fontWeight:'800', fontSize:16 },
  attendeesSectionCard: {
  marginTop: spacing(2),
  marginBottom: spacing(1.5),
  paddingTop: spacing(1.5),
  paddingBottom: spacing(1),
  paddingLeft: spacing(1.5),
  borderRadius: radii.large,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
},
attendeesSectionTitle: {
  color: colors.white,
  fontWeight: '800',
  fontSize: 16,
  marginBottom: spacing(1.2),
},
  attendeesLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(1.5),
  },
  attendeesLoadingText: {
    color: '#aaaaaa',
    marginLeft: spacing(1),
    fontSize: 13,
  },
  attendeesRow: {
    paddingRight: spacing(1.5),
    paddingBottom: spacing(0.5),
  },
  attendeeCard: {
    width: 86,
    alignItems: 'center',
    marginRight: spacing(1),
  },
  attendeeAvatarOuter: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing(0.6),
    position: 'relative',
  },
  attendeeAvatarColorBorder: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    backgroundColor: 'transparent',
  },
  attendeeAvatarBorderWhite: {
    borderColor: '#ffffff',
  },
  attendeeAvatarBorderBlack: {
    backgroundColor: '#000000',
  },
  attendeeAvatarBorderOrange: {
    borderColor: colors.orange,
  },
  attendeeAvatarMixedBorder: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#555',
  },
  attendeeAvatarMixedHalfWhite: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  attendeeAvatarMixedHalfBlack: {
    flex: 1,
    backgroundColor: '#000000',
  },
  attendeeAvatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  attendeeAvatar: {
    width: 52,
    height: 52,
  },
  attendeeFlagBadge: {
    position: 'absolute',
    right: 0,
    bottom: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#050505',
    borderWidth: 1,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendeeFlagText: {
    fontSize: 13,
  },
  attendeeName: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 86,
  },
});
