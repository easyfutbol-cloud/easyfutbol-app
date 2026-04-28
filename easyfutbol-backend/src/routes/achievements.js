import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

const SEASON_START = '2026-05-01 00:00:00';

const ACHIEVEMENT_CATALOG = [
  { code: 'DEBUTANTE', title: 'Debutante', description: 'Juega tu primer partido en EasyFutbol.', points: 15, type: 'matches', target: 1 },
  { code: 'MATCHES_5', title: '5 partidos jugados', description: 'Completa 5 partidos.', points: 25, type: 'matches', target: 5 },
  { code: 'MATCHES_10', title: '10 partidos jugados', description: 'Completa 10 partidos.', points: 40, type: 'matches', target: 10 },
  { code: 'MATCHES_25', title: '25 partidos jugados', description: 'Completa 25 partidos.', points: 75, type: 'matches', target: 25 },
  { code: 'MATCHES_50', title: '50 partidos jugados', description: 'Completa 50 partidos.', points: 150, type: 'matches', target: 50 },

  { code: 'FIRST_GOAL', title: 'Primer gol', description: 'Marca tu primer gol.', points: 10, type: 'goals', target: 1 },
  { code: 'GOALS_10', title: '10 goles', description: 'Marca 10 goles.', points: 30, type: 'goals', target: 10 },
  { code: 'GOALS_25', title: '25 goles', description: 'Marca 25 goles.', points: 60, type: 'goals', target: 25 },
  { code: 'GOALS_50', title: '50 goles', description: 'Marca 50 goles.', points: 120, type: 'goals', target: 50 },

  { code: 'FIRST_ASSIST', title: 'Primera asistencia', description: 'Da tu primera asistencia.', points: 10, type: 'assists', target: 1 },
  { code: 'ASSISTS_10', title: '10 asistencias', description: 'Da 10 asistencias.', points: 30, type: 'assists', target: 10 },
  { code: 'ASSISTS_25', title: '25 asistencias', description: 'Da 25 asistencias.', points: 60, type: 'assists', target: 25 },
  { code: 'ASSISTS_50', title: '50 asistencias', description: 'Da 50 asistencias.', points: 120, type: 'assists', target: 50 },

  { code: 'DOUBLE', title: 'Doblete', description: 'Marca 2 goles en un partido.', points: 20, type: 'best_goals_in_match', target: 2 },
  { code: 'HAT_TRICK', title: 'Hat-trick', description: 'Marca 3 goles en un partido.', points: 35, type: 'best_goals_in_match', target: 3 },
  { code: 'ASSISTS_3_MATCH', title: '3 asistencias en un partido', description: 'Reparte 3 asistencias en un mismo partido.', points: 35, type: 'best_assists_in_match', target: 3 },
  { code: 'COMPLETE_PLAYER', title: 'Jugador completo', description: 'Marca y asiste en el mismo partido.', points: 20, type: 'complete_player', target: 1 },

  { code: 'MVP_5', title: '5 MVPs', description: 'Consigue 5 MVPs.', points: 60, type: 'mvps', target: 5 },
  { code: 'MVP_10', title: '10 MVPs', description: 'Consigue 10 MVPs.', points: 130, type: 'mvps', target: 10 },
];

router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [[userRow]] = await pool.query(
      `SELECT achievement_points
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    const [[totalsRow]] = await pool.query(
      `SELECT
         COUNT(DISTINCT mps.match_id) AS matchesCount,
         COALESCE(SUM(mps.goals), 0) AS goalsCount,
         COALESCE(SUM(mps.assists), 0) AS assistsCount,
         COALESCE(SUM(CASE WHEN mps.is_mvp = 1 THEN 1 ELSE 0 END), 0) AS mvpCount,
         COALESCE(MAX(mps.goals), 0) AS bestGoalsInMatch,
         COALESCE(MAX(mps.assists), 0) AS bestAssistsInMatch,
         COALESCE(MAX(CASE WHEN mps.goals >= 1 AND mps.assists >= 1 THEN 1 ELSE 0 END), 0) AS completePlayer
       FROM match_player_stats mps
       JOIN matches m ON m.id = mps.match_id
       WHERE mps.user_id = ?
         AND m.starts_at >= ?`,
      [userId, SEASON_START]
    );

    const [unlockedRows] = await pool.query(
      `SELECT a.code
       FROM user_achievements ua
       JOIN achievements a ON a.id = ua.achievement_id
       WHERE ua.user_id = ?`,
      [userId]
    );

    const unlockedSet = new Set(unlockedRows.map((row) => row.code));

    const progressByType = {
      matches: Number(totalsRow.matchesCount || 0),
      goals: Number(totalsRow.goalsCount || 0),
      assists: Number(totalsRow.assistsCount || 0),
      mvps: Number(totalsRow.mvpCount || 0),
      best_goals_in_match: Number(totalsRow.bestGoalsInMatch || 0),
      best_assists_in_match: Number(totalsRow.bestAssistsInMatch || 0),
      complete_player: Number(totalsRow.completePlayer || 0),
    };

    const achievements = ACHIEVEMENT_CATALOG.map((item) => {
      const rawProgress = progressByType[item.type] || 0;
      const progress = Math.min(rawProgress, item.target);

      return {
        code: item.code,
        title: item.title,
        description: item.description,
        points: item.points,
        target: item.target,
        progress,
        unlocked: unlockedSet.has(item.code),
      };
    });

    const [specialAwards] = await pool.query(
      `SELECT
         rt.code,
         rt.name,
         rt.points,
         ur.awarded_at,
         ur.week_label,
         ur.month_label
       FROM user_rewards ur
       JOIN reward_types rt ON rt.id = ur.reward_type_id
       WHERE ur.user_id = ?
         AND rt.category = 'special_award'
       ORDER BY ur.awarded_at DESC`,
      [userId]
    );

    const points = Number(userRow?.achievement_points || 0);

    res.json({
      ok: true,
      points,
      points_to_next_easypass: Math.max(500 - (points % 500 || 0), 0),
      achievements,
      specialAwards,
    });
  } catch (error) {
    console.error('Error loading achievements', error);
    res.status(500).json({ ok: false, msg: 'Error cargando logros' });
  }
});

export default router;