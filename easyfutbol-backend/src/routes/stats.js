import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

const normalizeLocationSlug = (value = '') => String(value || '').trim().toLowerCase();

const getLocationFilter = (query = {}) => {
  const params = [];

  const locationId = Number(query.location_id || query.locationId || 0);
  if (Number.isInteger(locationId) && locationId > 0) {
    return {
      sql: `AND COALESCE(m.location_id, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END) = ?`,
      params: [locationId],
    };
  }

  const locationSlug = normalizeLocationSlug(query.location_slug || query.locationSlug || query.slug);
  if (locationSlug) {
    if (locationSlug === 'asturias') {
      return {
        sql: `AND COALESCE(m.location_id, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END) = 2`,
        params,
      };
    }

    if (locationSlug === 'valladolid') {
      return {
        sql: `AND COALESCE(m.location_id, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END) = 1`,
        params,
      };
    }
  }

  return { sql: '', params };
};

/**
 * Ranking de jugadores
 * Suma goles + asistencias + MVP filtrando por periodo usando la fecha real del partido
 */
router.get('/stats/top-players', async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    const locationFilter = getLocationFilter(req.query);

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
        COALESCE(m.location_id, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END) AS location_id,
        COALESCE(l.name, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 'Asturias' ELSE 'Valladolid' END) AS location_name,
        COALESCE(l.slug, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 'asturias' ELSE 'valladolid' END) AS location_slug,
        COALESCE(SUM(mps.goals), 0) AS goals,
        COALESCE(SUM(mps.assists), 0) AS assists,
        COALESCE(SUM(mps.is_mvp), 0) AS mvps,
        COALESCE(SUM(mps.goals + mps.assists), 0) AS total,
        COALESCE(SUM(CASE WHEN mps.result = 'win' THEN 1 ELSE 0 END), 0) AS wins,
        COALESCE(SUM(CASE WHEN mps.result = 'loss' THEN 1 ELSE 0 END), 0) AS losses,
        COALESCE(SUM(CASE WHEN mps.result = 'draw' THEN 1 ELSE 0 END), 0) AS draws
      FROM match_player_stats mps
      JOIN users u ON u.id = mps.user_id
      JOIN matches m ON m.id = mps.match_id
      LEFT JOIN locations l ON l.id = m.location_id
      WHERE 1=1
      ${dateWhere}
      ${locationFilter.sql}
      GROUP BY u.id, u.name, u.email, u.avatar_url, m.location_id, m.city, l.name, l.slug
      HAVING total > 0
      ORDER BY total DESC, goals DESC, mvps DESC
      LIMIT 50
    `;

    const [rows] = await pool.query(sql, locationFilter.params);

    res.json({
      ok: true,
      data: rows.map((row) => ({
        ...row,
        location_id: Number(row.location_id || 0),
        locationId: Number(row.location_id || 0),
        location_name: row.location_name,
        locationName: row.location_name,
        location_slug: row.location_slug,
        locationSlug: row.location_slug,
        goals: Number(row.goals || 0),
        assists: Number(row.assists || 0),
        mvps: Number(row.mvps || 0),
        total: Number(row.total || 0),
        wins: Number(row.wins || 0),
        losses: Number(row.losses || 0),
        draws: Number(row.draws || 0),
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: 'Error generando ranking' });
  }
});


router.get('/stats/me/month', async (req, res) => {
  try {
    const userId = req.user?.id || req.userId || req.query.user_id;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        msg: 'Usuario no autenticado',
      });
    }

    const locationFilter = getLocationFilter(req.query);

    const sql = `
      SELECT
        ranked.user_id,
        ranked.goals,
        ranked.assists,
        ranked.total,
        ranked.wins,
        ranked.losses,
        ranked.draws,
        ranked.position
      FROM (
        SELECT
          totals.user_id,
          totals.goals,
          totals.assists,
          totals.total,
          totals.wins,
          totals.losses,
          totals.draws,
          DENSE_RANK() OVER (
            ORDER BY totals.total DESC, totals.goals DESC, totals.assists DESC
          ) AS position
        FROM (
          SELECT
            mps.user_id,
            COALESCE(SUM(mps.goals), 0) AS goals,
            COALESCE(SUM(mps.assists), 0) AS assists,
            COALESCE(SUM(mps.goals + mps.assists), 0) AS total,
            COALESCE(SUM(CASE WHEN mps.result = 'win' THEN 1 ELSE 0 END), 0) AS wins,
            COALESCE(SUM(CASE WHEN mps.result = 'loss' THEN 1 ELSE 0 END), 0) AS losses,
            COALESCE(SUM(CASE WHEN mps.result = 'draw' THEN 1 ELSE 0 END), 0) AS draws
          FROM match_player_stats mps
          JOIN matches m ON m.id = mps.match_id
          WHERE m.starts_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
            AND m.starts_at < DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-01')
            ${locationFilter.sql}
          GROUP BY mps.user_id
          HAVING total > 0
        ) totals
      ) ranked
      WHERE ranked.user_id = ?
    `;

    const [rows] = await pool.query(sql, [...locationFilter.params, userId]);
    const row = rows[0];

    return res.json({
      ok: true,
      goals: Number(row?.goals || 0),
      assists: Number(row?.assists || 0),
      wins: Number(row?.wins || 0),
      losses: Number(row?.losses || 0),
      draws: Number(row?.draws || 0),
      rank: row?.position ? Number(row.position) : null,
    });
  } catch (e) {
    console.error('Error en /stats/me/month:', e);
    return res.status(500).json({
      ok: false,
      msg: 'Error cargando estadísticas mensuales',
    });
  }
});

export default router;
