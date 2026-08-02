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
import SegmentedControl from '../components/SegmentedControl';
import { api } from '../api/client';
import { colors, layout, radii, shadows, spacing, typography } from '../theme';
import { goBackOrFallback } from '../utils/navigation';

const TARGET_OPTIONS = [
  { value: 'city', label: 'Por ciudad' },
  { value: 'match', label: 'Por partido' },
];

function formatMatch(match) {
  const date = new Date(match.starts_at);
  const dateLabel = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `${match.title || `Partido #${match.id}`} · ${match.city || ''}${dateLabel ? ` · ${dateLabel}` : ''}`;
}

export default function AdminNotifyScreen({ route, navigation }) {
  const initialMatchId = route?.params?.matchId ? String(route.params.matchId) : '';
  const [targetType, setTargetType] = useState(initialMatchId ? 'match' : 'city');
  const [locations, setLocations] = useState([]);
  const [matches, setMatches] = useState([]);
  const [locationSlug, setLocationSlug] = useState('');
  const [matchId, setMatchId] = useState(initialMatchId);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/admin/notify/options')
      .then(({ data }) => {
        if (!active) return;
        const nextLocations = data?.data?.locations || [];
        const nextMatches = data?.data?.matches || [];
        setLocations(nextLocations);
        setMatches(nextMatches);
        if (!locationSlug && nextLocations[0]?.slug) setLocationSlug(String(nextLocations[0].slug));
      })
      .catch((requestError) => active && setError(requestError?.response?.data?.msg || 'No se pudieron cargar los destinatarios.'))
      .finally(() => active && setLoadingOptions(false));
    return () => { active = false; };
  }, []);

  const selectedLocation = useMemo(() => locations.find((location) => String(location.slug) === locationSlug), [locations, locationSlug]);
  const selectedMatch = useMemo(() => matches.find((match) => String(match.id) === matchId), [matches, matchId]);
  const targetName = targetType === 'city' ? selectedLocation?.name : selectedMatch?.title;
  const hasTarget = targetType === 'city' ? Boolean(locationSlug) : Boolean(matchId);
  const canSend = hasTarget && title.trim() && body.trim() && !loading;

  const send = () => {
    if (!canSend) {
      Alert.alert('Faltan datos', 'Selecciona los destinatarios y completa el título y el mensaje.');
      return;
    }

    const targetDescription = targetType === 'city'
      ? `todos los jugadores de ${selectedLocation?.name || locationSlug}`
      : `los jugadores inscritos en “${selectedMatch?.title || `Partido #${matchId}`}”`;

    Alert.alert(
      'Confirmar envío',
      `Vas a enviar esta notificación a ${targetDescription}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar ahora',
          onPress: async () => {
            setLoading(true);
            try {
              const endpoint = targetType === 'city'
                ? `/admin/notify/city/${encodeURIComponent(locationSlug)}`
                : `/admin/notify/match/${matchId}`;
              const { data } = await api.post(endpoint, { title: title.trim(), body: body.trim() });
              if (!data?.ok) throw new Error(data?.msg || 'No se pudo enviar');
              Alert.alert(
                'Notificación enviada',
                data.sent > 0
                  ? `Se ha enviado a ${data.sent} dispositivo${data.sent === 1 ? '' : 's'}.`
                  : 'No se encontraron dispositivos con notificaciones activas para este grupo.'
              );
              setTitle('');
              setBody('');
            } catch (requestError) {
              Alert.alert('No se pudo enviar', requestError?.response?.data?.msg || requestError.message || 'Inténtalo de nuevo.');
            } finally {
              setLoading(false);
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
        <LinearGradient colors={['#261307', '#11151B']} style={styles.hero}>
          <TouchableOpacity style={styles.backButton} onPress={() => goBackOrFallback(navigation)}>
            <Ionicons name="arrow-back" size={20} color={colors.white} />
            <Text style={styles.backText}>Volver</Text>
          </TouchableOpacity>
          <View style={styles.heroIcon}><Ionicons name="notifications" size={25} color={colors.orange} /></View>
          <Text style={styles.eyebrow}>CENTRO DE COMUNICACIONES</Text>
          <Text style={styles.title}>Enviar notificación</Text>
          <Text style={styles.description}>Comunica cambios y avisos importantes a los jugadores adecuados.</Text>
        </LinearGradient>

        <View style={styles.card}>
          <View style={styles.stepHeading}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
            <View style={styles.stepCopy}>
              <Text style={styles.cardTitle}>Destinatarios</Text>
              <Text style={styles.help}>Selecciona el grupo que recibirá el aviso.</Text>
            </View>
          </View>
          <SegmentedControl options={TARGET_OPTIONS} value={targetType} onChange={setTargetType} accessibilityLabel="Tipo de destinatarios" />

          {loadingOptions ? <ActivityIndicator color={colors.orange} /> : (
            <View style={styles.pickerWrap}>
              {targetType === 'city' ? (
                <Picker selectedValue={locationSlug} onValueChange={setLocationSlug} dropdownIconColor={colors.white} style={styles.picker}>
                  <Picker.Item label="Selecciona una ciudad" value="" />
                  {locations.map((location) => <Picker.Item key={location.id} label={location.name} value={String(location.slug)} />)}
                </Picker>
              ) : (
                <Picker selectedValue={matchId} onValueChange={setMatchId} dropdownIconColor={colors.white} style={styles.picker}>
                  <Picker.Item label="Selecciona un partido" value="" />
                  {matches.map((match) => <Picker.Item key={match.id} label={formatMatch(match)} value={String(match.id)} />)}
                </Picker>
              )}
            </View>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {hasTarget ? (
            <View style={styles.targetSummary}>
              <Ionicons name={targetType === 'city' ? 'location' : 'football'} size={18} color={colors.orange} />
              <View style={styles.targetCopy}>
                <Text style={styles.targetLabel}>{targetType === 'city' ? 'Todos los jugadores de' : 'Jugadores inscritos en'}</Text>
                <Text style={styles.targetValue}>{targetName || (targetType === 'match' ? `Partido #${matchId}` : locationSlug)}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.stepHeading}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
            <View style={styles.stepCopy}>
              <Text style={styles.cardTitle}>Mensaje</Text>
              <Text style={styles.help}>Sé breve y coloca lo más importante al principio.</Text>
            </View>
          </View>
          <Text style={styles.label}>Título</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            maxLength={65}
            placeholder="Ej. Cambio de campo"
            placeholderTextColor={colors.textSubtle}
          />
          <Text style={styles.counter}>{title.length}/65</Text>

          <Text style={styles.label}>Mensaje</Text>
          <TextInput
            style={[styles.input, styles.messageInput]}
            multiline
            value={body}
            onChangeText={setBody}
            maxLength={220}
            placeholder="Escribe aquí el aviso para los jugadores…"
            placeholderTextColor={colors.textSubtle}
            textAlignVertical="top"
          />
          <Text style={styles.counter}>{body.length}/220</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.stepHeading}>
            <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
            <View style={styles.stepCopy}>
              <Text style={styles.cardTitle}>Vista previa</Text>
              <Text style={styles.help}>Así aparecerá aproximadamente en el móvil.</Text>
            </View>
          </View>
          <View style={styles.notificationPreview}>
            <View style={styles.appIcon}><Ionicons name="football" size={22} color={colors.white} /></View>
            <View style={styles.previewCopy}>
              <View style={styles.previewTopline}><Text style={styles.appName}>EASYFUTBOL</Text><Text style={styles.now}>ahora</Text></View>
              <Text style={styles.previewTitle}>{title.trim() || 'Título de la notificación'}</Text>
              <Text style={styles.previewBody}>{body.trim() || 'El mensaje aparecerá aquí cuando empieces a escribirlo.'}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={[styles.sendButton, !canSend && styles.disabledButton]} onPress={send} disabled={!canSend}>
          {loading ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="send" size={20} color={colors.white} /><Text style={styles.sendText}>Enviar notificación</Text></>}
        </TouchableOpacity>
        <Text style={styles.safety}>Se solicitará confirmación antes del envío. Las notificaciones no se pueden retirar.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', padding: layout.screenPadding, paddingBottom: spacing(6) },
  hero: { borderRadius: radii.large, borderWidth: 1, borderColor: 'rgba(255,90,0,0.28)', padding: spacing(2), marginBottom: spacing(2), ...shadows.card },
  backButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing(0.75), alignSelf: 'flex-start' },
  backText: { color: colors.white, ...typography.bodyStrong },
  heroIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,90,0,0.14)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.35)', marginTop: spacing(1) },
  eyebrow: { color: colors.orange, ...typography.overline, marginTop: spacing(1.5) },
  title: { color: colors.white, ...typography.display, marginTop: spacing(0.75) },
  description: { color: colors.textMuted, ...typography.body, marginTop: spacing(0.75) },
  card: { backgroundColor: colors.surface, borderRadius: radii.large, borderWidth: 1, borderColor: colors.border, padding: spacing(2), marginBottom: spacing(2), ...shadows.card },
  stepHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), marginBottom: spacing(1.5) },
  stepNumber: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.orange },
  stepNumberText: { color: colors.white, fontWeight: '900' },
  stepCopy: { flex: 1 },
  cardTitle: { color: colors.white, ...typography.heading },
  help: { color: colors.textSubtle, ...typography.caption, marginTop: 2 },
  pickerWrap: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, overflow: 'hidden' },
  picker: { color: colors.white },
  targetSummary: { flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: 'rgba(255,90,0,0.08)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.24)', borderRadius: radii.medium, padding: spacing(1.25), marginTop: spacing(1.25) },
  targetCopy: { flex: 1 },
  targetLabel: { color: colors.textSubtle, ...typography.caption },
  targetValue: { color: colors.white, ...typography.bodyStrong, marginTop: 2 },
  error: { color: colors.danger, ...typography.caption, marginTop: spacing(1) },
  label: { color: colors.textMuted, ...typography.caption, marginBottom: spacing(0.75), marginTop: spacing(0.5) },
  input: { minHeight: 52, backgroundColor: '#090B0F', borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, color: colors.white, paddingHorizontal: spacing(1.5), ...typography.body },
  messageInput: { minHeight: 124, paddingTop: spacing(1.5) },
  counter: { color: colors.textSubtle, ...typography.caption, textAlign: 'right', marginTop: spacing(0.5), marginBottom: spacing(1) },
  notificationPreview: { flexDirection: 'row', gap: spacing(1.25), backgroundColor: '#22262D', borderRadius: radii.large, padding: spacing(1.5), borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' },
  appIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.orange },
  previewCopy: { flex: 1 },
  previewTopline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appName: { color: colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  now: { color: colors.textSubtle, fontSize: 11 },
  previewTitle: { color: colors.white, ...typography.bodyStrong, marginTop: 3 },
  previewBody: { color: colors.textMuted, ...typography.caption, marginTop: 2 },
  sendButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(1), backgroundColor: colors.orange, borderRadius: radii.medium },
  disabledButton: { opacity: 0.4 },
  sendText: { color: colors.white, ...typography.bodyStrong },
  safety: { color: colors.textSubtle, ...typography.caption, textAlign: 'center', marginTop: spacing(1) },
});
