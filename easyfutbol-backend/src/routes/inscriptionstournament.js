import express from 'express';
import { pool } from '../config/db.js';
import * as authMiddleware from '../middlewares/auth.js';

const router = express.Router();

const requireAuth =
  authMiddleware.default ||
  authMiddleware.requireAuth ||
  authMiddleware.auth;

// GET /api/tournament-inscriptions/:tournamentId
// Lista las inscripciones de un torneo con datos del jugador
router.get('/:tournamentId', requireAuth, async (req, res) => {
  const { tournamentId } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT
        ti.id AS inscription_id,
        ti.tournament_id,
        ti.user_id,
        u.name AS player_name,
        u.email,
        u.phone,
        u.city,
        ti.status,
        ti.shirt_size,
        ti.payment_method,
        ti.created_at,
        ti.cancelled_at
      FROM tournament_inscriptions ti
      JOIN users u ON u.id = ti.user_id
      WHERE ti.tournament_id = ?
      ORDER BY
        CASE
          WHEN ti.status = 'confirmed' THEN 1
          WHEN ti.status = 'cancelled' THEN 2
          ELSE 3
        END,
        ti.created_at ASC
      `,
      [tournamentId]
    );

    return res.json(rows);
  } catch (error) {
    console.error('Error fetching tournament inscriptions:', error);
    return res.status(500).json({ message: 'Error al obtener los inscritos del torneo' });
  }
});

export default router;
