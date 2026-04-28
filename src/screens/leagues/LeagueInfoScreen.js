import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

function InfoBlock({ title, text }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      <Text style={styles.blockText}>{text}</Text>
    </View>
  );
}

export default function LeagueInfoScreen() {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#050200', '#140700', '#050200']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backgroundGradient}
      />
      <View style={styles.orangeGlowTop} />
      <View style={styles.orangeGlowBottom} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Funcionamiento</Text>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Así funciona la liga</Text>
          <Text style={styles.heroText}>
            Una competición organizada, grabada y estandarizada para que cada equipo
            viva una experiencia completa dentro de EasyFutbol, con calendario,
            estadísticas, vídeos, clasificación y fase final.
          </Text>
        </View>

        <InfoBlock
          title="Formato"
          text="La liga estará formada por 8 equipos. Durante la fase regular se disputarán 7 jornadas, en las que todos los equipos se enfrentarán una vez entre sí."
        />

        <InfoBlock
          title="Calendario"
          text="Los partidos se jugarán los sábados y domingos en dos franjas horarias: de 20:00 a 21:00 y de 21:00 a 22:00. Cada equipo podrá consultar en la app sus horarios, rivales y resultados."
        />

        <InfoBlock
          title="Clasificación y Final Four"
          text="La clasificación se actualizará jornada a jornada. Al finalizar la fase regular, los 4 primeros equipos disputarán una Final Four para decidir al campeón de la liga."
        />

        <InfoBlock
          title="Estadísticas"
          text="La competición contará con seguimiento estadístico para dar valor al rendimiento individual y colectivo. Los jugadores podrán consultar datos como goles, asistencias, MVPs y otros registros importantes dentro de la liga."
        />

        <InfoBlock
          title="Vídeos y grabaciones"
          text="Todos los partidos serán grabados y subidos a YouTube. Además, si algún equipo quiere disponer de la grabación de uno de sus partidos, podrá solicitarla."
        />

        <InfoBlock
          title="Arbitraje y reglamento"
          text="Todos los encuentros estarán arbitrados y se jugarán bajo el reglamento oficial establecido por la liga, con el objetivo de ofrecer una competición seria, ordenada y homogénea."
        />

        <InfoBlock
          title="Premios"
          text="Los premios se definirán antes del inicio de cada liga y quedarán detallados en el dosier individual de esa competición."
        />

        <InfoBlock
          title="Formato estandarizado"
          text="La liga seguirá una estructura común en todas las ciudades en las que se organice bajo EasyFutbol, manteniendo la misma esencia competitiva, audiovisual y organizativa."
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050200',
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  orangeGlowTop: {
    position: 'absolute',
    top: -80,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,90,0,0.16)',
  },
  orangeGlowBottom: {
    position: 'absolute',
    bottom: 80,
    left: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,120,0,0.10)',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
    textShadowColor: 'rgba(255,90,0,0.18)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,90,0,0.16)',
    marginBottom: 18,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
  },
  heroText: {
    color: '#d0d0d0',
    fontSize: 14,
    lineHeight: 22,
  },
  block: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1f1f1f',
  },
  blockTitle: {
    color: '#ff5a00',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 8,
  },
  blockText: {
    color: '#ddd',
    fontSize: 14,
    lineHeight: 22,
  },
});