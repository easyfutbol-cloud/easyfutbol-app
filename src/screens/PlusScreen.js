import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { colors, layout, radii, shadows, spacing, typography } from '../theme';
import { goBackOrFallback } from '../utils/navigation';

const BENEFITS = [
  { icon: 'ticket-outline', title: '1 EasyPass cada mes', text: 'Recíbelo automáticamente con cada renovación.' },
  { icon: 'pricetag-outline', title: '10% de descuento', text: 'Aplicado automáticamente al comprar packs de EasyPass.' },
  { icon: 'flash-outline', title: 'Prioridad en listas de espera', text: 'Tu solicitud Plus tendrá prioridad cuando se libere una plaza.' },
  { icon: 'trophy-outline', title: 'Torneos antes que nadie', text: 'Acceso anticipado a las inscripciones de próximos torneos.' },
  { icon: 'time-outline', title: 'Cancelación más flexible', text: 'Recupera tu EasyPass cancelando con más de 3 horas de antelación.' },
  { icon: 'star-outline', title: 'Identidad Plus', text: 'Tu nombre aparecerá en dorado dentro de EasyFutbol.' },
];

const formatRenewalDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function PlusScreen({ navigation }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/plus/status');
      setStatus(data?.data || null);
    } catch (error) {
      Alert.alert('EasyFutbol Plus', error?.response?.data?.msg || 'No se pudo consultar tu suscripción.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadStatus(); }, [loadStatus]));

  const openStripeFlow = async (path, urlKey) => {
    try {
      setProcessing(true);
      const { data } = await api.post(path);
      const url = data?.[urlKey];
      if (!url) throw new Error('Stripe no devolvió un enlace válido');
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('No se pudo continuar', error?.response?.data?.msg || error.message || 'Inténtalo de nuevo.');
    } finally {
      setProcessing(false);
    }
  };

  const renewalDate = formatRenewalDate(status?.current_period_end);

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#3D2D07', '#15130D', '#0A0C10']} style={styles.hero}>
          <TouchableOpacity style={styles.backButton} onPress={() => goBackOrFallback(navigation)} accessibilityRole="button">
            <Ionicons name="arrow-back" size={20} color={colors.white} />
            <Text style={styles.backText}>Volver</Text>
          </TouchableOpacity>
          <View style={styles.plusMark}><Ionicons name="star" size={28} color="#161109" /></View>
          <Text style={styles.eyebrow}>LA EXPERIENCIA PREMIUM</Text>
          <Text style={styles.title}>EasyFutbol <Text style={styles.goldText}>Plus</Text></Text>
          <Text style={styles.price}>9,99 €<Text style={styles.period}> / mes</Text></Text>
          <Text style={styles.subtitle}>Más ventajas para jugar más, ahorrar y vivir EasyFutbol antes que nadie.</Text>

          {loading ? (
            <ActivityIndicator color="#F4C95D" style={styles.loader} />
          ) : status?.is_plus ? (
            <View style={styles.activeCard}>
              <View style={styles.activePill}><View style={[styles.activeDot, status.plus_benefits_suspended && styles.suspendedDot]} /><Text style={styles.activePillText}>{status.plus_benefits_suspended ? 'VENTAJAS SUSPENDIDAS' : 'PLUS ACTIVO'}</Text></View>
              <Text style={styles.activeText}>
                {status.plus_benefits_suspended
                  ? 'Has alcanzado 3 avisos este mes. Hasta el próximo mes podrás jugar comprando EasyPass normales, sin ventajas Plus.'
                  : status.cancel_at_period_end
                  ? `Tus ventajas estarán activas hasta ${renewalDate || 'el final del periodo'}.`
                  : `Próxima renovación: ${renewalDate || 'según tu periodo de Stripe'}.`}
              </Text>
              <Text style={styles.warningCounter}>Avisos este mes: {Number(status.fair_play_warnings || 0)}/3</Text>
              <TouchableOpacity style={styles.manageButton} onPress={() => openStripeFlow('/plus/portal', 'portal_url')} disabled={processing}>
                <Text style={styles.manageButtonText}>{processing ? 'Abriendo Stripe…' : 'Gestionar suscripción'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.subscribeButton} onPress={() => openStripeFlow('/plus/checkout', 'checkout_url')} disabled={processing} accessibilityRole="button">
              <Text style={styles.subscribeButtonText}>{processing ? 'Abriendo Stripe…' : 'Hazte Plus'}</Text>
              {!processing ? <Ionicons name="arrow-forward" size={20} color="#161109" /> : null}
            </TouchableOpacity>
          )}
        </LinearGradient>

        <Text style={styles.sectionEyebrow}>TODO LO QUE INCLUYE</Text>
        <Text style={styles.sectionTitle}>Juega con ventaja</Text>
        <View style={styles.benefitsList}>
          {BENEFITS.map((benefit) => (
            <View key={benefit.title} style={styles.benefitCard}>
              <View style={styles.benefitIcon}><Ionicons name={benefit.icon} size={23} color="#F4C95D" /></View>
              <View style={styles.benefitCopy}>
                <Text style={styles.benefitTitle}>{benefit.title}</Text>
                <Text style={styles.benefitText}>{benefit.text}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            </View>
          ))}
        </View>

        <Text style={styles.terms}>Suscripción mensual con renovación automática. Puedes gestionarla o cancelarla en cualquier momento desde Stripe; las ventajas permanecen activas hasta el final del periodo pagado.</Text>
        <Text style={styles.terms}>Política de juego limpio: cancelar con 3 horas o menos o no asistir genera un aviso. Con 3 avisos, las ventajas Plus quedan suspendidas hasta el mes siguiente y las reservas deberán realizarse con EasyPass normales.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', padding: layout.screenPadding, paddingBottom: spacing(6) },
  hero: { borderRadius: radii.large, borderWidth: 1, borderColor: 'rgba(244,201,93,0.34)', padding: spacing(2), marginBottom: spacing(3), overflow: 'hidden', ...shadows.card },
  backButton: { minHeight: layout.minTouchTarget, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing(0.75) },
  backText: { color: colors.white, ...typography.bodyStrong },
  plusMark: { width: 56, height: 56, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4C95D', marginTop: spacing(1) },
  eyebrow: { color: '#F4C95D', ...typography.overline, marginTop: spacing(1.5) },
  title: { color: colors.white, ...typography.display, marginTop: spacing(0.5) },
  goldText: { color: '#F4C95D' },
  price: { color: '#F4C95D', fontSize: 29, lineHeight: 35, fontWeight: '900', marginTop: spacing(1) },
  period: { color: '#D7C995', fontSize: 15, fontWeight: '700' },
  subtitle: { color: colors.textMuted, ...typography.body, maxWidth: 560, marginTop: spacing(0.75) },
  loader: { marginVertical: spacing(2) },
  subscribeButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(0.75), backgroundColor: '#F4C95D', borderRadius: radii.medium, paddingHorizontal: spacing(2), marginTop: spacing(2) },
  subscribeButtonText: { color: '#161109', ...typography.bodyStrong, fontWeight: '900' },
  activeCard: { backgroundColor: 'rgba(244,201,93,0.10)', borderWidth: 1, borderColor: 'rgba(244,201,93,0.26)', borderRadius: radii.medium, padding: spacing(1.5), marginTop: spacing(2) },
  activePill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing(0.6) },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  suspendedDot: { backgroundColor:colors.danger },
  activePillText: { color: '#F4C95D', ...typography.overline },
  activeText: { color: colors.white, ...typography.body, marginTop: spacing(0.75) },
  warningCounter: { color:'#F4C95D', ...typography.caption, marginTop:spacing(0.75), fontWeight:'900' },
  manageButton: { minHeight: layout.minTouchTarget, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(244,201,93,0.38)', borderRadius: radii.medium, marginTop: spacing(1.25) },
  manageButtonText: { color: '#F4C95D', ...typography.bodyStrong },
  sectionEyebrow: { color: '#F4C95D', ...typography.overline },
  sectionTitle: { color: colors.white, ...typography.heading, marginTop: 3, marginBottom: spacing(1.5) },
  benefitsList: { gap: spacing(1) },
  benefitCard: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, padding: spacing(1.5) },
  benefitIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(244,201,93,0.10)' },
  benefitCopy: { flex: 1 },
  benefitTitle: { color: colors.white, ...typography.bodyStrong },
  benefitText: { color: colors.textMuted, ...typography.caption, marginTop: 3 },
  terms: { color: colors.textSubtle, ...typography.caption, textAlign: 'center', marginTop: spacing(2.5) },
});
