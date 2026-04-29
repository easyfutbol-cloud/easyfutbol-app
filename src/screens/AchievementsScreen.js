import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ORANGE = '#ff5a00';
const API_BASE_URL =
  (typeof process !== 'undefined' && process?.env?.EXPO_PUBLIC_API_URL) ||
  'https://api.easyfutbol.es';

const ACHIEVEMENT_CATALOG = [
  { code: 'DEBUTANTE', title: 'Debutante', description: 'Juega tu primer partido en EasyFutbol.', points: 15, target: 1 },
  { code: 'MATCHES_5', title: '5 partidos jugados', description: 'Completa 5 partidos.', points: 25, target: 5 },
  { code: 'MATCHES_10', title: '10 partidos jugados', description: 'Completa 10 partidos.', points: 40, target: 10 },
  { code: 'MATCHES_25', title: '25 partidos jugados', description: 'Completa 25 partidos.', points: 75, target: 25 },
  { code: 'MATCHES_50', title: '50 partidos jugados', description: 'Completa 50 partidos.', points: 150, target: 50 },
  { code: 'FIRST_GOAL', title: 'Primer gol', description: 'Marca tu primer gol.', points: 10, target: 1 },
  { code: 'GOALS_10', title: '10 goles', description: 'Marca 10 goles.', points: 30, target: 10 },
  { code: 'GOALS_25', title: '25 goles', description: 'Marca 25 goles.', points: 60, target: 25 },
  { code: 'GOALS_50', title: '50 goles', description: 'Marca 50 goles.', points: 120, target: 50 },
  { code: 'FIRST_ASSIST', title: 'Primera asistencia', description: 'Da tu primera asistencia.', points: 10, target: 1 },
  { code: 'ASSISTS_10', title: '10 asistencias', description: 'Da 10 asistencias.', points: 30, target: 10 },
  { code: 'ASSISTS_25', title: '25 asistencias', description: 'Da 25 asistencias.', points: 60, target: 25 },
  { code: 'ASSISTS_50', title: '50 asistencias', description: 'Da 50 asistencias.', points: 120, target: 50 },
  { code: 'DOUBLE', title: 'Doblete', description: 'Marca 2 goles en un partido.', points: 20, target: 2 },
  { code: 'HAT_TRICK', title: 'Hat-trick', description: 'Marca 3 goles en un partido.', points: 35, target: 3 },
  { code: 'ASSISTS_3_MATCH', title: '3 asistencias en un partido', description: 'Reparte 3 asistencias en un mismo partido.', points: 35, target: 3 },
  { code: 'COMPLETE_PLAYER', title: 'Jugador completo', description: 'Marca y asiste en el mismo partido.', points: 20, target: 1 },
  { code: 'MVP_5', title: '5 MVPs', description: 'Consigue 5 MVPs.', points: 60, target: 5 },
  { code: 'MVP_10', title: '10 MVPs', description: 'Consigue 10 MVPs.', points: 130, target: 10 },
];

async function getAuthToken() {
  const possibleKeys = ['token', 'authToken', 'userToken', 'jwt', 'accessToken'];

  for (const key of possibleKeys) {
    const value = await AsyncStorage.getItem(key);
    if (value) return value;
  }

  return null;
}

function AchievementCard({ item }) {
  const unlocked = item.unlocked;
  const progress = Math.min(item.progress || 0, item.target || 1);
  const target = item.target || 1;
  const progressPercent = Math.max(0, Math.min(progress / target, 1));

  return (
    <View style={[styles.achievementCard, !unlocked && styles.achievementCardLocked]}>
      <View style={[styles.medalWrap, !unlocked && styles.medalWrapLocked]}>
        <Text style={styles.medalIcon}>{unlocked ? '🏅' : '🥈'}</Text>
      </View>

      <View style={styles.achievementBody}>
        <View style={styles.achievementTopRow}>
          <Text style={[styles.achievementTitle, !unlocked && styles.achievementTitleLocked]}>
            {item.title}
          </Text>
          <View style={[styles.pointsPill, !unlocked && styles.pointsPillLocked]}>
            <Text style={[styles.pointsPillText, !unlocked && styles.pointsPillTextLocked]}>
              +{item.points}
            </Text>
          </View>
        </View>

        <Text style={[styles.achievementDescription, !unlocked && styles.achievementDescriptionLocked]}>
          {item.description}
        </Text>

        <Text style={[styles.achievementStatus, !unlocked && styles.achievementStatusLocked]}>
          {unlocked ? 'Desbloqueado' : 'Bloqueado'}
        </Text>

        <View style={styles.progressHeader}>
          <Text style={[styles.progressLabel, !unlocked && styles.progressLabelLocked]}>
            Progreso
          </Text>
          <Text style={[styles.progressValue, !unlocked && styles.progressValueLocked]}>
            {progress}/{target}
          </Text>
        </View>

        <View style={[styles.progressBarBg, !unlocked && styles.progressBarBgLocked]}>
          <View
            style={[
              styles.progressBarFill,
              !unlocked && styles.progressBarFillLocked,
              { width: `${progressPercent * 100}%` },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

export default function AchievementsScreen() {
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState(0);
  const [pointsToNextEasyPass, setPointsToNextEasyPass] = useState(500);
  const [achievements, setAchievements] = useState([]);
  const [specialAwards, setSpecialAwards] = useState([]);
  const [error, setError] = useState('');

  const loadAchievements = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const token = await getAuthToken();

      if (!token) {
        setAchievements([]);
        setSpecialAwards([]);
        setPoints(0);
        setPointsToNextEasyPass(500);
        setError('No se ha encontrado tu sesión.');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/achievements/me`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.msg || 'No se pudieron cargar los logros');
      }

      setPoints(Number(data?.points || 0));
      setPointsToNextEasyPass(Number(data?.points_to_next_easypass ?? 500));
      setAchievements(Array.isArray(data?.achievements) ? data.achievements : []);
      setSpecialAwards(Array.isArray(data?.specialAwards) ? data.specialAwards : []);
    } catch (err) {
      console.error('Error cargando logros:', err);
      setError(err?.message || 'Error cargando logros');
      setAchievements([]);
      setSpecialAwards([]);
      setPoints(0);
      setPointsToNextEasyPass(500);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAchievements();
    }, [loadAchievements])
  );

  const achievementsToRender = useMemo(() => {
    const byCode = new Map((achievements || []).map((item) => [item.code, item]));

    return ACHIEVEMENT_CATALOG.map((item) => {
      const apiItem = byCode.get(item.code);
      const progress = Number(apiItem?.progress || 0);
      const target = Number(apiItem?.target || item.target || 1);
      const unlocked = Boolean(apiItem?.unlocked) || progress >= target;

      return {
        ...item,
        unlocked,
        progress,
        target,
        points: Number(apiItem?.points || item.points || 0),
        description: apiItem?.description || item.description,
        title: apiItem?.title || item.title,
      };
    });
  }, [achievements]);

  const unlockedCount = achievementsToRender.filter((item) => item.unlocked).length;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>🏅 Mis logros</Text>
        <Text style={styles.subtitle}>
          Aquí verás todos los logros disponibles en EasyFutbol. Los que todavía no tengas
          desbloqueados aparecerán en gris.
        </Text>

        <View style={styles.pointsCard}>
          <Text style={styles.pointsLabel}>Puntos EasyFutbol</Text>
          {loading ? (
            <ActivityIndicator color={ORANGE} style={styles.loader} />
          ) : (
            <Text style={styles.pointsValue}>{points}</Text>
          )}
          <Text style={styles.pointsHint}>Cada 500 puntos podrás canjear 1 EasyPass.</Text>
          {!loading && (
            <Text style={styles.pointsSubHint}>
              Te faltan {pointsToNextEasyPass} puntos para el siguiente EasyPass.
            </Text>
          )}
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Progreso de logros</Text>
          {loading ? (
            <ActivityIndicator color={ORANGE} style={styles.loader} />
          ) : (
            <Text style={styles.summaryValue}>{unlockedCount} / {achievementsToRender.length}</Text>
          )}
          <Text style={styles.summaryHint}>Logros desbloqueados actualmente.</Text>
        </View>

        {!!error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Todos los logros</Text>
          {achievementsToRender.map((item) => (
            <AchievementCard key={item.code} item={item} />
          ))}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Premios especiales</Text>
          {!specialAwards.length ? (
            <Text style={styles.emptyText}>
              Todavía no tienes premios especiales desbloqueados.
            </Text>
          ) : (
            specialAwards.map((award, index) => (
              <View key={`${award.code}-${award.awarded_at || index}`} style={styles.awardCard}>
                <Text style={styles.awardTitle}>{award.name}</Text>
                <Text style={styles.awardMeta}>+{award.points} puntos</Text>
                {!!award.week_label && (
                  <Text style={styles.awardMeta}>Semana: {award.week_label}</Text>
                )}
                {!!award.month_label && (
                  <Text style={styles.awardMeta}>Mes: {award.month_label}</Text>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0d',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 8,
  },
  subtitle: {
    color: '#bdbdbd',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 18,
  },
  pointsCard: {
    backgroundColor: 'rgba(255,90,0,0.12)',
    borderColor: 'rgba(255,90,0,0.35)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
  },
  pointsLabel: {
    color: '#ffd7c2',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  pointsValue: {
    color: ORANGE,
    fontSize: 40,
    fontWeight: '900',
    marginBottom: 6,
  },
  pointsHint: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 20,
  },
  pointsSubHint: {
    color: '#ffd7c2',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  loader: {
    marginVertical: 12,
  },
  summaryCard: {
    backgroundColor: 'rgba(17,17,17,0.92)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 14,
  },
  summaryTitle: {
    color: '#bdbdbd',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  summaryValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 4,
  },
  summaryHint: {
    color: '#8f8f95',
    fontSize: 13,
  },
  errorCard: {
    backgroundColor: 'rgba(255,90,0,0.12)',
    borderColor: 'rgba(255,90,0,0.25)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  errorText: {
    color: '#ffd7c2',
    fontSize: 13,
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: 'rgba(17,17,17,0.92)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 12,
  },
  achievementCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,90,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,90,0,0.35)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  achievementCardLocked: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  medalWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,90,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  medalWrapLocked: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  medalIcon: {
    fontSize: 24,
  },
  achievementBody: {
    flex: 1,
  },
  achievementTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
  },
  achievementTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  achievementTitleLocked: {
    color: '#9a9aa1',
  },
  pointsPill: {
    backgroundColor: 'rgba(255,90,0,0.22)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pointsPillLocked: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pointsPillText: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: '900',
  },
  pointsPillTextLocked: {
    color: '#9a9aa1',
  },
  achievementDescription: {
    color: '#d2d2d7',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  achievementDescriptionLocked: {
    color: '#8a8a90',
  },
  achievementStatus: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: '900',
  },
  achievementStatusLocked: {
    color: '#7f7f86',
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 8,
  },
  progressLabel: {
    color: '#ffd7c2',
    fontSize: 12,
    fontWeight: '700',
  },
  progressLabelLocked: {
    color: '#8a8a90',
  },
  progressValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  progressValueLocked: {
    color: '#a0a0a6',
  },
  progressBarBg: {
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressBarBgLocked: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: ORANGE,
  },
  progressBarFillLocked: {
    backgroundColor: '#7f7f86',
  },
  awardCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  awardTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  awardMeta: {
    color: '#bdbdbd',
    fontSize: 13,
    lineHeight: 20,
  },
  emptyText: {
    color: '#bdbdbd',
    fontSize: 14,
    lineHeight: 22,
  },
});