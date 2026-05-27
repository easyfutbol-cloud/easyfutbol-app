import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { colors, spacing } from '../theme';

import { api } from '../api/client';

const getTicketLabel = (player) => {
  const rawValue =
    player?.ticket_type ??
    player?.ticketType ??
    player?.ticket_color ??
    player?.ticketColor ??
    player?.shirt_color ??
    player?.shirtColor ??
    player?.color ??
    player?.team_color ??
    player?.teamColor ??
    '';

  const value = String(rawValue || '').trim().toLowerCase();

  if (value === 'white' || value === 'blanca' || value === 'blanco') return 'Blanca';
  if (value === 'black' || value === 'negra' || value === 'negro') return 'Negra';

  const whiteTickets = Number(player?.white_tickets ?? player?.whiteTickets ?? 0) || 0;
  const blackTickets = Number(player?.black_tickets ?? player?.blackTickets ?? 0) || 0;

  if (whiteTickets > 0 && blackTickets === 0) return 'Blanca';
  if (blackTickets > 0 && whiteTickets === 0) return 'Negra';

  return 'Sin color';
};

export default function AdminMatchStatsScreen({ route }) {
  const initialMatchId =
    route?.params?.id ?? route?.params?.matchId ?? route?.params?.match_id ?? null;

  console.log('AdminMatchStatsScreen route params:', route?.params);

  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState(initialMatchId ? String(initialMatchId) : '');

  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadMatches = async () => {
    setMatchesLoading(true);
    try {
      const { data } = await api.get('/admin/matches');
      const rawMatches = data?.data || data || [];

      const normalizedMatches = rawMatches.map((m) => {
        const id = m.id ?? m.match_id ?? m.event_id;
        const date = m.date ?? m.match_date ?? m.start_time ?? '';
        const title =
          m.title ??
          m.name ??
          m.match_name ??
          `Partido #${id}`;

        return {
          id: String(id),
          label: date ? `${title} · ${date}` : title,
        };
      }).filter((m) => m.id);

      setMatches(normalizedMatches);
    } catch (e) {
      setMatches([]);
    } finally {
      setMatchesLoading(false);
    }
  };

  const load = async () => {
    if (!selectedMatchId) {
      setPlayers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.get(`/matches/${selectedMatchId}/attendees`);
      const raw = data?.data?.attendees || data?.attendees || data?.data || [];
      const normalized = raw.map((p, index) => ({
        ...p,
        name: p.username || p.name || p.buyer_name || 'Entrada sin nombre',
        email: p.email || p.buyer_email || '',
        local_row_id: String(p.inscription_id ?? p.id ?? `${p.user_id ?? 'user'}-${index}`),
      }));
      setPlayers(normalized);
    } catch (e) {
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMatches();
  }, []);

  useEffect(() => {
    load();
  }, [selectedMatchId]);

  const renderItem = ({ item, index }) => {
    const playerId = item.user_id ?? item.assigned_user_id ?? null;
    const profileName = item.name || item.username || item.user_login || 'Entrada sin nombre';
    const ticketLabel = getTicketLabel(item);

    return (
      <View style={styles.row}>
        <View style={styles.entryHeader}>
          <Text style={styles.entryTitle}>Entrada {index + 1}</Text>
          <Text
            style={[
              styles.ticketBadge,
              ticketLabel === 'Blanca' && styles.ticketBadgeWhite,
              ticketLabel === 'Negra' && styles.ticketBadgeBlack,
            ]}
          >
            {ticketLabel}
          </Text>
        </View>

        <View style={styles.identityBlock}>
          <Text style={styles.name}>{profileName}</Text>
          <Text style={styles.playerMeta}>ID jugador: {playerId ?? 'Sin asignar'}</Text>
          {!!item.email && <Text style={styles.email}>{item.email}</Text>}
        </View>

        <View style={styles.readOnlyStatsRow}>
          <Text style={styles.readOnlyStat}>Inscripción: {item.inscription_id ?? '-'}</Text>
          <Text style={styles.readOnlyStat}>Color: {ticketLabel}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.title}>Estadísticas de partidos</Text>

      <View style={styles.selectorCard}>
        <Text style={styles.selectorLabel}>Selecciona el partido</Text>
        {matchesLoading ? (
          <ActivityIndicator color={colors.orange} />
        ) : (
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={selectedMatchId}
              onValueChange={(value) => setSelectedMatchId(value)}
              dropdownIconColor={colors.white}
              style={styles.picker}
            >
              <Picker.Item label="Elige un partido" value="" />
              {matches.map((match) => (
                <Picker.Item key={match.id} label={match.label} value={match.id} />
              ))}
            </Picker>
          </View>
        )}
      </View>

      {!selectedMatchId ? (
        <Text style={styles.loading}>Selecciona un partido para cargar sus asistentes.</Text>
      ) : loading ? (
        <Text style={styles.loading}>Cargando…</Text>
      ) : (
        <FlatList
          data={players}
          keyExtractor={(p) => String(p.local_row_id)}
          renderItem={renderItem}
          ListEmptyComponent={<Text style={styles.empty}>Sin jugadores</Text>}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
    padding: spacing(2),
  },
  title: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: spacing(2),
    textAlign: 'center',
  },
  selectorCard: {
    backgroundColor: '#111',
    borderRadius: 14,
    padding: spacing(1.5),
    marginBottom: spacing(2),
    borderWidth: 1,
    borderColor: '#222',
  },
  selectorLabel: {
    color: colors.white,
    fontWeight: '700',
    marginBottom: 8,
  },
  loading: {
    color: colors.gray,
    textAlign: 'center',
    marginTop: spacing(3),
  },
  empty: {
    color: colors.gray,
    textAlign: 'center',
    marginTop: spacing(4),
  },
  listContent: {
    paddingBottom: spacing(3),
  },
  row: {
    backgroundColor: '#111',
    padding: spacing(1.25),
    borderRadius: 14,
    marginBottom: spacing(1.5),
    borderWidth: 1,
    borderColor: '#222',
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  entryTitle: {
    color: colors.orange,
    fontWeight: '800',
  },
  ticketBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#222',
    color: '#aaa',
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
  },
  ticketBadgeWhite: {
    backgroundColor: '#fff',
    color: '#000',
  },
  ticketBadgeBlack: {
    backgroundColor: '#000',
    color: '#fff',
    borderWidth: 1,
    borderColor: '#444',
  },
  identityBlock: {
    marginBottom: 12,
  },
  name: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  playerMeta: {
    color: colors.orange,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  email: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 2,
  },
  readOnlyStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  readOnlyStat: {
    color: '#ddd',
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: '#1f1f1f',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  mvpReadOnly: {
    color: '#000',
    fontSize: 12,
    fontWeight: '900',
    backgroundColor: colors.orange,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
});
