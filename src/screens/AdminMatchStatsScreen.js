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
import { api } from '../api/client';
import { colors, layout, radii, shadows, spacing, typography } from '../theme';

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

export default function AdminMatchStatsScreen({ route, navigation }) {
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
  const playersById = useMemo(() => new Map(players.map((player) => [Number(player.user_id), player])), [players]);
  const preview = useMemo(() => parsed.entries.map((entry) => ({
    ...entry,
    player: playersById.get(entry.user_id),
  })), [parsed.entries, playersById]);
  const unmatchedIds = preview.filter((entry) => !entry.player).map((entry) => entry.user_id);
  const teamMismatches = preview.filter((entry) => entry.player?.ticket_type && entry.player.ticket_type !== entry.team);
  const validationErrors = [
    ...parsed.errors,
    ...(unmatchedIds.length ? [`No inscritos o sin asignar: ${unmatchedIds.join(', ')}.`] : []),
    ...(teamMismatches.length ? [`Equipo incorrecto para: ${teamMismatches.map((entry) => entry.user_id).join(', ')}.`] : []),
  ];
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
        <TouchableOpacity style={styles.backButton} onPress={() => navigation?.goBack()} accessibilityRole="button">
          <Text style={styles.backText}>‹ Volver</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>ADMINISTRACIÓN · ESTADÍSTICAS</Text>
        <Text style={styles.title}>Cargar acta del partido</Text>
        <Text style={styles.description}>Pega el acta completa, revisa la vista previa y guarda todos los datos de una vez.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>1. Partido</Text>
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
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.cardTitle}>2. Pegar estadísticas</Text>
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
        </View>

        <View style={styles.card}>
          <View style={styles.previewHeader}>
            <Text style={styles.cardTitle}>3. Vista previa</Text>
            <Text style={styles.counter}>{preview.length} jugadores</Text>
          </View>

          {loadingPlayers ? <ActivityIndicator color={colors.orange} style={styles.loader} /> : null}
          {validationErrors.map((error) => <Text key={error} style={styles.errorText}>• {error}</Text>)}
          {!text.trim() ? <Text style={styles.emptyText}>La vista previa aparecerá al pegar el acta.</Text> : null}

          {preview.map((entry) => (
            <View key={`${entry.user_id}-${entry.line}`} style={[styles.playerRow, !entry.player && styles.playerRowError]}>
              <View style={[styles.teamMarker, entry.team === 'white' ? styles.whiteMarker : styles.blackMarker]} />
              <View style={styles.playerCopy}>
                <Text style={styles.playerName}>{entry.player?.name || `ID ${entry.user_id} no encontrado`}</Text>
                <Text style={styles.playerMeta}>ID {entry.user_id} · {teamLabel(entry.team)} · {entry.result === 'win' ? 'Ganador' : entry.result === 'loss' ? 'Perdedor' : 'Empate'}</Text>
              </View>
              <View style={styles.statPill}><Text style={styles.statValue}>{entry.goals} G</Text></View>
              <View style={styles.statPill}><Text style={styles.statValue}>{entry.assists} A</Text></View>
              {entry.is_mvp ? <View style={styles.mvpPill}><Text style={styles.mvpText}>MVP</Text></View> : null}
            </View>
          ))}
        </View>

        <TouchableOpacity style={[styles.saveButton, !canSave && styles.saveButtonDisabled]} onPress={save} disabled={!canSave} accessibilityRole="button">
          {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>Guardar estadísticas</Text>}
        </TouchableOpacity>
        <Text style={styles.safetyText}>Nada se guarda hasta confirmar. Si hay un error, no se aplicará ninguna fila.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', padding: layout.screenPadding, paddingBottom: spacing(6) },
  backButton: { minHeight: layout.minTouchTarget, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: spacing(2) },
  backText: { color: colors.textMuted, ...typography.bodyStrong },
  eyebrow: { color: colors.orange, ...typography.overline, marginTop: spacing(1) },
  title: { color: colors.white, ...typography.display, marginTop: spacing(0.75) },
  description: { color: colors.textMuted, ...typography.body, marginTop: spacing(1), marginBottom: spacing(3), maxWidth: 620 },
  card: { backgroundColor: colors.surface, borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, padding: spacing(2), marginBottom: spacing(2), ...shadows.card },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing(1) },
  cardHeaderCopy: { flex: 1 },
  cardTitle: { color: colors.white, ...typography.heading },
  help: { color: colors.textMuted, ...typography.caption, marginTop: spacing(0.5) },
  pickerWrap: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, overflow: 'hidden', marginTop: spacing(1.5), backgroundColor: colors.surfaceElevated },
  picker: { color: colors.white },
  matchId: { color: colors.orange, ...typography.caption, marginTop: spacing(1) },
  exampleButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing(1.25), borderRadius: radii.pill, borderWidth: 1, borderColor: colors.orange },
  exampleButtonText: { color: colors.orange, ...typography.caption },
  input: { minHeight: 230, color: colors.white, backgroundColor: colors.ink || '#090B0F', borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border, padding: spacing(1.5), marginTop: spacing(2), fontSize: 15, lineHeight: 23, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing(1.5) },
  counter: { color: colors.orange, ...typography.caption },
  loader: { marginVertical: spacing(2) },
  errorText: { color: colors.danger, ...typography.caption, marginTop: spacing(1) },
  emptyText: { color: colors.textSubtle, ...typography.body, textAlign: 'center', paddingVertical: spacing(3) },
  playerRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing(1), borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing(1.25) },
  playerRowError: { backgroundColor: 'rgba(255,92,92,0.08)' },
  teamMarker: { width: 10, height: 38, borderRadius: radii.pill },
  whiteMarker: { backgroundColor: colors.white },
  blackMarker: { backgroundColor: colors.black, borderWidth: 1, borderColor: colors.textSubtle },
  playerCopy: { flex: 1, minWidth: 100 },
  playerName: { color: colors.white, ...typography.bodyStrong },
  playerMeta: { color: colors.textSubtle, ...typography.caption, marginTop: 2 },
  statPill: { backgroundColor: colors.surfaceElevated, borderRadius: radii.pill, paddingHorizontal: spacing(1), paddingVertical: spacing(0.75) },
  statValue: { color: colors.white, ...typography.caption },
  mvpPill: { backgroundColor: colors.orange, borderRadius: radii.pill, paddingHorizontal: spacing(1), paddingVertical: spacing(0.75) },
  mvpText: { color: colors.white, ...typography.caption },
  saveButton: { minHeight: 56, backgroundColor: colors.orange, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center' },
  saveButtonDisabled: { opacity: 0.4 },
  saveText: { color: colors.white, ...typography.bodyStrong },
  safetyText: { color: colors.textSubtle, ...typography.caption, textAlign: 'center', marginTop: spacing(1) },
});
