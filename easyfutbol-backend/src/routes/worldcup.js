import express from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';

const router = express.Router();

const WORLD_CUP_START = '2026-06-09 00:00:00';
const WORLD_CUP_END = '2026-07-20 00:00:00';

const POINTS = {
  goal: 1,
  assist: 1,
  mvp: 3,
  win: 2,
};

// GET /api/worldcup/ranking
// Ranking general por selecciones + ranking individual
router.get('/ranking', async (_req, res) => {
  try {
    const [teamsRanking] = await pool.query(
      `
      SELECT
        u.worldcup_team AS team,
        COUNT(DISTINCT u.id) AS players,
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
        ), 0) AS total_points,
        ROUND(
          COALESCE(SUM(
            (mps.goals * ?) +
            (mps.assists * ?) +
            (mps.is_mvp * ?) +
            (CASE WHEN mps.result = 'win' THEN ? ELSE 0 END)
          ), 0) / COUNT(DISTINCT u.id),
          2
        ) AS average_points
      FROM users u
      JOIN match_player_stats mps ON mps.user_id = u.id
      WHERE u.worldcup_team IS NOT NULL
        AND mps.created_at >= ?
        AND mps.created_at < ?
      GROUP BY u.worldcup_team
      ORDER BY average_points DESC, total_points DESC
      `,
      [
        POINTS.goal,
        POINTS.assist,
        POINTS.mvp,
        POINTS.win,
        POINTS.goal,
        POINTS.assist,
        POINTS.mvp,
        POINTS.win,
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
        ), 0) AS points
      FROM users u
      JOIN match_player_stats mps ON mps.user_id = u.id
      WHERE u.worldcup_team IS NOT NULL
        AND mps.created_at >= ?
        AND mps.created_at < ?
      GROUP BY u.id, u.name, u.worldcup_team
      ORDER BY points DESC, goals DESC, assists DESC
      `,
      [
        POINTS.goal,
        POINTS.assist,
        POINTS.mvp,
        POINTS.win,
        WORLD_CUP_START,
        WORLD_CUP_END,
      ]
    );

    return res.json({
      startDate: WORLD_CUP_START,
      endDate: '2026-07-19 23:59:59',
      points: POINTS,
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
    const userId = req.user?.id;

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
    const userId = req.user?.id;
    const { team } = req.body || {};

    if (!team || typeof team !== 'string') {
      return res.status(400).json({ message: 'Debes elegir una selección válida' });
    }

    const cleanTeam = team.trim().toLowerCase();

    if (cleanTeam.length < 2 || cleanTeam.length > 50) {
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
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (users[0].worldcup_team) {
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

    return res.json({
      message: 'Selección elegida correctamente',
      team: cleanTeam,
    });
  } catch (error) {
    console.error('Error eligiendo selección del Mundial:', error);
    return res.status(500).json({ message: 'Error eligiendo selección del Mundial' });
  }
});

export default router;