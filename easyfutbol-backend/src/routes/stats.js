import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

/**
 * Ranking de jugadores
 * Suma total de goles+asistencias por usuario en todos los partidos
 */
router.get('/stats/top-players', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         COALESCE(SUM(mps.goals), 0)   AS goals,
         COALESCE(SUM(mps.assists), 0) AS assists,
         COALESCE(SUM(mps.is_mvp), 0)  AS mvps,
         COALESCE(SUM(mps.goals + mps.assists), 0) AS total
   FROM match_player_stats mps
   JOIN users u ON u.id = mps.user_id
   GROUP BY u.id, u.name, u.email
   HAVING total > 0
   ORDER BY total DESC, goals DESC, mvps DESC
   LIMIT 50`
    );

    res.json({ ok:true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error generando ranking' });
  }
});

export default router;
