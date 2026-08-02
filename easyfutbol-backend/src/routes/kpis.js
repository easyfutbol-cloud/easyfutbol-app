import express from 'express';
import * as dbModule from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = express.Router();
const db = dbModule.default || dbModule.pool || dbModule.db || dbModule.connection;

function getPeriodSql(period) {
  return period === 'month'
    ? 'YEAR(m.starts_at) = YEAR(CURDATE()) AND MONTH(m.starts_at) = MONTH(CURDATE())'
    : 'YEARWEEK(m.starts_at, 1) = YEARWEEK(CURDATE(), 1)';
}

function getLocationFilter(query) {
  const locationId = Number(query.location_id || query.locationId || 0);
  if (![1, 2].includes(locationId)) return { sql: '', params: [], locationId: null };
  return {
    sql: `AND COALESCE(m.location_id, CASE
      WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2
      ELSE 1 END) = ?`,
    params: [locationId],
    locationId,
  };
}

function ensureDb(res) {
  if (db && typeof db.query === 'function') return true;
  res.status(500).json({ ok: false, error: 'DB no disponible para KPIs' });
  return false;
}

router.use(requireAuth, requireAdmin);

router.get('/dashboard', async (req, res) => {
  if (!ensureDb(res)) return;
  try {
    const period = req.query.period === 'month' ? 'month' : 'week';
    const periodSql = getPeriodSql(period);
    const location = getLocationFilter(req.query);

    const [summaryRows] = await db.query(
      `SELECT
         COUNT(*) AS total_registros,
         COUNT(DISTINCT mps.user_id) AS usuarios_unicos,
         COUNT(DISTINCT mps.match_id) AS partidos_jugados,
         COALESCE(SUM(mps.goals), 0) AS goles,
         COALESCE(SUM(mps.assists), 0) AS asistencias,
         COALESCE(SUM(CASE WHEN mps.is_mvp = 1 THEN 1 ELSE 0 END), 0) AS mvps
       FROM match_player_stats mps
       JOIN matches m ON m.id = mps.match_id
       WHERE ${periodSql} ${location.sql}`,
      location.params
    );

    const [repeatRows] = await db.query(
      `SELECT COUNT(*) AS repetidores
       FROM (
         SELECT mps.user_id
         FROM match_player_stats mps
         JOIN matches m ON m.id = mps.match_id
         WHERE ${periodSql} ${location.sql}
         GROUP BY mps.user_id
         HAVING COUNT(DISTINCT mps.match_id) >= 2
       ) repeated_players`,
      location.params
    );

    const [topRows] = await db.query(
      `SELECT
         u.id AS jugador_id,
         u.name,
         COUNT(DISTINCT mps.match_id) AS partidos,
         GROUP_CONCAT(DISTINCT mps.match_id ORDER BY mps.match_id ASC SEPARATOR ', ') AS match_ids,
         COALESCE(SUM(mps.goals), 0) AS goles,
         COALESCE(SUM(mps.assists), 0) AS asistencias,
         COALESCE(SUM(CASE WHEN mps.is_mvp = 1 THEN 1 ELSE 0 END), 0) AS mvps
       FROM match_player_stats mps
       JOIN users u ON u.id = mps.user_id
       JOIN matches m ON m.id = mps.match_id
       WHERE ${periodSql} ${location.sql}
       GROUP BY u.id, u.name
       ORDER BY partidos DESC, goles DESC, asistencias DESC
       LIMIT 10`,
      location.params
    );

    const summary = summaryRows[0] || {};
    const users = Number(summary.usuarios_unicos || 0);
    const records = Number(summary.total_registros || 0);
    const repeated = Number(repeatRows?.[0]?.repetidores || 0);
    return res.json({
      ok: true,
      period,
      location_id: location.locationId,
      usuarios_unicos: users,
      partidos_jugados: Number(summary.partidos_jugados || 0),
      participaciones: records,
      frecuencia_media: users ? records / users : 0,
      repeat_rate: users ? repeated / users : 0,
      goles: Number(summary.goles || 0),
      asistencias: Number(summary.asistencias || 0),
      mvps: Number(summary.mvps || 0),
      top_jugadores: topRows,
    });
  } catch (error) {
    console.error('Error obteniendo dashboard KPIs:', error);
    return res.status(500).json({ ok: false, error: 'Error obteniendo dashboard KPIs' });
  }
});

router.get('/players', async (req, res) => {
  if (!ensureDb(res)) return;
  try {
    const location = getLocationFilter(req.query);
    const [players] = await db.query(
      `SELECT
         u.id AS jugador_id,
         u.name,
         COUNT(DISTINCT mps.match_id) AS partidos,
         GROUP_CONCAT(DISTINCT mps.match_id ORDER BY mps.match_id ASC SEPARATOR ', ') AS match_ids,
         COALESCE(SUM(mps.goals), 0) AS goles,
         COALESCE(SUM(mps.assists), 0) AS asistencias,
         COALESCE(SUM(CASE WHEN mps.is_mvp = 1 THEN 1 ELSE 0 END), 0) AS mvps,
         MIN(m.starts_at) AS primer_partido,
         MAX(m.starts_at) AS ultimo_partido
       FROM match_player_stats mps
       JOIN users u ON u.id = mps.user_id
       JOIN matches m ON m.id = mps.match_id
       WHERE 1=1 ${location.sql}
       GROUP BY u.id, u.name
       ORDER BY partidos DESC, goles DESC, asistencias DESC
       LIMIT 50`,
      location.params
    );
    return res.json({ ok: true, location_id: location.locationId, players });
  } catch (error) {
    console.error('Error obteniendo ranking de jugadores KPIs:', error);
    return res.status(500).json({ ok: false, error: 'Error obteniendo ranking de jugadores KPIs' });
  }
});

router.get('/weekday-repeat', async (req, res) => {
  if (!ensureDb(res)) return;
  try {
    const location = getLocationFilter(req.query);
    const [weekdays] = await db.query(
      `SELECT
         t.weekday_number,
         ELT(t.weekday_number + 1, 'Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo') AS weekday_name,
         COUNT(*) AS usuarios_unicos,
         SUM(CASE WHEN t.partidos >= 2 THEN 1 ELSE 0 END) AS repetidores,
         COALESCE(SUM(CASE WHEN t.partidos >= 2 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 0) AS repeat_rate,
         SUM(t.partidos) AS registros
       FROM (
         SELECT mps.user_id, WEEKDAY(m.starts_at) AS weekday_number, COUNT(DISTINCT mps.match_id) AS partidos
         FROM match_player_stats mps
         JOIN matches m ON m.id = mps.match_id
         WHERE 1=1 ${location.sql}
         GROUP BY mps.user_id, WEEKDAY(m.starts_at)
       ) t
       GROUP BY t.weekday_number
       ORDER BY t.weekday_number ASC`,
      location.params
    );
    return res.json({ ok: true, location_id: location.locationId, weekdays });
  } catch (error) {
    console.error('Error obteniendo repetición por día:', error);
    return res.status(500).json({ ok: false, error: 'Error obteniendo repetición por día' });
  }
});

export default router;
