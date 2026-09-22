import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';

function formatMatchDate(startsAt) {
  if (!startsAt) return '';
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time}`;
}

export default function ClaimTicketScreen({ navigation, route }) {
  const token = route?.params?.token;

  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);

  const fetchPreview = useCallback(async () => {
    if (!token) {
      setError('Este enlace no es válido.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      setNeedsAuth(false);
      const res = await api.get(`/inscriptions/claim/${token}`);
      setData(res.data);
    } catch (e) {
      if (e?.response?.status === 401) setNeedsAuth(true);
      else setError(e?.response?.data?.msg || e.message || 'No se pudo cargar el enlace');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const handleClaim = async () => {
    try {
      setClaiming(true);
      await api.post(`/inscriptions/claim/${token}`);
      setJustClaimed(true);
    } catch (e) {
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo confirmar la entrada');
      fetchPreview();
    } finally {
      setClaiming(false);
    }
  };

  const goToMatch = () => {
    if (data?.match?.id) navigation.replace('Match', { matchId: data.match.id });
    else navigation.navigate('Home');
  };

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#ff5a00" />
      </View>
    );
  }

  if (needsAuth) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="log-in-outline" size={42} color="#666" />
        <Text style={styles.title}>Inicia sesión para continuar</Text>
        <Text style={styles.subtitle}>Necesitas tener la app instalada con la sesión iniciada para unirte a este partido.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate('Access')}>
          <Text style={styles.primaryButtonText}>Iniciar sesión / Registrarme</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="alert-circle-outline" size={42} color="#666" />
        <Text style={styles.title}>{error}</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Home')}>
          <Text style={styles.secondaryButtonText}>Ir al inicio</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (justClaimed || data?.claimed_by_me) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="checkmark-circle" size={48} color="#39D98A" />
        <Text style={styles.title}>¡Ya estás apuntado!</Text>
        <Text style={styles.subtitle}>Tus estadísticas de este partido contarán en tu perfil.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={goToMatch}>
          <Text style={styles.primaryButtonText}>Ver partido</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (data?.claimed) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="close-circle-outline" size={42} color="#666" />
        <Text style={styles.title}>Esta entrada ya ha sido reclamada</Text>
        <Text style={styles.subtitle}>Otra persona ya se apuntó con este enlace. Pídele a quien te lo mandó que compruebe si le quedan más entradas libres.</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Home')}>
          <Text style={styles.secondaryButtonText}>Ir al inicio</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.centeredContainer}>
      <Ionicons name="football" size={42} color="#ff5a00" />
      <Text style={styles.eyebrow}>{data?.buyer_name ? `${data.buyer_name} te ha invitado a jugar` : 'Te han invitado a jugar'}</Text>
      <Text style={styles.title}>{data?.match?.title || 'Partido de EasyFutbol'}</Text>
      <Text style={styles.subtitle}>{formatMatchDate(data?.match?.starts_at)}</Text>
      {!!(data?.match?.field_name || data?.match?.city) && (
        <Text style={styles.subtitle}>{[data?.match?.field_name, data?.match?.city].filter(Boolean).join(' · ')}</Text>
      )}

      <TouchableOpacity style={styles.primaryButton} onPress={handleClaim} disabled={claiming}>
        {claiming ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Confirmar, voy yo</Text>}
      </TouchableOpacity>
      <Text style={styles.hint}>Al confirmar, esta entrada quedará a tu nombre y tus estadísticas del partido contarán en tu perfil.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centeredContainer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  eyebrow: { color: '#ff8c4d', fontSize: 12, fontWeight: '800', marginTop: 16, textAlign: 'center' },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  subtitle: { color: '#999', fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  primaryButton: { backgroundColor: '#ff5a00', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 28, marginTop: 24, minWidth: 220, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  secondaryButton: { borderWidth: 1, borderColor: '#333', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 24, marginTop: 20 },
  secondaryButtonText: { color: '#ccc', fontSize: 14, fontWeight: '700' },
  hint: { color: '#666', fontSize: 11, marginTop: 14, textAlign: 'center', lineHeight: 16, maxWidth: 280 },
});
