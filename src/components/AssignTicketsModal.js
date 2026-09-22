import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Share, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';

const PUBLIC_BASE = String(api?.defaults?.baseURL || '').replace(/\/api\/?$/, '');

export default function AssignTicketsModal({ visible, tickets, matchTitle, onClose }) {
  const [ticketStates, setTicketStates] = useState({}); // { [claim_token]: 'me' | 'shared' | 'loading' }

  const setState = (token, state) => setTicketStates((prev) => ({ ...prev, [token]: state }));

  const claimForMe = async (token) => {
    setState(token, 'loading');
    try {
      await api.post(`/inscriptions/claim/${token}`);
      setState(token, 'me');
    } catch (e) {
      setState(token, undefined);
      Alert.alert('Error', e?.response?.data?.msg || e.message || 'No se pudo asignar la entrada');
    }
  };

  const shareLink = async (token) => {
    // WhatsApp y similares solo convierten en pulsable un enlace http(s), nunca
    // un esquema personalizado (easyfutbol://), así que compartimos la página
    // puente del backend, que a su vez abre la app.
    const link = `${PUBLIC_BASE}/claim/${token}`;
    const message = `⚽ Te han invitado a jugar: ${matchTitle || 'un partido de EasyFutbol'}\n\nÚnete al partido para que puedan contar tus estadísticas. Recuerda que tienes que tener la app instalada con la sesión iniciada.\n\n${link}`;
    try {
      await Share.share({ message });
      setState(token, 'shared');
    } catch {
      // cancelado por el usuario, no hace falta avisar
    }
  };

  if (!tickets?.length) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>¿Quién juega cada entrada?</Text>
          <Text style={styles.subtitle}>
            Para cada una, confirma que vas tú o envíale el enlace a la persona que va a jugar. Si no la reclama nadie, sus estadísticas no contarán.
          </Text>

          {tickets.map((ticket, index) => {
            const state = ticketStates[ticket.claim_token];
            return (
              <View key={ticket.claim_token} style={styles.ticketRow}>
                <Text style={styles.ticketLabel}>Entrada {index + 1}</Text>

                {state === 'me' ? (
                  <View style={styles.statusBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#39D98A" />
                    <Text style={styles.statusText}>Vas tú</Text>
                  </View>
                ) : state === 'shared' ? (
                  <View style={styles.statusBadge}>
                    <Ionicons name="paper-plane" size={14} color="#ff8c4d" />
                    <Text style={styles.statusText}>Enlace enviado</Text>
                  </View>
                ) : (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity style={styles.actionButtonPrimary} onPress={() => claimForMe(ticket.claim_token)} disabled={state === 'loading'}>
                      {state === 'loading' ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.actionButtonPrimaryText}>Voy yo</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButtonSecondary} onPress={() => shareLink(ticket.claim_token)}>
                      <Ionicons name="share-social-outline" size={14} color="#fff" />
                      <Text style={styles.actionButtonSecondaryText}>Enviar enlace</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          <TouchableOpacity style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>Hecho</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  card: { width: '100%', backgroundColor: '#141414', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: '#262626', padding: 20, paddingBottom: 32 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#999', fontSize: 12, marginTop: 6, marginBottom: 16, lineHeight: 18 },
  ticketRow: { backgroundColor: '#1a1a1a', borderRadius: 14, borderWidth: 1, borderColor: '#262626', padding: 12, marginBottom: 10 },
  ticketLabel: { color: '#fff', fontSize: 13, fontWeight: '800', marginBottom: 10 },
  actionsRow: { flexDirection: 'row', gap: 8 },
  actionButtonPrimary: { flex: 1, minHeight: 40, borderRadius: 10, backgroundColor: '#ff5a00', alignItems: 'center', justifyContent: 'center' },
  actionButtonPrimaryText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  actionButtonSecondary: { flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: '#333', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionButtonSecondaryText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  statusText: { color: '#ccc', fontSize: 12, fontWeight: '700' },
  doneButton: { marginTop: 6, paddingVertical: 13, alignItems: 'center' },
  doneButtonText: { color: '#888', fontSize: 13, fontWeight: '700' },
});
