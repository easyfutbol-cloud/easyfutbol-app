import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { colors, spacing } from '../theme';
import { api } from '../api/client';

export default function AdminMatchStatsScreen({ route }) {
  const initialMatchId =
    route?.params?.id ?? route?.params?.matchId ?? route?.params?.match_id ?? null;

  console.log('AdminMatchStatsScreen route params:', route?.params);

  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState(initialMatchId ? String(initialMatchId) : '');

  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const userOptions = useMemo(() => {
    const seen = new Map();

    players.forEach((p) => {
      const userId = p.user_id ?? p.assigned_user_id ?? null;
      if (!userId) return;
      if (!seen.has(String(userId))) {
        seen.set(String(userId), {
          value: String(userId),
          label: p.name ? `${p.name}${p.email ? ` · ${p.email}` : ''}` : `Usuario #${userId}`,
        });
      }
    });

    return Array.from(seen.values());
  }, [players]);

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
      const { data } = await api.get(`/admin/matches/${selectedMatchId}/stats`);
      const raw = data?.data || [];
      const normalized = raw.map((p, index) => ({
        ...p,
        local_row_id: String(p.inscription_id ?? p.id ?? index),
        goals: String(p.goals ?? 0),
        assists: String(p.assists ?? 0),
        is_mvp: !!p.is_mvp,
        assigned_user_id: p.assigned_user_id ?? p.user_id ?? '',
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

  const updateStat = (inscriptionId, field, value) => {
    setPlayers((prev) =>
      prev.map((p) =>
        p.inscription_id === inscriptionId ? { ...p, [field]: value } : p
      )
    );
  };

  const toggleMvp = (inscriptionId) => {
    setPlayers((prev) => {
      const current = prev.find((p) => p.inscription_id === inscriptionId);
      const nextIsMvp = !current?.is_mvp;

      return prev.map((p) => ({
        ...p,
        is_mvp: p.inscription_id === inscriptionId ? nextIsMvp : false,
      }));
    });
  };

  const save = async (p) => {
    setSavingId(p.inscription_id);
    try {
      const payload = {
        goals: Number(p.goals) || 0,
        assists: Number(p.assists) || 0,
        is_mvp: !!p.is_mvp,
        assigned_user_id: p.assigned_user_id ? Number(p.assigned_user_id) : null,
      };

      const { data } = await api.patch(
        `/admin/inscriptions/${p.inscription_id}/stats`,
        payload
      );

      if (!data?.ok) throw new Error(data?.msg || 'Error guardando');
      Alert.alert('Hecho', `Stats actualizadas de ${p.name || 'la entrada'}`);
      load();
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo guardar');
    } finally {
      setSavingId(null);
    }
  };

  const renderItem = ({ item, index }) => {
    const saving = savingId === item.inscription_id;

    return (
      <View style={styles.row}>
        <Text style={styles.entryTitle}>Entrada {index + 1}</Text>

        <View style={styles.userBlock}>
          <Text style={styles.label}>Jugador asignado</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={item.assigned_user_id || ''}
              onValueChange={(value) => updateStat(item.inscription_id, 'assigned_user_id', value)}
              dropdownIconColor={colors.white}
              style={styles.picker}
            >
              <Picker.Item label="Sin asignar" value="" />
              {userOptions.map((option) => (
                <Picker.Item key={option.value} label={option.label} value={option.value} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.identityBlock}>
          <Text style={styles.name}>{item.name || 'Entrada sin nombre'}</Text>
          {!!item.email && <Text style={styles.email}>{item.email}</Text>}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.label}>Goles</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(item.goals ?? 0)}
              onChangeText={(t) => updateStat(item.inscription_id, 'goals', t)}
            />
          </View>

          <View style={styles.statBox}>
            <Text style={styles.label}>Asist.</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(item.assists ?? 0)}
              onChangeText={(t) => updateStat(item.inscription_id, 'assists', t)}
            />
          </View>

          <TouchableOpacity
            style={[styles.mvpBtn, item.is_mvp && styles.mvpBtnActive]}
            onPress={() => toggleMvp(item.inscription_id)}
            disabled={!!savingId}
          >
            <Text style={[styles.mvpText, item.is_mvp && styles.mvpTextActive]}>MVP</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.btn, saving && styles.btnDisabled]}
          onPress={() => save(item)}
          disabled={!!savingId}
        >
          {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Guardar</Text>}
        </TouchableOpacity>
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
  entryTitle: {
    color: colors.orange,
    fontWeight: '800',
    marginBottom: 8,
  },
  userBlock: {
    marginBottom: 10,
  },
  identityBlock: {
    marginBottom: 12,
  },
  name: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  email: {
    color: '#aaa',
    fontSize: 12,
    marginTop: 2,
  },
  label: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  pickerWrap: {
    backgroundColor: '#1b1b1b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
  },
  picker: {
    color: colors.white,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
  },
  input: {
    backgroundColor: '#222',
    color: '#fff',
    height: 42,
    borderRadius: 10,
    textAlign: 'center',
    fontWeight: '700',
  },
  btn: {
    backgroundColor: colors.orange,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.7,
  },
  btnText: {
    color: '#000',
    fontWeight: '800',
  },
  mvpBtn: {
    backgroundColor: '#222',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#555',
  },
  mvpBtnActive: {
    backgroundColor: colors.orange,
    borderColor: colors.orange,
  },
  mvpText: {
    color: '#ccc',
    fontWeight: '700',
    fontSize: 12,
  },
  mvpTextActive: {
    color: '#000',
  },
});
