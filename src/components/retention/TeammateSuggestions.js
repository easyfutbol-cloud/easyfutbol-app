import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../api/client';
import { SocialAvatar } from '../social/SocialComponents';

// "Has jugado con ellos": compañeros del partido que aún no son amigos, con
// un botón para mandarles la solicitud sin salir del acta.
export default function TeammateSuggestions({ players, onOpenPlayer, style }) {
  const [status, setStatus] = useState({});
  if (!players?.length) return null;

  const add = async (player) => {
    if (status[player.id]) return;
    setStatus((current) => ({ ...current, [player.id]: 'sending' }));
    try {
      await api.post('/social/requests', { user_id: player.id });
      setStatus((current) => ({ ...current, [player.id]: 'sent' }));
    } catch (error) {
      // 409: ya erais amigos o ya había solicitud; para el jugador es lo mismo.
      setStatus((current) => ({ ...current, [player.id]: error?.response?.status === 409 ? 'sent' : undefined }));
    }
  };

  return (
    <View style={[styles.card, style]}>
      <Text style={styles.eyebrow}>HAS JUGADO CON ELLOS</Text>
      <Text style={styles.title}>¿Los añades como amigos?</Text>
      <Text style={styles.sub}>Te avisaremos cuando se apunten a un partido.</Text>
      {players.map((player) => {
        const state = status[player.id];
        return (
          <View key={player.id} style={styles.row}>
            <TouchableOpacity style={styles.person} onPress={() => onOpenPlayer?.(player.id)} accessibilityRole="button" accessibilityLabel={`Ver perfil de ${player.name}`}>
              <SocialAvatar name={player.name} uri={player.avatar_url} size={38} />
              <View style={styles.copy}>
                <Text style={styles.name} numberOfLines={1}>{player.name}</Text>
                <Text style={styles.meta}>{player.matches_together === 1 ? '1 partido juntos' : `${player.matches_together} partidos juntos`}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, state === 'sent' && styles.buttonSent]}
              onPress={() => add(player)}
              disabled={Boolean(state)}
              accessibilityRole="button"
              accessibilityLabel={state === 'sent' ? `Solicitud enviada a ${player.name}` : `Añadir a ${player.name}`}
            >
              {state === 'sending' ? <ActivityIndicator size="small" color="#050505" /> : state === 'sent' ? (
                <><Ionicons name="checkmark" size={14} color="#ff5a00" /><Text style={styles.buttonTextSent}>Enviada</Text></>
              ) : (
                <><Ionicons name="person-add" size={14} color="#050505" /><Text style={styles.buttonText}>Añadir</Text></>
              )}
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, borderRadius: 18, backgroundColor: '#15171c', borderWidth: 1, borderColor: '#262931' },
  eyebrow: { color: '#ff5a00', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#fff', fontSize: 16, fontWeight: '900', marginTop: 2 },
  sub: { color: '#8d9097', fontSize: 11, marginTop: 2, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderTopWidth: 1, borderTopColor: '#22252c' },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  copy: { flex: 1 },
  name: { color: '#fff', fontSize: 13, fontWeight: '800' },
  meta: { color: '#85888f', fontSize: 10, marginTop: 2 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 92, justifyContent: 'center', backgroundColor: '#ff5a00', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  buttonSent: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,90,0,.5)' },
  buttonText: { color: '#050505', fontSize: 12, fontWeight: '900' },
  buttonTextSent: { color: '#ff5a00', fontSize: 12, fontWeight: '900' },
});
