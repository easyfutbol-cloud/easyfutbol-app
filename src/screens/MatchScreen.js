import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity, Linking, ActivityIndicator, Alert, ImageBackground, Image, ScrollView } from 'react-native';
import { colors, spacing } from '../theme';
import { api } from '../api/client';
import { useFocusEffect } from '@react-navigation/native';

const MAX_TICKETS_PER_PURCHASE = 8;

const pitchImage = {
  uri: 'https://images.pexels.com/photos/399187/football-pitch-sport-play-399187.jpeg?auto=compress&cs=tinysrgb&w=1200',
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

  const [attendees, setAttendees] = useState([]);
  const [attendeesLoading, setAttendeesLoading] = useState(true);

  const attendeesNormalized = useMemo(() => {
    const base = (api?.defaults?.baseURL || '').replace(/\/+$/, '');

    // Normalizamos y a la vez evitamos duplicados por user_id (por si hay inscripciones duplicadas)
    const seen = new Set();
    const out = [];

    (attendees || []).forEach((a, idx) => {
      const userId = a.user_id ?? a.id ?? a.player_id ?? null;
      const username = a.username || a.user_login || a.handle || a.name || 'Jugador';
      let avatar = a.avatar_url || a.avatarUrl || a.avatar || '';

      // Si viene path relativo (/uploads/avatars/...), lo convertimos a URL absoluta
      if (avatar && avatar.startsWith('/')) {
        avatar = `${base}${avatar}`;
      }

      // Key estable y única
      const stableId = userId != null ? String(userId) : `${username}-${idx}`;

      // Evitar duplicados por userId cuando exista
      if (userId != null) {
        if (seen.has(stableId)) return;
        seen.add(stableId);
      }

      out.push({
        key: stableId,
        id: userId,
        username,
        avatar,
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
          console.log('Error cargando mis inscripciones', err?.message || err);
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
      setEasyPassBalance(Number(payload?.easyPassBalance ?? payload?.credits ?? 0));
    } catch (err) {
      console.log('Error cargando EasyPass', err?.message || err);
      setEasyPassBalance(0);
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

  const fieldName = match?.field_name || '';
  const city = match?.city || '';
  const price = match?.price_eur ?? null;

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

  const canJoinWithEasyPass = quantity === 1 && easyPassBalance >= 1;

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

    if (quantity === 1 && easyPassBalance < 1) {
      Alert.alert(
        'Sin EasyPass',
        'No tienes EasyPass suficientes para reservar este partido. Compra más EasyPass para continuar.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Comprar EasyPass', onPress: handleGoToEasyPass },
        ]
      );
      return;
    }

    if (quantity > 1) {
      Alert.alert(
        'Reserva múltiple no disponible con EasyPass',
        'Por ahora solo puedes reservar 1 plaza usando EasyPass desde esta pantalla.'
      );
      return;
    }

    try {
      setPaying(true);

      const res = await api.post(`/matches/${matchId}/join-with-easypass`, {
        ticketType,
      });
      const data = res?.data;

      if (!data?.ok) {
        const msg = data?.msg || 'No se ha podido completar la reserva con EasyPass';
        Alert.alert('Error', msg);
        return;
      }

      setEasyPassBalance((prev) => Math.max(Number(prev || 0) - 1, 0));
      loadEasyPassCredits();
      setMyTicketsCount((prev) => Number(prev || 0) + 1);
      setMatch((prev) => {
        if (!prev) return prev;
        const currentSpots = Number(prev.spots_taken || 0);
        return {
          ...prev,
          spots_taken: currentSpots + 1,
        };
      });

      Alert.alert('Reserva confirmada', 'Te has inscrito al partido usando 1 EasyPass.');
    } catch (e) {
      console.log('Error usando EasyPass', e?.response?.data || e.message || e);
      const msg = e?.response?.data?.msg || 'No se ha podido completar la reserva con EasyPass';
      Alert.alert('Error', msg);
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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <Text style={styles.title}>{match.title}</Text>

      <View style={styles.heroCard}>
        <ImageBackground
          source={pitchImage}
          style={styles.heroBg}
          imageStyle={styles.heroImage}
        >
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            {!!dateLabelNice && (
              <Text style={styles.heroDate}>{dateLabelNice}</Text>
            )}
            {!!timeLabel && <Text style={styles.heroTime}>{timeLabel}</Text>}
            {!!(fieldName || city) && (
              <Text style={styles.heroLocation}>
                {[fieldName, city].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
        </ImageBackground>
      </View>

      {!!price && (
        <Text style={styles.price}>{price} €</Text>
      )}

      {!!capacity && (
        <View style={styles.capacityRow}>
          {remainingSpots != null && (
            <View style={styles.capacityPill}>
              <Text style={styles.capacityNumber}>{remainingSpots}</Text>
              <Text style={styles.capacityLabel}>plazas disponibles</Text>
            </View>
          )}
          <Text style={styles.capacityMeta}>
            {spotsTaken}/{capacity} ocupadas
          </Text>
        </View>
      )}

      <Text style={styles.label}>Jugadores apuntados</Text>

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
              <View style={styles.attendeeAvatarWrap}>
                {p.avatar ? (
                  <Image source={{ uri: p.avatar }} style={styles.attendeeAvatar} />
                ) : (
                  <View style={styles.attendeeAvatarFallback} />
                )}
              </View>
              <Text style={styles.attendeeName} numberOfLines={1}>
                {p.username}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}

      <Text style={styles.label}>Elige tu camiseta</Text>
      <View style={styles.shirtRow}>
        <TouchableOpacity
          style={[
            styles.shirtOption,
            ticketType === 'white' && styles.shirtOptionActive,
          ]}
          onPress={() => setTicketType('white')}
          disabled={!canPay}
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
        >
          <Text style={styles.quantityButtonText}>-</Text>
        </TouchableOpacity>

        <Text style={styles.quantityValue}>{quantity}</Text>

        <TouchableOpacity
          style={[
            styles.quantityButton,
            quantity >= MAX_TICKETS_PER_PURCHASE && styles.quantityButtonDisabled,
          ]}
          onPress={() =>
            quantity < MAX_TICKETS_PER_PURCHASE &&
            setQuantity(quantity + 1)
          }
          disabled={!canPay || quantity >= MAX_TICKETS_PER_PURCHASE}
        >
          <Text style={styles.quantityButtonText}>+</Text>
        </TouchableOpacity>
      </View>
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
      >
        <Text style={styles.btnText}>
          {!isPayable
            ? 'No disponible'
            : isFull
            ? 'Partido completo'
            : paying
            ? 'Reservando...'
            : quantity > 1
            ? `Reservar ${quantity} plazas`
            : canJoinWithEasyPass
            ? 'Reservar con 1 EasyPass'
            : 'Comprar EasyPass para reservar'}
        </Text>
      </TouchableOpacity>

      <View style={styles.easyPassCard}>
        <Text style={styles.easyPassTitle}>Tus EasyPass</Text>
        <Text style={styles.easyPassValue}>
          {easyPassLoading ? 'Cargando...' : easyPassBalance}
        </Text>
        <Text style={styles.easyPassHint}>
          {easyPassLoading
            ? 'Estamos consultando tu saldo'
            : easyPassBalance > 0
            ? 'Tienes saldo disponible para reservar 1 plaza al instante con EasyPass.'
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
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor:colors.black, padding:spacing(2) },
  title:{ color:colors.white, fontSize:24, fontWeight:'800', marginBottom:spacing(1.5) },
  meta:{ color:'#aaa', marginBottom:spacing(0.5) }, // keep meta for misc text
  heroCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: spacing(2),
  },
  heroBg: {
    height: 140,
    justifyContent: 'flex-end',
  },
  heroImage: {
    resizeMode: 'cover',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  heroContent: {
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
  price: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing(1),
  },
  capacityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(1.5),
  },
  capacityPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: spacing(1.5),
    paddingVertical: spacing(0.6),
    borderRadius: 999,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: colors.orange,
  },
  capacityNumber: {
    color: colors.orange,
    fontSize: 18,
    fontWeight: '800',
    marginRight: 6,
  },
  capacityLabel: {
    color: '#f5f5f5',
    fontSize: 12,
  },
  capacityMeta: {
    color: '#aaaaaa',
    fontSize: 12,
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
  label:{ color:colors.white, fontWeight:'700', marginTop:spacing(2), marginBottom:spacing(1) },
  shirtRow:{ flexDirection:'row', marginBottom:spacing(1) },
  shirtOption:{
    flex:1,
    paddingVertical:spacing(1.2),
    borderRadius:10,
    borderWidth:1,
    borderColor:'#555',
    alignItems:'center',
    justifyContent: 'center',
    backgroundColor:'#111',
    marginRight:spacing(1),
  },
  shirtOptionLast:{
    marginRight:0,
  },
  shirtOptionActive:{
    borderColor:colors.orange,
    backgroundColor:'#222',
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#555',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
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
  easyPassCard: {
    marginTop: spacing(2),
    padding: spacing(2),
    borderRadius: 16,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  easyPassTitle: {
    color: colors.orange,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: spacing(0.5),
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
    marginTop: spacing(1.5),
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: colors.orange,
    paddingVertical: spacing(1.2),
    borderRadius: 12,
    alignItems: 'center',
  },
  easyPassBtnText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 14,
  },
  loading:{ color:colors.gray, textAlign:'center', marginTop:spacing(4) },
  btn:{ backgroundColor:colors.orange, paddingVertical:spacing(1.5), borderRadius:12, alignItems:'center', marginTop:spacing(3) },
  btnText:{ color:colors.black, fontWeight:'800', fontSize:16 },
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
    paddingBottom: spacing(1.5),
  },
  attendeeCard: {
    width: 86,
    alignItems: 'center',
    marginRight: spacing(1),
  },
  attendeeAvatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.orange,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing(0.6),
  },
  attendeeAvatar: {
    width: 56,
    height: 56,
  },
  attendeeAvatarFallback: {
    width: 56,
    height: 56,
    backgroundColor: '#1b1b1b',
  },
  attendeeName: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 86,
  },
});