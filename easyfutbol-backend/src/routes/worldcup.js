import express from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

const WORLD_CUP_START = '2026-06-01 00:00:00';
const WORLD_CUP_END = '2026-07-20 00:00:00';


const POINTS = {
  goal: 1,
  assist: 1,
  mvp: 3,
  win: 2,
};

function normalizeWorldCupTeam(value) {
  let rawValue = value;

  if (typeof rawValue === 'string') {
    const trimmedValue = rawValue.trim();
    if (trimmedValue.startsWith('{') && trimmedValue.endsWith('}')) {
      try {
        rawValue = JSON.parse(trimmedValue);
      } catch (_e) {
        rawValue = trimmedValue;
      }
    }
  }

  if (rawValue && typeof rawValue === 'object') {
    rawValue =
      rawValue.id ||
      rawValue.key ||
      rawValue.value ||
      rawValue.slug ||
      rawValue.code ||
      rawValue.country_code ||
      rawValue.countryCode ||
      rawValue.team_id ||
      rawValue.teamId ||
      rawValue.team ||
      rawValue.name ||
      rawValue.label ||
      rawValue.title ||
      '';
  }

  const cleanValue = String(rawValue || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return cleanValue;
}

// GET /api/worldcup/ranking
// Ranking general por selecciones + ranking individual
router.get('/ranking', async (_req, res) => {
  try {
    const [teamsRanking] = await pool.query(
      `
      SELECT
        team_data.team,
        team_data.total_players,
        COALESCE(stats_data.active_players, 0) AS players,
        COALESCE(stats_data.matches_registered, 0) AS matches_registered,
        COALESCE(stats_data.goals, 0) AS goals,
        COALESCE(stats_data.assists, 0) AS assists,
        COALESCE(stats_data.mvps, 0) AS mvps,
        COALESCE(stats_data.wins, 0) AS wins,
        COALESCE(bonus_data.bonus_points, 0) AS bonus_points,
        (
          COALESCE(stats_data.stats_points, 0) +
          COALESCE(bonus_data.bonus_points, 0)
        ) AS total_points,
        ROUND(
          (
            COALESCE(stats_data.stats_points, 0) +
            COALESCE(bonus_data.bonus_points, 0)
          ) / NULLIF(COALESCE(stats_data.active_players, 0), 0),
          2
        ) AS average_points
      FROM (
        SELECT
          worldcup_team AS team,
          COUNT(DISTINCT id) AS total_players
        FROM users
        WHERE worldcup_team IS NOT NULL
        GROUP BY worldcup_team
      ) team_data
      LEFT JOIN (
        SELECT
          u.worldcup_team AS team,
          COUNT(DISTINCT mps.user_id) AS active_players,
          COUNT(DISTINCT mps.match_id) AS matches_registered,
          COALESCE(SUM(mps.goals), 0) AS goals,
          COALESCE(SUM(mps.assists), 0) AS assists,
          COALESCE(SUM(mps.is_mvp), 0) AS mvps,
          COALESCE(SUM(CASE WHEN mps.result = 'win' THEN 1 ELSE 0 END), 0) AS wins,
          COALESCE(SUM(
            (mps.goals * ?) +
            (mps.assists * ?) +
            (mps.is_mvp * ?) +
            (CASE WHEN mps.result = 'win' THEN ? ELSE 0 END)
          ), 0) AS stats_points
        FROM users u
        JOIN match_player_stats mps ON mps.user_id = u.id
        WHERE u.worldcup_team IS NOT NULL
          AND mps.created_at >= ?
          AND mps.created_at < ?
        GROUP BY u.worldcup_team
      ) stats_data ON stats_data.team = team_data.team
      LEFT JOIN (
        SELECT
          u.worldcup_team AS team,
          COALESCE(SUM(wbp.points), 0) AS bonus_points
        FROM users u
        JOIN worldcup_bonus_points wbp ON wbp.user_id = u.id
        WHERE u.worldcup_team IS NOT NULL
          AND wbp.created_at >= ?
          AND wbp.created_at < ?
        GROUP BY u.worldcup_team
      ) bonus_data ON bonus_data.team = team_data.team
      ORDER BY COALESCE(average_points, 0) DESC, total_points DESC
      `,
      [
        POINTS.goal,
        POINTS.assist,
        POINTS.mvp,
        POINTS.win,
        WORLD_CUP_START,
        WORLD_CUP_END,
        WORLD_CUP_START,
        WORLD_CUP_END,
      ]
    );

    const [playersRanking] = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.worldcup_team AS team,
        COALESCE(stats_data.matches, 0) AS matches,
        COALESCE(stats_data.goals, 0) AS goals,
        COALESCE(stats_data.assists, 0) AS assists,
        COALESCE(stats_data.mvps, 0) AS mvps,
        COALESCE(stats_data.wins, 0) AS wins,
        COALESCE(stats_data.stats_points, 0) AS stats_points,
        COALESCE(bonus_data.bonus_points, 0) AS bonus_points,
        (
          COALESCE(stats_data.stats_points, 0) +
          COALESCE(bonus_data.bonus_points, 0)
        ) AS points
      FROM users u
      LEFT JOIN (
        SELECT
          mps.user_id,
          COUNT(DISTINCT mps.match_id) AS matches,
          COALESCE(SUM(mps.goals), 0) AS goals,
          COALESCE(SUM(mps.assists), 0) AS assists,
          COALESCE(SUM(mps.is_mvp), 0) AS mvps,
          COALESCE(SUM(CASE WHEN mps.result = 'win' THEN 1 ELSE 0 END), 0) AS wins,
          COALESCE(SUM(
            (mps.goals * ?) +
            (mps.assists * ?) +
            (mps.is_mvp * ?) +
            (CASE WHEN mps.result = 'win' THEN ? ELSE 0 END)
          ), 0) AS stats_points
        FROM match_player_stats mps
        WHERE mps.created_at >= ?
          AND mps.created_at < ?
        GROUP BY mps.user_id
      ) stats_data ON stats_data.user_id = u.id
      LEFT JOIN (
        SELECT
          wbp.user_id,
          COALESCE(SUM(wbp.points), 0) AS bonus_points
        FROM worldcup_bonus_points wbp
        WHERE wbp.created_at >= ?
          AND wbp.created_at < ?
        GROUP BY wbp.user_id
      ) bonus_data ON bonus_data.user_id = u.id
      WHERE u.worldcup_team IS NOT NULL
      ORDER BY points DESC, goals DESC, assists DESC
      `,
      [
        POINTS.goal,
        POINTS.assist,
        POINTS.mvp,
        POINTS.win,
        WORLD_CUP_START,
        WORLD_CUP_END,
        WORLD_CUP_START,
        WORLD_CUP_END,
      ]
    );

    return res.json({
      startDate: WORLD_CUP_START,
      endDate: '2026-07-19 23:59:59',
      points: {
        ...POINTS,
        goal_of_week: 3,
        save_of_week: 3,
        goal_of_month: 8,
        save_of_month: 8,
      },
      teamsRanking,
      playersRanking,
    });
  } catch (error) {
    console.error('Error obteniendo ranking del Mundial:', error);
    return res.status(500).json({ message: 'Error obteniendo ranking del Mundial' });
  }
});

// GET /api/worldcup/me
// Devuelve la selección elegida por el usuario conectado
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const [rows] = await pool.query(
      `
      SELECT id, name, worldcup_team, worldcup_team_selected_at
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error('Error obteniendo selección del usuario:', error);
    return res.status(500).json({ message: 'Error obteniendo selección del usuario' });
  }
});

// POST /api/worldcup/select-team
// Permite al usuario elegir selección una sola vez
router.post('/select-team', requireAuth, async (req, res) => {
  try {
    console.log('WORLD CUP SELECT TEAM - REQUEST', {
      user: req.user,
      body: req.body,
      headers: {
        authorization: req.headers?.authorization ? 'present' : 'missing',
        contentType: req.headers?.['content-type'],
      },
    });
    const userId = req.user?.id || req.user?.userId;

    if (!userId) {
      console.log('WORLD CUP SELECT TEAM - ERROR 401: userId missing', { user: req.user });
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const body = req.body || {};
    const rawTeam =
      body.team ||
      body.worldcup_team ||
      body.worldcupTeam ||
      body.selected_team ||
      body.selectedTeam ||
      body.selected_country ||
      body.selectedCountry ||
      body.country ||
      body.country_id ||
      body.countryId ||
      body.country_code ||
      body.countryCode ||
      body.team_id ||
      body.teamId ||
      body.code ||
      body.value ||
      body.id ||
      body.key ||
      body.slug ||
      body.name ||
      body.label ||
      body.title ||
      body;

    const cleanTeam = normalizeWorldCupTeam(rawTeam);

    console.log('WORLD CUP SELECT TEAM - NORMALIZED', {
      rawTeam,
      cleanTeam,
      bodyKeys: Object.keys(body || {}),
    });

    if (!cleanTeam) {
      console.log('WorldCup select-team body inválido:', body);
      return res.status(400).json({ message: 'Debes elegir una selección válida' });
    }

    if (cleanTeam.length < 2 || cleanTeam.length > 50) {
      console.log('WorldCup select-team selección inválida:', { body, cleanTeam });
      return res.status(400).json({ message: 'La selección elegida no es válida' });
    }

    const [users] = await pool.query(
      `
      SELECT worldcup_team
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!users.length) {
      console.log('WORLD CUP SELECT TEAM - ERROR 404: user not found', { userId });
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (users[0].worldcup_team) {
      console.log('WORLD CUP SELECT TEAM - ERROR 409: already selected', { userId, currentTeam: users[0].worldcup_team, attemptedTeam: cleanTeam });
      return res.status(409).json({ message: 'Ya has elegido una selección y no puedes cambiarla' });
    }

    await pool.query(
      `
      UPDATE users
      SET worldcup_team = ?, worldcup_team_selected_at = NOW()
      WHERE id = ?
      `,
      [cleanTeam, userId]
    );

    console.log('WORLD CUP SELECT TEAM - SUCCESS', {
      userId,
      team: cleanTeam,
    });

    return res.json({
      message: 'Selección elegida correctamente',
      team: cleanTeam,
    });
  } catch (error) {
    console.error('WORLD CUP SELECT TEAM - ERROR 500:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
      body: req.body,
      user: req.user,
    });
    return res.status(500).json({ message: 'Error eligiendo selección del Mundial' });
  }
});

export default router;