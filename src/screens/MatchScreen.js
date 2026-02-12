import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity, Linking, ActivityIndicator, Alert, ImageBackground } from 'react-native';
import { colors, spacing } from '../theme';
import { api } from '../api/client';

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

  const handlePay = async () => {
    if (!matchId || !match) return;

    if (!isPayable) {
      Alert.alert('No disponible', 'Este partido ya no está disponible para pago');
      return;
    }

    if (isFull) {
      Alert.alert('Partido completo', 'Este partido ya ha alcanzado el máximo de plazas');
      return;
    }

    try {
      setPaying(true);

      const res = await api.post(`/matches/${matchId}/pay`, {
        ticketType,
        quantity,
      });
      const data = res?.data;

      if (!data?.ok || !data.checkoutUrl) {
        const msg = data?.msg || 'No se ha podido iniciar el pago';
        Alert.alert('Error', msg);
        return;
      }

      const url = data.checkoutUrl;

      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Error', 'No se ha podido abrir la página de pago');
        return;
      }

      await Linking.openURL(url);
    } catch (e) {
      console.log('Error iniciando pago', e?.response?.data || e.message || e);
      const msg = e?.response?.data?.msg || 'No se ha podido iniciar el pago';
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
            ? 'Abriendo pago...'
            : `Pagar y reservar (${quantity})`}
        </Text>
      </TouchableOpacity>

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
          } para este partido, pero puedes comprar más.`}
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
  loading:{ color:colors.gray, textAlign:'center', marginTop:spacing(4) },
  btn:{ backgroundColor:colors.orange, paddingVertical:spacing(1.5), borderRadius:12, alignItems:'center', marginTop:spacing(3) },
  btnText:{ color:colors.black, fontWeight:'800', fontSize:16 },
});