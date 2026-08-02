import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../api/client';
import { colors, layout, radii, shadows, spacing, typography } from '../theme';
import { goBackOrFallback } from '../utils/navigation';

const EXAMPLE = `Ganadores negro
408,3,0
431,3,0
834,1,6 MVP
Perdedores blanco
441,0,0
756,0,1`;

const normalizeLine = (line) => line.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function parseHeader(line) {
  const normalized = normalizeLine(line);
  const team = normalized.includes('negro') || normalized.includes('negra')
    ? 'black'
    : normalized.includes('blanco') || normalized.includes('blanca')
      ? 'white'
      : null;
  const result = normalized.includes('ganador')
    ? 'win'
    : normalized.includes('perdedor')
      ? 'loss'
      : normalized.includes('empate')
        ? 'draw'
        : null;

  return team && result ? { team, result } : null;
}

function parseStatsText(text) {
  const entries = [];
  const errors = [];
  let section = null;

  String(text || '').split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    const header = parseHeader(line);
    if (header) {
      section = header;
      return;
    }

    if (!section) {
      errors.push(`Línea ${index + 1}: indica antes Ganadores/Perdedores y el color.`);
      return;
    }

    const parts = line.split(',').map((part) => part.trim());
    if (parts.length < 3 || parts.length > 4) {
      errors.push(`Línea ${index + 1}: usa ID,goles,asistencias y MVP opcional.`);
      return;
    }

    const userId = Number(parts[0]);
    const goals = Number(parts[1]);
    const assistsMatch = parts[2].match(/^(\d+)\s*(mvp)?$/i);
    const fourth = parts[3] || '';
    const assists = assistsMatch ? Number(assistsMatch[1]) : Number.NaN;
    const isMvp = Boolean(assistsMatch?.[2]) || /^mvp$/i.test(fourth);

    if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(goals) || goals < 0 || !Number.isInteger(assists) || assists < 0) {
      errors.push(`Línea ${index + 1}: ID, goles y asistencias deben ser enteros positivos o cero.`);
      return;
    }
    if (fourth && !/^mvp$/i.test(fourth)) {
      errors.push(`Línea ${index + 1}: el cuarto valor solo puede ser MVP.`);
      return;
    }

    entries.push({ user_id: userId, goals, assists, is_mvp: isMvp, ...section, line: index + 1 });
  });

  const seen = new Set();
  entries.forEach((entry) => {
    if (seen.has(entry.user_id)) errors.push(`ID ${entry.user_id}: aparece más de una vez.`);
    seen.add(entry.user_id);
  });

  if (entries.filter((entry) => entry.is_mvp).length > 1) errors.push('Solo puede haber un MVP en el partido.');
  if (!entries.length && !errors.length) errors.push('Pega al menos una estadística.');

  return { entries, errors };
}

const teamLabel = (team) => team === 'black' ? 'Negro' : 'Blanco';

export default function AdminMatchStatsImportScreen({ route, navigation }) {
  const routeMatchId = route?.params?.id ?? route?.params?.matchId ?? route?.params?.match_id;
  const [matches, setMatches] = useState([]);
  const [selectedMatchId, setSelectedMatchId] = useState(routeMatchId ? String(routeMatchId) : '');
  const [players, setPlayers] = useState([]);
  const [text, setText] = useState('');
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  const parsed = useMemo(() => parseStatsText(text), [text]);
  const playersById = useMemo(() => {
    const users = new Map();
    players.forEach((player) => {
      users.set(Number(player.user_id), player);
      (player.assignable_users || []).forEach((user) => {
        const userId = Number(user.id);
        if (!users.has(userId)) users.set(userId, { ...user, user_id: userId });
      });
    });
    return users;
  }, [players]);
  const preview = useMemo(() => parsed.entries.map((entry) => ({
    ...entry,
    player: playersById.get(entry.user_id),
  })), [parsed.entries, playersById]);
  const validationErrors = parsed.errors;
  const canSave = Boolean(selectedMatchId && preview.length && !validationErrors.length && !saving);

  useEffect(() => {
    let active = true;
    api.get('/admin/matches')
      .then(({ data }) => {
        if (!active) return;
        const raw = data?.data || data || [];
        setMatches(raw.map((match) => ({
          id: String(match.id ?? match.match_id),
          label: `${match.title || match.name || `Partido #${match.id}`} · ${match.match_date || match.date || ''}`,
        })).filter((match) => match.id));
      })
      .catch(() => active && setLoadError('No se pudo cargar la lista de partidos.'))
      .finally(() => active && setLoadingMatches(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!selectedMatchId) {
      setPlayers([]);
      setLoadError('');
      return () => { active = false; };
    }
    setLoadingPlayers(true);
    setLoadError('');
    api.get(`/admin/matches/${selectedMatchId}/stats`)
      .then(({ data }) => active && setPlayers(data?.data || []))
      .catch((error) => active && setLoadError(error?.response?.data?.msg || 'No se pudieron cargar los jugadores.'))
      .finally(() => active && setLoadingPlayers(false));
    return () => { active = false; };
  }, [selectedMatchId]);

  const save = () => {
    if (!canSave) return;
    Alert.alert(
      'Confirmar estadísticas',
      `Se actualizarán ${preview.length} jugadores del partido #${selectedMatchId}. Esta acción sustituye sus estadísticas anteriores.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Guardar',
          onPress: async () => {
            setSaving(true);
            try {
              const { data } = await api.post(`/admin/matches/${selectedMatchId}/stats/bulk`, {
                entries: parsed.entries.map(({ line, ...entry }) => entry),
              });
              Alert.alert('Estadísticas guardadas', data?.msg || 'La importación se completó correctamente.');
              const response = await api.get(`/admin/matches/${selectedMatchId}/stats`);
              setPlayers(response.data?.data || []);
            } catch (error) {
              Alert.alert('No se pudo guardar', error?.response?.data?.msg || 'Revisa los datos e inténtalo de nuevo.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={['#2B1508', '#11151B']} style={styles.hero}>
          <TouchableOpacity style={styles.backButton} onPress={() => goBackOrFallback(navigation)} accessibilityRole="button">
            <Ionicons name="arrow-back" size={20} color={colors.white} />
            <Text style={styles.backText}>Volver</Text>
          </TouchableOpacity>
          <View style={styles.heroTopline}>
            <View style={styles.heroIcon}><Ionicons name="clipboard" size={25} color={colors.orange} /></View>
            {selectedMatchId ? <View style={styles.matchBadge}><Text style={styles.matchBadgeText}>PARTIDO #{selectedMatchId}</Text></View> : null}
          </View>
          <Text style={styles.eyebrow}>ACTA DIGITAL</Text>
          <Text style={styles.title}>Cargar estadísticas</Text>
          <Text style={styles.description}>Pega el resultado, comprueba cada jugador y publica todas las estadísticas de una vez.</Text>
        </LinearGradient>

        <View style={styles.card}>
          <View style={styles.stepHeading}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
            <View style={styles.stepCopy}><Text style={styles.cardTitle}>Partido</Text><Text style={styles.stepHint}>Confirma dónde se guardará el acta.</Text></View>
            {selectedMatchId ? <Ionicons name="checkmark-circle" size={24} color={colors.success} /> : null}
          </View>
          {loadingMatches ? <ActivityIndicator color={colors.orange} /> : (
            <View style={styles.pickerWrap}>
              <Picker selectedValue={selectedMatchId} onValueChange={setSelectedMatchId} dropdownIconColor={colors.white} style={styles.picker}>
                <Picker.Item label="Selecciona un partido" value="" />
                {matches.map((match) => <Picker.Item key={match.id} label={match.label} value={match.id} />)}
              </Picker>
            </View>
          )}
          {selectedMatchId ? <Text style={styles.matchId}>ID del partido: {selectedMatchId}</Text> : null}
          {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>Pegar estadísticas</Text>
              <Text style={styles.help}>Formato: ID, goles, asistencias y “MVP” opcional.</Text>
            </View>
            <TouchableOpacity style={styles.exampleButton} onPress={() => setText(EXAMPLE)}>
              <Text style={styles.exampleButtonText}>Usar ejemplo</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={text}
            onChangeText={setText}
            style={styles.input}
            multiline
            textAlignVertical="top"
            autoCorrect={false}
            autoCapitalize="sentences"
            placeholder={EXAMPLE}
            placeholderTextColor={colors.textSubtle}
            accessibilityLabel="Acta de estadísticas del partido"
          />
          <View style={styles.formatLegend}>
            <View style={styles.legendItem}><Ionicons name="person-outline" size={14} color={colors.textMuted} /><Text style={styles.legendText}>ID</Text></View>
            <View style={styles.legendItem}><Ionicons name="football-outline" size={14} color={colors.textMuted} /><Text style={styles.legendText}>Goles</Text></View>
            <View style={styles.legendItem}><Ionicons name="navigate-outline" size={14} color={colors.textMuted} /><Text style={styles.legendText}>Asistencias</Text></View>
            <View style={styles.legendItem}><Ionicons name="star-outline" size={14} color={colors.orange} /><Text style={styles.legendText}>MVP</Text></View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.previewHeader}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
            <View style={styles.stepCopy}><Text style={styles.cardTitle}>Vista previa</Text><Text style={styles.stepHint}>Comprueba el acta antes de publicarla.</Text></View>
            <Text style={styles.counter}>{preview.length} jugadores</Text>
          </View>

          {loadingPlayers ? <ActivityIndicator color={colors.orange} style={styles.loader} /> : null}
          {validationErrors.map((error) => <Text key={error} style={styles.errorText}>• {error}</Text>)}
          {text.trim() && preview.length > 0 && !validationErrors.length ? (
            <View style={styles.validBanner}><Ionicons name="shield-checkmark" size={18} color={colors.success} /><Text style={styles.validText}>Acta validada y lista para guardar</Text></View>
          ) : null}
          {!text.trim() ? <Text style={styles.emptyText}>La vista previa aparecerá al pegar el acta.</Text> : null}

          {preview.map((entry) => (
            <View key={`${entry.user_id}-${entry.line}`} style={styles.playerRow}>
              <View style={[styles.teamMarker, entry.team === 'white' ? styles.whiteMarker : styles.blackMarker]} />
              <View style={styles.playerCopy}>
                <Text style={styles.playerName}>{entry.player?.name || `Jugador ID ${entry.user_id}`}</Text>
                <Text style={styles.playerMeta}>ID {entry.user_id} · {teamLabel(entry.team)} · {entry.result === 'win' ? 'Ganador' : entry.result === 'loss' ? 'Perdedor' : 'Empate'}</Text>
              </View>
              <View style={styles.statPill}><Text style={styles.statNumber}>{entry.goals}</Text><Text style={styles.statLabel}>G</Text></View>
              <View style={styles.statPill}><Text style={styles.statNumber}>{entry.assists}</Text><Text style={styles.statLabel}>A</Text></View>
              {entry.is_mvp ? <View style={styles.mvpPill}><Ionicons name="star" size={12} color={colors.black} /><Text style={styles.mvpText}>MVP</Text></View> : null}
            </View>
          ))}
        </View>

        <TouchableOpacity style={[styles.saveButton, !canSave && styles.saveButtonDisabled]} onPress={save} disabled={!canSave} accessibilityRole="button">
          {saving ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="cloud-upload-outline" size={21} color={colors.white} /><Text style={styles.saveText}>Publicar estadísticas</Text></>}
        </TouchableOpacity>
        <Text style={styles.safetyText}>Nada se guarda hasta confirmar. Si hay un error, no se aplicará ninguna fila.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', padding: layout.screenPadding, paddingBottom: spacing(6) },
  hero: { borderRadius: radii.large, borderWidth: 1, borderColor: 'rgba(255,90,0,0.28)', padding: spacing(2), marginBottom: spacing(2), overflow: 'hidden' },
  backButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing(0.75), alignSelf: 'flex-start', paddingRight: spacing(2) },
  backText: { color: colors.white, ...typography.bodyStrong },
  heroTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing(1) },
  heroIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,90,0,0.14)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.35)' },
  matchBadge: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, paddingHorizontal: spacing(1.25), paddingVertical: spacing(0.75) },
  matchBadgeText: { color: colors.white, ...typography.overline, letterSpacing: 0.7 },
  eyebrow: { color: colors.orange, ...typography.overline, marginTop: spacing(1.5) },
  title: { color: colors.white, ...typography.display, marginTop: spacing(0.75) },
  description: { color: colors.textMuted, ...typography.body, marginTop: spacing(1), maxWidth: 620 },
  card: { backgroundColor: colors.surface, borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, padding: spacing(2), marginBottom: spacing(2), ...shadows.card },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing(1.25) },
  cardHeaderCopy: { flex: 1 },
  stepHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.25) },
  stepNumber: { width: 34, height: 34, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.orange },
  stepNumberText: { color: colors.white, fontWeight: '900' },
  stepCopy: { flex: 1 },
  stepHint: { color: colors.textSubtle, ...typography.caption, marginTop: 2 },
  cardTitle: { color: colors.white, ...typography.heading },
  help: { color: colors.textMuted, ...typography.caption, marginTop: spacing(0.5) },
  pickerWrap: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, overflow: 'hidden', marginTop: spacing(1.5), backgroundColor: colors.surfaceElevated },
  picker: { color: colors.white },
  matchId: { color: colors.orange, ...typography.caption, marginTop: spacing(1) },
  exampleButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing(1.25), borderRadius: radii.pill, borderWidth: 1, borderColor: colors.orange },
  exampleButtonText: { color: colors.orange, ...typography.caption },
  input: { minHeight: 230, color: colors.white, backgroundColor: colors.ink || '#090B0F', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, padding: spacing(1.5), marginTop: spacing(2), fontSize: 15, lineHeight: 23, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  formatLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(1), marginTop: spacing(1.25) },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceElevated, borderRadius: radii.pill, paddingHorizontal: spacing(1), paddingVertical: spacing(0.5) },
  legendText: { color: colors.textMuted, ...typography.caption },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), marginBottom: spacing(1.5) },
  counter: { color: colors.orange, ...typography.caption, backgroundColor: 'rgba(255,90,0,0.12)', borderRadius: radii.pill, paddingHorizontal: spacing(1), paddingVertical: spacing(0.6) },
  loader: { marginVertical: spacing(2) },
  errorText: { color: colors.danger, ...typography.caption, marginTop: spacing(1) },
  validBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing(0.75), backgroundColor: 'rgba(57,217,138,0.10)', borderWidth: 1, borderColor: 'rgba(57,217,138,0.30)', borderRadius: radii.medium, padding: spacing(1.25), marginBottom: spacing(1) },
  validText: { color: colors.success, ...typography.caption },
  emptyText: { color: colors.textSubtle, ...typography.body, textAlign: 'center', paddingVertical: spacing(3) },
  playerRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing(1), borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing(1.25) },
  teamMarker: { width: 10, height: 38, borderRadius: radii.pill },
  whiteMarker: { backgroundColor: colors.white },
  blackMarker: { backgroundColor: colors.black, borderWidth: 1, borderColor: colors.textSubtle },
  playerCopy: { flex: 1, minWidth: 100 },
  playerName: { color: colors.white, ...typography.bodyStrong },
  playerMeta: { color: colors.textSubtle, ...typography.caption, marginTop: 2 },
  statPill: { minWidth: 36, height: 36, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 2, backgroundColor: colors.surfaceElevated, borderRadius: 11, borderWidth: 1, borderColor: colors.border },
  statNumber: { color: colors.white, fontSize: 14, fontWeight: '900' },
  statLabel: { color: colors.textSubtle, fontSize: 9, fontWeight: '900' },
  mvpPill: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.orange, borderRadius: 11, paddingHorizontal: spacing(0.8) },
  mvpText: { color: colors.black, fontSize: 9, fontWeight: '900' },
  saveButton: { minHeight: 58, flexDirection: 'row', gap: spacing(1), backgroundColor: colors.orange, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center' },
  saveButtonDisabled: { opacity: 0.4 },
  saveText: { color: colors.white, ...typography.bodyStrong },
  safetyText: { color: colors.textSubtle, ...typography.caption, textAlign: 'center', marginTop: spacing(1) },
});
