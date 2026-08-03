import { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, layout, radii, shadows, spacing, typography } from '../theme';
import { goBackOrFallback } from '../utils/navigation';

const WHATSAPP_SUPPORT_URL = `https://wa.me/34640294177?text=${encodeURIComponent('Hola EasyFutbol, necesito ayuda.')}`;
const WHATSAPP_VALLADOLID_URL = 'https://chat.whatsapp.com/IdRGx2RDihu1ghbLWv44J5?s=cl&p=i&ilr=0&amv=2';
const WHATSAPP_ASTURIAS_URL = 'https://chat.whatsapp.com/ElR7I1uBofT5jKUO4Jhbs6?s=cl&p=i&ilr=0&amv=2';

const CATEGORIES = [
  { key: 'Todos', label: 'Todo', icon: 'apps-outline' },
  { key: 'Cuenta', label: 'Cuenta', icon: 'person-outline' },
  { key: 'Partidos', label: 'Partidos', icon: 'football-outline' },
  { key: 'Cancelaciones', label: 'Cancelar', icon: 'close-circle-outline' },
  { key: 'EasyPass', label: 'EasyPass', icon: 'card-outline' },
  { key: 'Estadísticas', label: 'Estadísticas', icon: 'stats-chart-outline' },
  { key: 'Vídeos', label: 'Vídeos', icon: 'videocam-outline' },
  { key: 'Normas', label: 'Normas', icon: 'shield-checkmark-outline' },
  { key: 'Aplicación', label: 'App', icon: 'phone-portrait-outline' },
];

const FAQS = [
  { category: 'Cuenta', question: '¿Cómo me registro?', answer: 'Descarga la app, crea una cuenta y completa tu perfil para poder apuntarte a los partidos.' },
  { category: 'Cuenta', question: '¿Puedo cambiar mi nombre o foto de perfil?', answer: 'Sí, puedes modificar tu información desde tu perfil.' },
  { category: 'Cuenta', question: 'He olvidado mi contraseña, ¿qué hago?', answer: 'Pulsa en “¿Has olvidado tu contraseña?” en la pantalla de inicio de sesión y sigue los pasos para recuperarla.' },
  { category: 'Partidos', question: '¿Cómo me apunto a un partido?', answer: 'Desde Próximos partidos selecciona el encuentro que quieras jugar, elige tus entradas y pulsa “Reservar con EasyPass”.' },
  { category: 'Partidos', question: '¿Puedo apuntarme con un amigo?', answer: 'Sí, puedes reservar más de una entrada siempre que haya plazas disponibles.' },
  { category: 'Partidos', question: '¿Cómo se forman los equipos?', answer: 'Los equipos se crean intentando que estén lo más equilibrados posible según el nivel de todos los jugadores.' },
  { category: 'Partidos', question: '¿Cuánto duran los partidos?', answer: 'Los partidos tienen una duración aproximada de 60 minutos, salvo que la ficha del encuentro indique otra duración.' },
  { category: 'Partidos', question: '¿Con cuánta antelación debo llegar?', answer: 'Se recomienda llegar 5 minutos antes del inicio para que el partido pueda comenzar puntualmente.' },
  { category: 'Partidos', question: '¿Qué debo llevar?', answer: 'Solo necesitas ropa deportiva y botas de fútbol. Si el partido requiere algún material adicional, se indicará previamente.' },
  { category: 'Partidos', question: '¿Tengo que llevar balón o peto?', answer: 'No. EasyFutbol proporciona todo el material necesario para disputar el partido.' },
  { category: 'Partidos', question: '¿Dónde puedo ver el campo donde se juega?', answer: 'En la ficha de cada partido encontrarás el campo, la ubicación y toda la información necesaria.' },
  { category: 'Cancelaciones', question: '¿Hasta cuándo puedo cancelar un partido?', answer: 'Puedes cancelar con devolución del EasyPass hasta más de 8 horas antes del inicio. Con 8 horas o menos puedes cancelar y liberar la plaza, pero no se devuelve el EasyPass.' },
  { category: 'Cancelaciones', question: '¿Qué ocurre si no me presento?', answer: 'No presentarse sin cancelar previamente puede conllevar penalizaciones o restricciones para futuras reservas.' },
  { category: 'Cancelaciones', question: '¿Qué pasa si el partido se cancela?', answer: 'Si el partido es cancelado por la organización, recuperarás automáticamente el EasyPass utilizado para la reserva.' },
  { category: 'EasyPass', question: '¿Qué es un EasyPass?', answer: 'Es el saldo que utilizas para reservar tu plaza en los partidos.' },
  { category: 'EasyPass', question: '¿Cómo puedo comprar EasyPass?', answer: 'Puedes adquirirlos directamente desde la pantalla EasyPass de la aplicación.' },
  { category: 'EasyPass', question: '¿Caducan los EasyPass?', answer: 'No, los EasyPass no tienen fecha de caducidad.' },
  { category: 'EasyPass', question: '¿Recupero el EasyPass si cancelo?', answer: 'Sí, siempre que canceles con más de 8 horas de antelación. Con 8 horas o menos la plaza se cancela sin devolución.' },
  { category: 'Estadísticas', question: '¿Cuándo se actualizan las estadísticas?', answer: 'Las estadísticas de cada partido se publicarán antes de las 19:00 del día siguiente.' },
  { category: 'Estadísticas', question: '¿Cómo se registran los goles y asistencias?', answer: 'Al finalizar el partido, la organización introduce las estadísticas para que aparezcan en la app.' },
  { category: 'Estadísticas', question: '¿Qué hago si hay un error en mis estadísticas?', answer: 'Ponte en contacto con la organización indicando el partido para que podamos revisarlo y corregirlo si es necesario.' },
  { category: 'Estadísticas', question: '¿Cómo se elige el MVP?', answer: 'El MVP es elegido por la organización en función del rendimiento mostrado durante el partido.' },
  { category: 'Estadísticas', question: '¿Cómo funciona el ranking?', answer: 'El ranking se actualiza automáticamente con los resultados, goles, asistencias, MVP y demás estadísticas registradas.' },
  { category: 'Vídeos', question: '¿Todos los partidos se graban?', answer: 'Siempre que sea posible, los partidos serán grabados.' },
  { category: 'Vídeos', question: '¿Cuándo estarán disponibles los vídeos?', answer: 'Los vídeos se subirán a YouTube antes de las 19:00 del día siguiente al partido.' },
  { category: 'Vídeos', question: '¿Dónde puedo ver los vídeos?', answer: 'Podrás acceder a ellos desde la aplicación o a través del canal de YouTube de EasyFutbol.' },
  { category: 'Normas', question: '¿Qué ocurre si tengo un mal comportamiento?', answer: 'Los comportamientos inadecuados pueden suponer advertencias, suspensiones o la expulsión de EasyFutbol.' },
  { category: 'Normas', question: '¿Qué pasa si insulto o falto al respeto a otros jugadores?', answer: 'No se toleran las faltas de respeto. Cualquier comportamiento antideportivo podrá ser sancionado por la organización.' },
  { category: 'Normas', question: '¿Qué hago si me lesiono durante un partido?', answer: 'Avisa inmediatamente al organizador para que pueda ayudarte y actuar de la forma más adecuada.' },
  { category: 'Aplicación', question: 'No puedo iniciar sesión.', answer: 'Comprueba que el correo y la contraseña sean correctos. Si el problema continúa, utiliza la recuperación de contraseña.' },
  { category: 'Aplicación', question: 'No aparecen los partidos o las estadísticas.', answer: 'Comprueba tu conexión a Internet, actualiza la información y asegúrate de utilizar la última versión de la aplicación.' },
  { category: 'Aplicación', question: '¿Cómo puedo contactar con EasyFutbol?', answer: 'Puedes escribir al soporte por WhatsApp en el +34 640 29 41 77, entrar en el grupo de Valladolid o Asturias, o contactar mediante las redes sociales oficiales.' },
];

function FaqItem({ item, isOpen, onPress }) {
  return (
    <View style={[styles.faqItem, isOpen && styles.faqItemOpen]}>
      <TouchableOpacity
        style={styles.questionRow}
        onPress={onPress}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={item.question}
      >
        <View style={styles.questionCopy}>
          <Text style={styles.category}>{item.category}</Text>
          <Text style={styles.question}>{item.question}</Text>
        </View>
        <View style={[styles.expandButton, isOpen && styles.expandButtonOpen]}>
          <Ionicons name={isOpen ? 'remove' : 'add'} size={20} color={isOpen ? colors.black : colors.orange} />
        </View>
      </TouchableOpacity>
      {isOpen ? <View style={styles.answerWrap}><Text style={styles.answer}>{item.answer}</Text></View> : null}
    </View>
  );
}

export default function FaqScreen({ navigation }) {
  const [openQuestion, setOpenQuestion] = useState(FAQS[0].question);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');

  const visibleFaqs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    return FAQS.filter((item) => {
      const matchesCategory = selectedCategory === 'Todos' || item.category === selectedCategory;
      const matchesSearch = !query || `${item.question} ${item.answer} ${item.category}`.toLocaleLowerCase('es').includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [search, selectedCategory]);

  const openWhatsApp = async (url) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('No se pudo abrir WhatsApp', 'Puedes escribirnos al +34 640 29 41 77.');
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <LinearGradient colors={['#261307', '#11151B']} style={styles.hero}>
          <TouchableOpacity style={styles.backButton} onPress={() => goBackOrFallback(navigation)} accessibilityRole="button">
            <Ionicons name="arrow-back" size={20} color={colors.white} />
            <Text style={styles.backText}>Volver</Text>
          </TouchableOpacity>
          <View style={styles.heroIcon}><Ionicons name="help-circle" size={27} color={colors.orange} /></View>
          <Text style={styles.eyebrow}>CENTRO DE AYUDA</Text>
          <Text style={styles.title}>Preguntas frecuentes</Text>
          <Text style={styles.subtitle}>Encuentra respuestas rápidas sobre partidos, reservas, EasyPass y estadísticas.</Text>
        </LinearGradient>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={20} color={colors.textSubtle} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            placeholder="Buscar una pregunta…"
            placeholderTextColor={colors.textSubtle}
            returnKeyType="search"
            accessibilityLabel="Buscar en preguntas frecuentes"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Borrar búsqueda">
              <Ionicons name="close-circle" size={20} color={colors.textSubtle} />
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={styles.categoryHeading}>¿En qué podemos ayudarte?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
          {CATEGORIES.map((category) => {
            const active = selectedCategory === category.key;
            return (
              <TouchableOpacity key={category.key} style={[styles.categoryCard, active && styles.categoryCardActive]} onPress={() => setSelectedCategory(category.key)} accessibilityRole="button" accessibilityState={{ selected: active }}>
                <Ionicons name={category.icon} size={20} color={active ? colors.black : colors.orange} />
                <Text style={[styles.categoryCardText, active && styles.categoryCardTextActive]}>{category.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.resultsHeader}>
          <View><Text style={styles.resultsEyebrow}>AYUDA EASYFUTBOL</Text><Text style={styles.resultsTitle}>{search ? `${visibleFaqs.length} resultados` : 'Todo lo que necesitas saber'}</Text></View>
          <View style={styles.countBadge}><Text style={styles.countText}>{visibleFaqs.length}</Text></View>
        </View>

        {visibleFaqs.length ? visibleFaqs.map((item) => (
          <FaqItem
            key={item.question}
            item={item}
            isOpen={openQuestion === item.question}
            onPress={() => setOpenQuestion((current) => current === item.question ? '' : item.question)}
          />
        )) : (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={32} color={colors.orange} />
            <Text style={styles.emptyTitle}>No encontramos esa pregunta</Text>
            <Text style={styles.emptyText}>Prueba con palabras como EasyPass, cancelar, camiseta o estadísticas.</Text>
          </View>
        )}

        <LinearGradient colors={['#1D4C35', '#123125']} style={styles.contactCard}>
          <View style={styles.whatsappIcon}><Ionicons name="logo-whatsapp" size={27} color={colors.white} /></View>
          <Text style={styles.contactTitle}>¿No has encontrado tu respuesta?</Text>
          <Text style={styles.contactText}>Escríbenos directamente o entra en el grupo de tu sede.</Text>
          <TouchableOpacity style={styles.contactButton} onPress={() => openWhatsApp(WHATSAPP_SUPPORT_URL)} accessibilityRole="link">
            <Ionicons name="logo-whatsapp" size={20} color="#123125" />
            <Text style={styles.contactButtonText}>Escribir a soporte</Text>
          </TouchableOpacity>
          <Text style={styles.supportPhone}>+34 640 29 41 77</Text>
          <View style={styles.groupActions}>
            <TouchableOpacity style={styles.groupButton} onPress={() => openWhatsApp(WHATSAPP_VALLADOLID_URL)} accessibilityRole="link">
              <Ionicons name="location-outline" size={18} color={colors.white} />
              <Text style={styles.groupButtonText}>Grupo Valladolid</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.groupButton} onPress={() => openWhatsApp(WHATSAPP_ASTURIAS_URL)} accessibilityRole="link">
              <Ionicons name="location-outline" size={18} color={colors.white} />
              <Text style={styles.groupButtonText}>Grupo Asturias</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', padding: layout.screenPadding, paddingBottom: spacing(6) },
  hero: { borderRadius: radii.large, borderWidth: 1, borderColor: 'rgba(255,90,0,0.28)', padding: spacing(2), marginBottom: spacing(2), ...shadows.card },
  backButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing(0.75), alignSelf: 'flex-start' },
  backText: { color: colors.white, ...typography.bodyStrong },
  heroIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: 'rgba(255,90,0,0.14)', borderWidth: 1, borderColor: 'rgba(255,90,0,0.35)', alignItems: 'center', justifyContent: 'center', marginTop: spacing(1) },
  eyebrow: { color: colors.orange, ...typography.overline, marginTop: spacing(1.5) },
  title: { color: colors.white, ...typography.display, marginTop: spacing(0.75) },
  subtitle: { color: colors.textMuted, ...typography.body, marginTop: spacing(0.75), maxWidth: 600 },
  searchWrap: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing(1), backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, paddingHorizontal: spacing(1.5), marginBottom: spacing(2) },
  searchInput: { flex: 1, color: colors.white, ...typography.body, paddingVertical: spacing(1) },
  categoryHeading: { color: colors.white, ...typography.heading, marginBottom: spacing(1) },
  categoryList: { gap: spacing(1), paddingBottom: spacing(2) },
  categoryCard: { minWidth: 96, height: 74, alignItems: 'center', justifyContent: 'center', gap: spacing(0.6), backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, paddingHorizontal: spacing(1) },
  categoryCardActive: { backgroundColor: colors.orange, borderColor: colors.orange },
  categoryCardText: { color: colors.textMuted, ...typography.caption },
  categoryCardTextActive: { color: colors.black, fontWeight: '900' },
  resultsHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: spacing(1.25) },
  resultsEyebrow: { color: colors.orange, ...typography.overline },
  resultsTitle: { color: colors.white, ...typography.heading, marginTop: 3 },
  countBadge: { minWidth: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,90,0,0.12)' },
  countText: { color: colors.orange, fontWeight: '900' },
  faqItem: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.medium, padding: spacing(1.5), marginBottom: spacing(1) },
  faqItemOpen: { borderColor: 'rgba(255,90,0,0.38)', backgroundColor: '#13171D' },
  questionRow: { minHeight: layout.minTouchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing(1) },
  questionCopy: { flex: 1 },
  category: { color: colors.orange, ...typography.overline, fontSize: 9, marginBottom: 4 },
  question: { color: colors.white, ...typography.bodyStrong },
  expandButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,90,0,0.10)' },
  expandButtonOpen: { backgroundColor: colors.orange },
  answerWrap: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing(1.25), paddingTop: spacing(1.25) },
  answer: { color: colors.textMuted, ...typography.body },
  emptyState: { alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.large, padding: spacing(4) },
  emptyTitle: { color: colors.white, ...typography.heading, marginTop: spacing(1.25), textAlign: 'center' },
  emptyText: { color: colors.textMuted, ...typography.body, marginTop: spacing(0.75), textAlign: 'center' },
  contactCard: { alignItems: 'center', borderRadius: radii.large, borderWidth: 1, borderColor: 'rgba(57,217,138,0.35)', padding: spacing(2.5), marginTop: spacing(2), ...shadows.card },
  whatsappIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#25D366' },
  contactTitle: { color: colors.white, ...typography.heading, textAlign: 'center', marginTop: spacing(1.25) },
  contactText: { color: '#C7DFD2', ...typography.body, textAlign: 'center', marginTop: spacing(0.75), maxWidth: 480 },
  contactButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(0.75), alignSelf: 'stretch', backgroundColor: '#FFFFFF', borderRadius: radii.medium, marginTop: spacing(2), paddingHorizontal: spacing(1.5) },
  contactButtonText: { color: '#123125', ...typography.bodyStrong },
  supportPhone: { color: '#C7DFD2', ...typography.caption, marginTop: spacing(0.75) },
  groupActions: { alignSelf: 'stretch', gap: spacing(1), marginTop: spacing(1.5) },
  groupButton: { minHeight: layout.minTouchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing(0.75), borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)', borderRadius: radii.medium, paddingHorizontal: spacing(1.5) },
  groupButtonText: { color: colors.white, ...typography.bodyStrong },
});
