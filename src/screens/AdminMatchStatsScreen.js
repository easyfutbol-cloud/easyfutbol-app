import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { colors, spacing } from '../theme';
import { api } from '../api/client';

export default function AdminMatchStatsScreen({ route }) {
  const matchId = route?.params?.id ?? route?.params?.matchId ?? route?.params?.match_id ?? null;

  // debug sencillo por si algo llega mal
  console.log('AdminMatchStatsScreen route params:', route?.params);

  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  if (!matchId) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.title}>Estadísticas del partido</Text>
        <Text style={styles.loading}>No se ha recibido el id del partido.</Text>
      </View>
    );
  }

  const load = () => {
    setLoading(true);
    api
      .get(`/admin/matches/${matchId}/stats`)
      .then((r) => {
        const raw = r.data?.data || [];
        const normalized = raw.map((p) => ({
          ...p,
          goals: String(p.goals ?? 0),
          assists: String(p.assists ?? 0),
          is_mvp: !!p.is_mvp,
        }));
        setPlayers(normalized);
      })
      .catch(() => setPlayers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [matchId]);

  const updateStat = (inscriptionId, field, value) => {
    setPlayers(prev => prev.map(p =>
      p.inscription_id === inscriptionId ? { ...p, [field]: value } : p
    ));
  };

  const toggleMvp = (inscriptionId) => {
    setPlayers((prev) => {
      const current = prev.find((p) => p.inscription_id === inscriptionId);
      const nextIsMvp = !current?.is_mvp;
      // solo un MVP por partido: si marcamos uno, el resto pasa a false
      return prev.map((p) => ({
        ...p,
        is_mvp: p.inscription_id === inscriptionId ? nextIsMvp : false,
      }));
    });
  };

  const save = async (p) => {
    setSaving(true);
    try {
      const payload = {
        goals: Number(p.goals) || 0,
        assists: Number(p.assists) || 0,
        is_mvp: !!p.is_mvp,
      };

      const { data } = await api.patch(
        `/admin/inscriptions/${p.inscription_id}/stats`,
        payload
      );

      if (!data?.ok) throw new Error(data?.msg || 'Error guardando');
      Alert.alert('Hecho', `Stats actualizadas de ${p.name}`);
      load();
    } catch (e) {
      Alert.alert('Error', e.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.email}>{item.email}</Text>
      </View>

      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={String(item.goals ?? 0)}
        onChangeText={(t) => updateStat(item.inscription_id, 'goals', t)}
      />

      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={String(item.assists ?? 0)}
        onChangeText={(t) => updateStat(item.inscription_id, 'assists', t)}
      />

      <TouchableOpacity
        style={[styles.mvpBtn, item.is_mvp && styles.mvpBtnActive]}
        onPress={() => toggleMvp(item.inscription_id)}
        disabled={saving}
      >
        <Text style={[styles.mvpText, item.is_mvp && styles.mvpTextActive]}>
          MVP
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.btn}
        onPress={() => save(item)}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.btnText}>💾</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.title}>Estadísticas Partido #{matchId}</Text>
      {loading ? (
        <Text style={styles.loading}>Cargando…</Text>
      ) : (
        <FlatList
          data={players}
          keyExtractor={p => String(p.inscription_id)}
          renderItem={renderItem}
          ListEmptyComponent={<Text style={styles.empty}>Sin jugadores</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor:colors.black, padding:spacing(2) },
  title:{ color:colors.white, fontSize:20, fontWeight:'800', marginBottom:spacing(2), textAlign:'center' },
  loading:{ color:colors.gray, textAlign:'center' },
  empty:{ color:colors.gray, textAlign:'center', marginTop:spacing(4) },
  row:{ flexDirection:'row', alignItems:'center', backgroundColor:'#111', padding:spacing(1), borderRadius:10, marginBottom:spacing(1) },
  name:{ color:colors.white, fontWeight:'700' },
  email:{ color:'#aaa', fontSize:12 },
  input:{ backgroundColor:'#222', color:'#fff', width:40, height:35, marginHorizontal:4, borderRadius:6, textAlign:'center' },
  btn:{ backgroundColor:colors.orange, paddingHorizontal:10, paddingVertical:6, borderRadius:8 },
  btnText:{ color:'#000', fontWeight:'800' },
  mvpBtn: {
    backgroundColor: '#222',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginHorizontal: 4,
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
