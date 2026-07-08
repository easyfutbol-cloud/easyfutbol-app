import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ORANGE = '#FF5A00';
const DARK = '#FFFFFF';
const MUTED = '#D1D5DB';
const LIGHT_BG = '#000000';
const CARD_BG = '#111827';
const WARNING_BG = '#1F1308';
const BORDER = '#263244';

const rulesPdfUrl = 'https://easyfutbol.es/wp-content/uploads/2026/07/Reglamento_Torneo_EasyFutbol_CORREGIDO.pdf';
export default function TournamentRulesScreen({ navigation }) {
  const openFullRules = async () => {
    if (!rulesPdfUrl) {
      return;
    }

    const canOpen = await Linking.canOpenURL(rulesPdfUrl);
    if (canOpen) {
      await Linking.openURL(rulesPdfUrl);
    }
  };

  const renderRule = (text) => (
    <View style={styles.ruleRow} key={text}>
      <View style={styles.bullet} />
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={DARK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reglamento</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="document-text-outline" size={30} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Reglamento del torneo</Text>
          <Text style={styles.subtitle}>
            Consulta las normas principales antes de inscribirte o disputar cualquier partido.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trophy-outline" size={21} color={ORANGE} />
            <Text style={styles.sectionTitle}>Formato del torneo</Text>
          </View>

          {[
            'El torneo estará formado por 8 equipos divididos en 2 grupos de 4 equipos.',
            'Los 2 mejores equipos de cada grupo pasarán a la fase final.',
            'Los 2 últimos equipos de cada grupo pasarán a la fase Redemption.',
            'Cada fase tendrá 2 semifinales y una final.',
            'Los partidos durarán 20 minutos, excepto la final, que tendrá 2 partes de 15 minutos.',
          ].map(renderRule)}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shirt-outline" size={21} color={ORANGE} />
            <Text style={styles.sectionTitle}>Equipación y material</Text>
          </View>

          {[
            'EasyFutbol entregará únicamente la camiseta de juego.',
            'Cada jugador deberá traer pantalón, medias, botas y el resto de material necesario.',
            'Las espinilleras son obligatorias. Ningún jugador podrá jugar sin ellas.',
            'No se permite jugar con relojes, cadenas, anillos, pulseras u objetos peligrosos.',
          ].map(renderRule)}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="people-outline" size={21} color={ORANGE} />
            <Text style={styles.sectionTitle}>Árbitro y comunicación</Text>
          </View>

          {[
            'Solo una persona delegada por equipo podrá hablar con el árbitro dentro del campo.',
            'Cualquier otro jugador que proteste o intente dirigirse al árbitro podrá ser amonestado.',
            'No se permitirán protestas colectivas, rodear al árbitro ni dirigirse a él de forma agresiva.',
          ].map(renderRule)}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="repeat-outline" size={21} color={ORANGE} />
            <Text style={styles.sectionTitle}>Sustituciones</Text>
          </View>

          {[
            'Las sustituciones serán ilimitadas.',
            'Todos los cambios deberán comunicarse al coordinador situado en la banda.',
            'El cambio se realizará cuando el juego esté parado y el coordinador lo autorice.',
            'El jugador suplente no podrá entrar hasta que el jugador sustituido haya salido.',
          ].map(renderRule)}
        </View>

        <View style={styles.warningCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="alert-circle-outline" size={22} color={ORANGE} />
            <Text style={styles.sectionTitle}>Sanciones importantes</Text>
          </View>

          {[
            'Cualquier amenaza supondrá 5 minutos fuera del campo y el equipo jugará con uno menos.',
            'Si una amenaza se repite, el jugador será expulsado directamente del torneo.',
            'La doble tarjeta amarilla expulsa al jugador del partido y el equipo jugará con uno menos durante 3 minutos.',
            'Cualquier comentario machista, xenófobo, racista, homófobo o discriminatorio supondrá expulsión directa del torneo.',
            'La organización podrá expulsar del torneo a cualquier jugador por conducta grave.',
          ].map(renderRule)}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="football-outline" size={21} color={ORANGE} />
            <Text style={styles.sectionTitle}>Empates</Text>
          </View>

          {[
            'En partidos eliminatorios, si hay empate, se decidirá mediante tanda de penaltis.',
            'La tanda inicial será de 3 penaltis por equipo.',
            'Si continúa el empate, se lanzará un penalti por equipo hasta que haya ganador.',
          ].map(renderRule)}
        </View>

        <View style={styles.acceptanceBox}>
          <Ionicons name="checkmark-circle" size={24} color={ORANGE} />
          <Text style={styles.acceptanceText}>
            La participación en el torneo implica la aceptación completa del reglamento y de las decisiones de árbitros y organización.
          </Text>
        </View>

        {rulesPdfUrl ? (
          <TouchableOpacity style={styles.pdfButton} onPress={openFullRules} activeOpacity={0.85}>
            <Ionicons name="open-outline" size={20} color="#FFFFFF" />
            <Text style={styles.pdfButtonText}>Ver reglamento completo en PDF</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: LIGHT_BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#111827',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: DARK,
  },
  headerSpacer: {
    width: 40,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  heroCard: {
    backgroundColor: CARD_BG,
    borderRadius: 22,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 14,
  },
  iconCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: DARK,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: MUTED,
    textAlign: 'center',
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 12,
  },
  warningCard: {
    backgroundColor: WARNING_BG,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#7C2D12',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: DARK,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 9,
  },
  bullet: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: ORANGE,
    marginTop: 7,
    marginRight: 10,
  },
  ruleText: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 21,
    color: '#F3F4F6',
  },
  acceptanceBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: CARD_BG,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginTop: 2,
    marginBottom: 14,
    gap: 10,
  },
  acceptanceText: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 21,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  pdfButton: {
    backgroundColor: ORANGE,
    borderRadius: 16,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pdfButtonText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },
});