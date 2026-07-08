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
        trp.id AS player_registration_id,
        trp.registration_group_id,
        trp.tournament_id,
        trp.linked_user_id AS user_id,
        trp.full_name AS player_name,
        trp.email,
        trp.phone,
        u.city,
        trp.status,
        trp.shirt_size,
        trp.shirt_name,
        trp.shirt_number,
        trp.level,
        trp.is_goalkeeper,
        trp.created_at
      FROM tournament_registration_players trp
      LEFT JOIN users u ON u.id = trp.linked_user_id
      WHERE trp.tournament_id = ?
      ORDER BY
        CASE
          WHEN trp.status = 'confirmed' THEN 1
          WHEN trp.status = 'cancelled' THEN 2
          ELSE 3
        END,
        trp.created_at ASC,
        trp.registration_group_id ASC,
        trp.id ASC
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
