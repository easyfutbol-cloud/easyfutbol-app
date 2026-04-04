import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

/**
 * Ranking de jugadores
 * Suma goles + asistencias + MVP filtrando por periodo usando la fecha real del partido
 */
router.get('/stats/top-players', async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;

    let dateWhere = '';

    if (period === 'monthly') {
      dateWhere = `
        AND m.starts_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
        AND m.starts_at < DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-01')
      `;
    } else if (period === 'quarterly') {
      dateWhere = `
        AND m.starts_at >= MAKEDATE(YEAR(NOW()), 1) + INTERVAL (QUARTER(NOW()) - 1) QUARTER
        AND m.starts_at < MAKEDATE(YEAR(NOW()), 1) + INTERVAL QUARTER(NOW()) QUARTER
      `;
    } else if (period === 'yearly') {
      dateWhere = `
        AND YEAR(m.starts_at) = YEAR(NOW())
      `;
    }

    const sql = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.avatar_url,
        COALESCE(SUM(mps.goals), 0) AS goals,
        COALESCE(SUM(mps.assists), 0) AS assists,
        COALESCE(SUM(mps.is_mvp), 0) AS mvps,
        COALESCE(SUM(mps.goals + mps.assists), 0) AS total
      FROM match_player_stats mps
      JOIN users u ON u.id = mps.user_id
      JOIN matches m ON m.id = mps.match_id
      WHERE 1=1
      ${dateWhere}
      GROUP BY u.id, u.name, u.email, u.avatar_url
      HAVING total > 0
      ORDER BY total DESC, goals DESC, mvps DESC
      LIMIT 50
    `;

    const [rows] = await pool.query(sql);

    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: 'Error generando ranking' });
  }
});

export default router;
