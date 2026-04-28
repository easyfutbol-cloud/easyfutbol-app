import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ImageBackground,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

const BG = {
  leagues: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2025/01/Imagen-eventos_1.avif',
  },
  format: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2024/10/siluetas-futbol-7.jpeg',
  },
  searchTeam: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2025/02/grass-2616911_1280.jpg',
  },
  invite: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2025/01/Imagen-eventos_1.avif',
  },
  calendar: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2025/01/Imagen-eventos_1.avif',
  },
  team: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2024/10/siluetas-futbol-7.jpeg',
  },
  videos: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2025/02/grass-2616911_1280.jpg',
  },
  stats: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2024/10/siluetas-futbol-7.jpeg',
  },
  standings: {
    uri: 'https://easyfutbol.es/wp-content/uploads/2025/01/Imagen-eventos_1.avif',
  },
};

export default function LeaguesHomeScreen({ navigation }) {
  // De momento mockeado
  const [hasTeam] = useState(false);

  const teamData = {
    teamName: 'Los Galácticos',
    leagueName: 'Liga EasyFutbol Valladolid',
    position: 3,
    nextMatch: 'Domingo 20:00 vs Titanes',
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#050200', '#120600', '#050200']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.backgroundGradient}
      />
      <View style={styles.orangeGlowTop} />
      <View style={styles.orangeGlowBottom} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Ligas</Text>

        {!hasTeam ? (
          <View style={styles.grid}>
            <MenuCard
              title="Ligas disponibles"
              bgSource={BG.leagues}
              onPress={() => navigation.navigate('LeagueStandings')}
            />
            <MenuCard
              title="Funcionamiento"
              bgSource={BG.format}
              onPress={() => navigation.navigate('LeagueInfo')}
            />
            <MenuCard
              title="Buscar equipo"
              bgSource={BG.searchTeam}
              onPress={() => navigation.navigate('JoinLeague')}
            />
            <MenuCard
              title="Mi invitación"
              bgSource={BG.invite}
              onPress={() => navigation.navigate('JoinLeague')}
            />
          </View>
        ) : (
          <>
            <View style={styles.teamCard}>
              <Text style={styles.teamLeague}>{teamData.leagueName}</Text>
              <Text style={styles.teamName}>{teamData.teamName}</Text>
              <Text style={styles.teamInfo}>Posición actual: {teamData.position}º</Text>
              <Text style={styles.teamInfo}>Próximo partido: {teamData.nextMatch}</Text>
            </View>

            <View style={styles.grid}>
              <MenuCard
                title="Calendario"
                bgSource={BG.calendar}
                onPress={() => navigation.navigate('LeagueCalendar')}
              />
              <MenuCard
                title="Mi equipo"
                bgSource={BG.team}
                onPress={() => navigation.navigate('MyTeam')}
              />
              <MenuCard
                title="Vídeos"
                bgSource={BG.videos}
                onPress={() => navigation.navigate('LeagueVideos')}
              />
              <MenuCard
                title="Estadísticas"
                bgSource={BG.stats}
                onPress={() => navigation.navigate('LeagueStats')}
              />
              <MenuCard
                title="Mi competición"
                bgSource={BG.standings}
                onPress={() => navigation.navigate('LeagueStandings')}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function MenuCard({ title, bgSource, onPress }) {
  return (
    <TouchableOpacity style={styles.menuCard} onPress={onPress} activeOpacity={0.9}>
      <ImageBackground source={bgSource} style={styles.menuCardBg} imageStyle={styles.menuCardImage}>
        <BlurView intensity={35} tint="dark" style={styles.menuCardOverlay}>
          <View style={styles.menuCardTint} />
          <Text style={styles.menuCardTitle}>{title}</Text>
        </BlurView>
      </ImageBackground>
    </TouchableOpacity>
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
  teamCard: {
    backgroundColor: '#111',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#222',
  },
  teamLeague: {
    color: '#ff5a00',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  teamName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 10,
  },
  teamInfo: {
    color: '#bbb',
    fontSize: 14,
    marginBottom: 6,
  },
  grid: {
    gap: 14,
  },
  menuCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#222',
  },
  menuCardBg: {
    height: 130,
    justifyContent: 'flex-end',
  },
  menuCardImage: {
    borderRadius: 20,
  },
  menuCardOverlay: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    justifyContent: 'flex-end',
    height: '100%',
    overflow: 'hidden',
  },
  menuCardTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  menuCardTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
});