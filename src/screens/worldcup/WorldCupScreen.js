

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '../../api/client';
import { WORLDCUP_TEAMS } from '../../data/worldcupTeams';

const BRAND_ORANGE = '#ff5a00';
const BG = '#050505';
const CARD = '#141414';
const BORDER = '#262626';
const MUTED = '#9ca3af';

function getTeamInfo(teamId) {
  return WORLDCUP_TEAMS.find((team) => team.id === teamId) || {
    id: teamId,
    name: teamId || 'Sin selección',
    flag: '🌍',
  };
}

export default function WorldCupScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myTeamId, setMyTeamId] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [playersRanking, setPlayersRanking] = useState([]);
  const [pointsRules, setPointsRules] = useState(null);

  const myTeamInfo = useMemo(() => getTeamInfo(myTeamId), [myTeamId]);

  const myTeamRanking = useMemo(
    () => ranking.find((item) => item.team === myTeamId),
    [ranking, myTeamId]
  );

  const loadWorldCup = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);

      const token = await AsyncStorage.getItem('token');

      const rankingRequest = api.get('/worldcup/ranking');
      const meRequest = token
        ? api.get('/worldcup/me', {
            headers: { Authorization: `Bearer ${token}` },
          })
        : Promise.resolve({ data: null });

      const [rankingResponse, meResponse] = await Promise.all([rankingRequest, meRequest]);

      setRanking(rankingResponse?.data?.teamsRanking || []);
      setPlayersRanking(rankingResponse?.data?.playersRanking || []);
      setPointsRules(rankingResponse?.data?.points || null);
      setMyTeamId(meResponse?.data?.worldcup_team || null);
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'No se pudo cargar el Mundial EasyFutbol';

      Alert.alert('Error', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadWorldCup();
    }, [loadWorldCup])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadWorldCup({ silent: true });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color={BRAND_ORANGE} size="large" />
          <Text style={styles.loadingText}>Cargando Mundial EasyFutbol...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={BRAND_ORANGE} />
        }
      >
        <View style={styles.hero}>
          <Text style={styles.kicker}>MUNDIAL EASYFUTBOL</Text>
          <Text style={styles.title}>Ranking de selecciones</Text>
          <Text style={styles.subtitle}>
            Los goles, asistencias, MVP y victorias de cada jugador suman para su país.
          </Text>
        </View>

        {myTeamId ? (
          <View style={styles.myTeamCard}>
            <Text style={styles.myTeamLabel}>Tu selección</Text>
            <View style={styles.myTeamHeader}>
              <Text style={styles.myTeamFlag}>{myTeamInfo.flag}</Text>
              <View style={styles.myTeamTextBox}>
                <Text style={styles.myTeamName}>{myTeamInfo.name}</Text>
                <Text style={styles.myTeamSubtitle}>
                  {myTeamRanking
                    ? `${Number(myTeamRanking.average_points || 0).toFixed(2)} pts de media · ${myTeamRanking.players} jugadores`
                    : 'Todavía no tiene puntos registrados en el Mundial'}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.chooseCard}>
            <Text style={styles.chooseTitle}>Todavía no tienes selección</Text>
            <Text style={styles.chooseText}>
              Elige el país que vas a representar durante el Mundial EasyFutbol.
            </Text>
            <TouchableOpacity
              style={styles.chooseButton}
              onPress={() => navigation.navigate('WorldCupSelectTeam')}
              activeOpacity={0.9}
            >
              <Text style={styles.chooseButtonText}>Elegir selección</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>Sistema de puntos</Text>
          <View style={styles.rulesGrid}>
            <Text style={styles.ruleItem}>⚽ Gol: +{pointsRules?.goal ?? 1}</Text>
            <Text style={styles.ruleItem}>🎯 Asistencia: +{pointsRules?.assist ?? 1}</Text>
            <Text style={styles.ruleItem}>🏆 MVP: +{pointsRules?.mvp ?? 3}</Text>
            <Text style={styles.ruleItem}>✅ Victoria: +{pointsRules?.win ?? 2}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Clasificación de países</Text>

        {ranking.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Aún no hay clasificación</Text>
            <Text style={styles.emptyText}>
              Cuando empiecen a registrarse estadísticas entre el 9 de junio y el 19 de julio,
              aparecerá aquí el ranking del Mundial.
            </Text>
          </View>
        ) : (
          ranking.map((item, index) => {
            const teamInfo = getTeamInfo(item.team);
            const isMine = item.team === myTeamId;

            return (
              <View key={item.team} style={[styles.rankingCard, isMine && styles.myRankingCard]}>
                <View style={styles.positionBox}>
                  <Text style={styles.positionText}>#{index + 1}</Text>
                </View>

                <Text style={styles.rankingFlag}>{teamInfo.flag}</Text>

                <View style={styles.rankingInfo}>
                  <Text style={styles.rankingTeamName}>
                    {teamInfo.name} {isMine ? '· Tu selección' : ''}
                  </Text>
                  <Text style={styles.rankingMeta}>
                    👥 {item.players} jugadores · ⚽ {item.goals} · 🎯 {item.assists} · ✅ {item.wins}
                  </Text>
                </View>

                <View style={styles.pointsBox}>
                  <Text style={styles.pointsMain}>
                    {Number(item.average_points || 0).toFixed(2)}
                  </Text>
                  <Text style={styles.pointsLabel}>media</Text>
                  <Text style={styles.totalPoints}>{item.total_points} total</Text>
                </View>
              </View>
            );
          })
        )}

        {playersRanking.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Top jugadores</Text>
            {playersRanking.slice(0, 10).map((player, index) => {
              const teamInfo = getTeamInfo(player.team);

              return (
                <View key={`${player.id}-${player.team}`} style={styles.playerCard}>
                  <Text style={styles.playerPosition}>#{index + 1}</Text>
                  <Text style={styles.playerFlag}>{teamInfo.flag}</Text>
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{player.name}</Text>
                    <Text style={styles.playerMeta}>
                      {teamInfo.name} · ⚽ {player.goals} · 🎯 {player.assists} · 🏆 {player.mvps} · ✅ {player.wins}
                    </Text>
                  </View>
                  <Text style={styles.playerPoints}>{player.points} pts</Text>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#fff',
    fontWeight: '800',
  },
  hero: {
    backgroundColor: CARD,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
  },
  kicker: {
    color: BRAND_ORANGE,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 31,
    fontWeight: '900',
    marginBottom: 10,
  },
  subtitle: {
    color: '#d1d5db',
    fontSize: 15,
    lineHeight: 22,
  },
  myTeamCard: {
    backgroundColor: 'rgba(255, 90, 0, 0.12)',
    borderColor: 'rgba(255, 90, 0, 0.55)',
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
  },
  myTeamLabel: {
    color: BRAND_ORANGE,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  myTeamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  myTeamFlag: {
    fontSize: 44,
    marginRight: 14,
  },
  myTeamTextBox: {
    flex: 1,
  },
  myTeamName: {
    color: '#fff',
    fontSize: 23,
    fontWeight: '900',
  },
  myTeamSubtitle: {
    color: '#f3f4f6',
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
  chooseCard: {
    backgroundColor: CARD,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
  },
  chooseTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  chooseText: {
    color: MUTED,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 16,
  },
  chooseButton: {
    backgroundColor: BRAND_ORANGE,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  chooseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  rulesCard: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 22,
  },
  rulesTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 12,
  },
  rulesGrid: {
    gap: 8,
  },
  ruleItem: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 21,
    fontWeight: '900',
    marginBottom: 12,
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 8,
  },
  emptyText: {
    color: MUTED,
    lineHeight: 21,
  },
  rankingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 18,
    padding: 13,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 10,
  },
  myRankingCard: {
    borderColor: BRAND_ORANGE,
    backgroundColor: 'rgba(255, 90, 0, 0.1)',
  },
  positionBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0b0b0b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  positionText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
  },
  rankingFlag: {
    fontSize: 30,
    marginRight: 10,
  },
  rankingInfo: {
    flex: 1,
  },
  rankingTeamName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  rankingMeta: {
    color: MUTED,
    fontSize: 12,
    marginTop: 4,
  },
  pointsBox: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  pointsMain: {
    color: BRAND_ORANGE,
    fontSize: 18,
    fontWeight: '900',
  },
  pointsLabel: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '800',
  },
  totalPoints: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 3,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 9,
  },
  playerPosition: {
    color: '#fff',
    width: 34,
    fontWeight: '900',
  },
  playerFlag: {
    fontSize: 25,
    marginRight: 10,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  playerMeta: {
    color: MUTED,
    marginTop: 3,
    fontSize: 12,
  },
  playerPoints: {
    color: BRAND_ORANGE,
    fontWeight: '900',
    fontSize: 14,
    marginLeft: 8,
  },
});