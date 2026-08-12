import { Router } from 'express';
import { pool } from '../config/db.js';
import { madridWallTimeToUtc, toMysqlUtc } from '../utils/madridDateTime.js';

const router = Router();

const normalizeLocationSlug = (value = '') => String(value || '').trim().toLowerCase();

const madridCalendarDate = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const calendarDate = (year, monthIndex, day = 1) => {
  const value = new Date(Date.UTC(year, monthIndex, day));
  return value.toISOString().slice(0, 10);
};

const getPeriodBounds = (period, rawReferenceDate) => {
  const candidate = String(rawReferenceDate || '');
  const candidateDate = /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? new Date(`${candidate}T12:00:00Z`) : null;
  const referenceDate = candidateDate && !Number.isNaN(candidateDate.getTime())
    && candidateDate.toISOString().slice(0, 10) === candidate ? candidate : madridCalendarDate();
  const [year, month] = referenceDate.split('-').map(Number);
  let startDate;
  let endDate;

  if (period === 'quarterly') {
    const quarterMonth = Math.floor((month - 1) / 3) * 3;
    startDate = calendarDate(year, quarterMonth);
    endDate = calendarDate(year, quarterMonth + 3);
  } else if (period === 'yearly') {
    startDate = calendarDate(year, 0);
    endDate = calendarDate(year + 1, 0);
  } else {
    startDate = calendarDate(year, month - 1);
    endDate = calendarDate(year, month);
  }

  return {
    start: toMysqlUtc(madridWallTimeToUtc(startDate, '00:00')),
    end: toMysqlUtc(madridWallTimeToUtc(endDate, '00:00')),
  };
};

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

    const bounds = getPeriodBounds(period, req.query.reference_date || req.query.referenceDate);
    const dateWhere = 'AND m.starts_at >= ? AND m.starts_at < ?';

    const sql = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.avatar_url,
        MAX(EXISTS(
          SELECT 1 FROM user_plus_subscriptions ups
          WHERE ups.user_id = u.id
            AND ups.status IN ('active', 'trialing')
            AND (ups.current_period_end IS NULL OR ups.current_period_end > NOW())
        )) AS is_plus,
        MAX(COALESCE(m.location_id, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END)) AS location_id,
        MAX(COALESCE(l.name, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 'Asturias' ELSE 'Valladolid' END)) AS location_name,
        MAX(COALESCE(l.slug, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 'asturias' ELSE 'valladolid' END)) AS location_slug,
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
      GROUP BY u.id, u.name, u.email, u.avatar_url
      HAVING total > 0
      ORDER BY total DESC, goals DESC, mvps DESC
      LIMIT 50
    `;

    const [rows] = await pool.query(sql, [bounds.start, bounds.end, ...locationFilter.params]);

    res.json({
      ok: true,
      period: {
        type: period,
        start: bounds.start,
        end: bounds.end,
      },
      data: rows.map((row) => ({
        ...row,
        is_plus: Boolean(row.is_plus),
        isPlus: Boolean(row.is_plus),
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
