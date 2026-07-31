import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../api/client';
import { colors, layout, radii, spacing, typography } from '../theme';

const getTeamName = (ticketType) => ticketType === 'black' ? 'Negro' : ticketType === 'white' ? 'Blanco' : 'Sin equipo';

export default function AdminMatchStatsScreen({ route, navigation }) {
  const routeMatchId = route?.params?.id ?? route?.params?.matchId ?? route?.params?.match_id;
  const [matches, setMatches] = useState([]);
  const [selectedMatchId, setSelectedMatchId] = useState(routeMatchId ? String(routeMatchId) : '');
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/admin/matches')
      .then(({ data }) => {
        if (!active) return;
        const raw = data?.data || data || [];
        setMatches(raw.map((match) => ({
          id: String(match.id ?? match.match_id),
          label: `${match.title || `Partido #${match.id}`} · ${match.match_date || ''}`,
        })).filter((match) => match.id));
      })
      .catch(() => active && setError('No se pudieron cargar los partidos.'))
      .finally(() => active && setLoadingMatches(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!selectedMatchId) {
      setPlayers([]);
      return () => { active = false; };
    }
    setLoading(true);
    setError('');
    api.get(`/admin/matches/${selectedMatchId}/stats`)
      .then(({ data }) => active && setPlayers(data?.data || []))
      .catch((requestError) => active && setError(requestError?.response?.data?.msg || 'No se pudieron cargar las estadísticas.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [selectedMatchId]);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#241208', '#11151B']} style={styles.hero}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()}>
          <Ionicons name="arrow-back" size={20} color={colors.white} />
          <Text style={styles.backText}>Volver</Text>
        </TouchableOpacity>
        <View style={styles.heroIcon}>
          <Ionicons name="stats-chart" size={25} color={colors.orange} />
        </View>
        <Text style={styles.eyebrow}>CENTRO DE PARTIDO</Text>
        <Text style={styles.title}>Estadísticas</Text>
        <Text style={styles.description}>Revisa la convocatoria y carga el acta definitiva desde un único lugar.</Text>
      </LinearGradient>

      <View style={styles.selectorCard}>
        <View style={styles.sectionHeading}>
          <View style={styles.sectionNumber}><Text style={styles.sectionNumberText}>1</Text></View>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>Selecciona el partido</Text>
            <Text style={styles.sectionHint}>El ID se enviará automáticamente al acta.</Text>
          </View>
        </View>
        {loadingMatches ? <ActivityIndicator color={colors.orange} /> : (
          <View style={styles.pickerWrap}>
            <Picker selectedValue={selectedMatchId} onValueChange={setSelectedMatchId} dropdownIconColor={colors.white} style={styles.picker}>
              <Picker.Item label="Selecciona un partido" value="" />
              {matches.map((match) => <Picker.Item key={match.id} label={match.label} value={match.id} />)}
            </Picker>
          </View>
        )}
        <TouchableOpacity
          style={[styles.importButton, !selectedMatchId && styles.disabledButton]}
          disabled={!selectedMatchId}
          onPress={() => navigation.navigate('AdminMatchStatsImport', { matchId: selectedMatchId })}
        >
          <Ionicons name="clipboard-outline" size={20} color={colors.white} />
          <Text style={styles.importButtonText}>Pegar acta de estadísticas</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.white} />
        </TouchableOpacity>
      </View>

      {selectedMatchId ? (
        <View style={styles.listHeading}>
          <View>
            <Text style={styles.listEyebrow}>CONVOCATORIA</Text>
            <Text style={styles.listTitle}>{players.length} jugadores registrados</Text>
          </View>
          <View style={styles.matchBadge}><Text style={styles.matchBadgeText}>#{selectedMatchId}</Text></View>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color={colors.orange} style={styles.loader} /> : (
        <FlatList
          data={players}
          keyExtractor={(item, index) => String(item.inscription_id ?? `${item.user_id}-${index}`)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{selectedMatchId ? 'No hay jugadores asignados.' : 'Selecciona un partido.'}</Text>}
          renderItem={({ item }) => (
            <View style={styles.playerCard}>
              <View style={[styles.teamMarker, item.ticket_type === 'white' ? styles.whiteMarker : styles.blackMarker]} />
              <View style={styles.playerCopy}>
                <Text style={styles.playerName}>{item.name || item.buyer_name || 'Entrada sin asignar'}</Text>
                <Text style={styles.playerMeta}>ID {item.user_id ?? '—'} · Equipo {getTeamName(item.ticket_type)}</Text>
              </View>
              <View style={styles.statsWrap}>
                <View style={styles.statChip}><Text style={styles.statChipValue}>{Number(item.goals || 0)}</Text><Text style={styles.statChipLabel}>G</Text></View>
                <View style={styles.statChip}><Text style={styles.statChipValue}>{Number(item.assists || 0)}</Text><Text style={styles.statChipLabel}>A</Text></View>
                {item.is_mvp ? <View style={styles.mvpChip}><Ionicons name="star" size={12} color={colors.black} /><Text style={styles.mvpChipText}>MVP</Text></View> : null}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: layout.screenPadding },
  hero: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', borderRadius: radii.large, borderWidth: 1, borderColor: 'rgba(255,90,0,0.25)', padding: spacing(2), marginBottom: spacing(2), overflow: 'hidden' },
  backButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing(0.75), alignSelf: 'flex-start' },
  backText: { color: colors.white, ...typography.bodyStrong },
  heroIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,90,0,0.14)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.35)', marginTop: spacing(1) },
  eyebrow: { color: colors.orange, ...typography.overline, marginTop: spacing(1.5) },
  title: { color: colors.white, ...typography.display, marginTop: spacing(0.75) },
  description: { color: colors.textMuted, ...typography.body, marginTop: spacing(0.75), marginBottom: spacing(2) },
  selectorCard: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', backgroundColor: colors.surface, borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, padding: spacing(2), marginBottom: spacing(2) },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), marginBottom: spacing(1.5) },
  sectionNumber: { width: 34, height: 34, borderRadius: 12, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  sectionNumberText: { color: colors.white, fontWeight: '900' },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: colors.white, ...typography.bodyStrong },
  sectionHint: { color: colors.textSubtle, ...typography.caption, marginTop: 2 },
  pickerWrap: { borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', backgroundColor: colors.surfaceElevated },
  picker: { color: colors.white },
  importButton: { minHeight: 54, flexDirection: 'row', gap: spacing(1), borderRadius: radii.medium, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', marginTop: spacing(1.25), paddingHorizontal: spacing(1.5) },
  disabledButton: { opacity: 0.4 },
  importButtonText: { flex: 1, color: colors.white, ...typography.bodyStrong, textAlign: 'center' },
  listHeading: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(1.25) },
  listEyebrow: { color: colors.orange, ...typography.overline },
  listTitle: { color: colors.white, ...typography.heading, marginTop: 3 },
  matchBadge: { backgroundColor: colors.surfaceElevated, paddingHorizontal: spacing(1.25), paddingVertical: spacing(0.75), borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  matchBadgeText: { color: colors.textMuted, ...typography.caption },
  loader: { marginTop: spacing(4) },
  error: { color: colors.danger, ...typography.caption, textAlign: 'center', marginBottom: spacing(1) },
  list: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', paddingBottom: spacing(4) },
  empty: { color: colors.textSubtle, ...typography.body, textAlign: 'center', marginTop: spacing(4) },
  playerCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), backgroundColor: colors.surface, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, padding: spacing(1.5), marginBottom: spacing(1) },
  teamMarker: { width: 10, height: 40, borderRadius: radii.pill },
  whiteMarker: { backgroundColor: colors.white },
  blackMarker: { backgroundColor: colors.black, borderWidth: 1, borderColor: colors.textSubtle },
  playerCopy: { flex: 1 },
  playerName: { color: colors.white, ...typography.bodyStrong },
  playerMeta: { color: colors.textSubtle, ...typography.caption, marginTop: 3 },
  statsWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statChip: { minWidth: 34, height: 34, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 2, backgroundColor: colors.surfaceElevated, borderRadius: 11, borderWidth: 1, borderColor: colors.border },
  statChipValue: { color: colors.white, fontSize: 14, fontWeight: '900' },
  statChipLabel: { color: colors.textSubtle, fontSize: 9, fontWeight: '800' },
  mvpChip: { height: 34, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.orange, borderRadius: 11, paddingHorizontal: 7 },
  mvpChipText: { color: colors.black, fontSize: 9, fontWeight: '900' },
});
