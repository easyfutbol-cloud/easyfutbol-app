import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
} from 'react-native';

const colors = {
  background: '#000',
  card: '#111',
  border: '#222',
  text: '#fff',
  muted: '#b3b3b3',
  orange: '#ff5a00',
};

const FAQS = [
  {
    question: '¿Qué es EasyFutbol?',
    answer:
      'EasyFutbol es una app para apuntarte a partidos de fútbol organizados de forma rápida y sencilla. Entras, eliges tu partido y reservas tu plaza.',
  },
  {
    question: '¿Necesito registrarme para ver los partidos?',
    answer:
      'No. Puedes ver los partidos disponibles sin iniciar sesión. Solo necesitas registrarte o iniciar sesión cuando quieras apuntarte a uno.',
  },
  {
    question: '¿Cómo me apunto a un partido?',
    answer:
      'Entra en el partido que te interese y pulsa en reservar tu plaza. Si no has iniciado sesión, la app te pedirá que inicies sesión o te registres.',
  },
  {
    question: '¿Qué son los EasyPass?',
    answer:
      'Los EasyPass son los créditos de EasyFutbol. Se usan para reservar plazas en los partidos de una forma rápida dentro de la app.',
  },
  {
    question: '¿Los EasyPass caducan?',
    answer:
      'No, los EasyPass no caducan.',
  },
  {
    question: '¿Puedo sacar entradas para otras personas?',
    answer:
      'Sí. Puedes reservar varias plazas en un mismo partido. Además, las estadísticas de los asistentes cuentan para quienes realmente juegan.',
  },
  {
    question: '¿Cómo consigo EasyPass gratis?',
    answer:
      'Puedes conseguir EasyPass gratuitos con premios y reconocimientos como gol o parada de la semana, gol o parada del mes, o siendo número 1 del ranking.',
  },
  {
    question: '¿Qué pasa si un partido tiene aftergame?',
    answer:
      'Cuando un partido tiene aftergame, verás esa información en la pantalla del partido. Eso significa que hay ofertas o promociones especiales para los jugadores después del encuentro.',
  },
  {
    question: '¿Puedo cancelar mi plaza?',
    answer:
      'Dependerá de las condiciones del partido y del momento de la cancelación. EasyFutbol podrá indicar estas condiciones dentro de la app según evolucione el sistema.',
  },
  {
    question: '¿Dónde puedo ver mis partidos y mi saldo?',
    answer:
      'Dentro de la app podrás consultar tus reservas, tu saldo de EasyPass y el resto de información asociada a tu cuenta.',
  },
];

function FaqItem({ item, isOpen, onPress }) {
  return (
    <View style={styles.faqItem}>
      <TouchableOpacity style={styles.questionRow} onPress={onPress} activeOpacity={0.85}>
        <Text style={styles.question}>{item.question}</Text>
        <Text style={styles.icon}>{isOpen ? '−' : '+'}</Text>
      </TouchableOpacity>

      {isOpen && <Text style={styles.answer}>{item.answer}</Text>}
    </View>
  );
}

export default function FaqScreen() {
  const [openIndex, setOpenIndex] = useState(0);

  const toggleItem = (index) => {
    setOpenIndex((prev) => (prev === index ? -1 : index));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Preguntas frecuentes</Text>
        <Text style={styles.subtitle}>
          Aquí tienes respuestas rápidas a las dudas más comunes sobre EasyFutbol.
        </Text>

        {FAQS.map((item, index) => (
          <FaqItem
            key={`${item.question}-${index}`}
            item={item}
            isOpen={openIndex === index}
            onPress={() => toggleItem(index)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  faqItem: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  question: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    paddingRight: 12,
  },
  icon: {
    color: colors.orange,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 24,
  },
  answer: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 14,
  },
});