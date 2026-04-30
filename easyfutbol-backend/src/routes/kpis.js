import express from 'express';
import * as dbModule from '../config/db.js';

const router = express.Router();
const db = dbModule.default || dbModule.pool || dbModule.db || dbModule.connection;

function getPeriodSql(period) {
  if (period === 'month') {
    return `YEAR(mps.created_at) = YEAR(CURDATE()) AND MONTH(mps.created_at) = MONTH(CURDATE())`;
  }

  return `YEARWEEK(mps.created_at, 1) = YEARWEEK(CURDATE(), 1)`;
}

function ensureDb(res) {
  if (!db || typeof db.query !== 'function') {
    console.error('DB no disponible en KPIs. Revisa exports de config/db.js:', Object.keys(dbModule));
    res.status(500).json({ error: 'DB no disponible para KPIs' });
    return false;
  }

  return true;
}

router.get('/dashboard', async (req, res) => {
  if (!ensureDb(res)) return;

  try {
    const period = req.query.period === 'month' ? 'month' : 'week';
    const periodSql = getPeriodSql(period);

    const [summaryRows] = await db.query(`
      SELECT
        COUNT(*) AS total_registros,
        COUNT(DISTINCT mps.user_id) AS usuarios_unicos,
        COUNT(DISTINCT mps.match_id) AS partidos_jugados,
        COALESCE(SUM(mps.goals), 0) AS goles,
        COALESCE(SUM(mps.assists), 0) AS asistencias,
        COALESCE(SUM(CASE WHEN mps.is_mvp = 1 THEN 1 ELSE 0 END), 0) AS mvps
      FROM match_player_stats mps
      WHERE ${periodSql}
    `);

    const [repeatRows] = await db.query(`
      SELECT COUNT(*) AS repetidores
      FROM (
        SELECT mps.user_id
        FROM match_player_stats mps
        WHERE ${periodSql}
        GROUP BY mps.user_id
        HAVING COUNT(DISTINCT mps.match_id) >= 2
      ) t
    `);

    const [topRows] = await db.query(`
      SELECT
        u.id AS jugador_id,
        u.name,
        COUNT(DISTINCT mps.match_id) AS partidos,
        GROUP_CONCAT(DISTINCT mps.match_id ORDER BY mps.match_id ASC SEPARATOR ', ') AS match_ids,
        COALESCE(SUM(mps.goals), 0) AS goles,
        COALESCE(SUM(mps.assists), 0) AS asistencias,
        COALESCE(SUM(CASE WHEN mps.is_mvp = 1 THEN 1 ELSE 0 END), 0) AS mvps
      FROM match_player_stats mps
      JOIN users u ON u.id = mps.user_id
      WHERE ${periodSql}
      GROUP BY u.id, u.name
      ORDER BY partidos DESC, goles DESC, asistencias DESC
      LIMIT 10
    `);

    const summary = summaryRows[0] || {};
    const usuariosUnicos = Number(summary.usuarios_unicos || 0);
    const totalRegistros = Number(summary.total_registros || 0);
    const repetidores = Number(repeatRows?.[0]?.repetidores || 0);

    res.json({
      period,
      usuarios_unicos: usuariosUnicos,
      partidos_jugados: Number(summary.partidos_jugados || 0),
      frecuencia_media: usuariosUnicos > 0 ? totalRegistros / usuariosUnicos : 0,
      repeat_rate: usuariosUnicos > 0 ? repetidores / usuariosUnicos : 0,
      goles: Number(summary.goles || 0),
      asistencias: Number(summary.asistencias || 0),
      mvps: Number(summary.mvps || 0),
      top_jugadores: topRows,
    });
  } catch (error) {
    console.error('Error obteniendo dashboard KPIs:', error);
    res.status(500).json({ error: 'Error obteniendo dashboard KPIs' });
  }
});

router.get('/players', async (req, res) => {
  if (!ensureDb(res)) return;

  try {
    const [players] = await db.query(`
      SELECT
        u.id AS jugador_id,
        u.name,
        COUNT(DISTINCT mps.match_id) AS partidos,
        GROUP_CONCAT(DISTINCT mps.match_id ORDER BY mps.match_id ASC SEPARATOR ', ') AS match_ids,
        COALESCE(SUM(mps.goals), 0) AS goles,
        COALESCE(SUM(mps.assists), 0) AS asistencias,
        COALESCE(SUM(CASE WHEN mps.is_mvp = 1 THEN 1 ELSE 0 END), 0) AS mvps,
        MIN(mps.created_at) AS primer_partido,
        MAX(mps.created_at) AS ultimo_partido
      FROM match_player_stats mps
      JOIN users u ON u.id = mps.user_id
      GROUP BY u.id, u.name
      ORDER BY partidos DESC, goles DESC, asistencias DESC
      LIMIT 50
    `);

    res.json({ players });
  } catch (error) {
    console.error('Error obteniendo ranking de jugadores KPIs:', error);
    res.status(500).json({ error: 'Error obteniendo ranking de jugadores KPIs' });
  }
});

router.get('/weekday-repeat', async (req, res) => {
  if (!ensureDb(res)) return;

  try {
    const [weekdays] = await db.query(`
      SELECT
        weekday_number,
        weekday_name,
        COUNT(*) AS usuarios_unicos,
        SUM(CASE WHEN partidos >= 2 THEN 1 ELSE 0 END) AS repetidores,
        COALESCE(SUM(CASE WHEN partidos >= 2 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 0) AS repeat_rate,
        SUM(partidos) AS registros
      FROM (
        SELECT
          mps.user_id,
          WEEKDAY(mps.created_at) AS weekday_number,
          CASE WEEKDAY(mps.created_at)
            WHEN 0 THEN 'Lunes'
            WHEN 1 THEN 'Martes'
            WHEN 2 THEN 'Miércoles'
            WHEN 3 THEN 'Jueves'
            WHEN 4 THEN 'Viernes'
            WHEN 5 THEN 'Sábado'
            WHEN 6 THEN 'Domingo'
          END AS weekday_name,
          COUNT(DISTINCT mps.match_id) AS partidos
        FROM match_player_stats mps
        GROUP BY mps.user_id, WEEKDAY(mps.created_at)
      ) t
      GROUP BY weekday_number, weekday_name
      ORDER BY weekday_number ASC
    `);

    res.json({ weekdays });
  } catch (error) {
    console.error('Error obteniendo repetición por día:', error);
    res.status(500).json({ error: 'Error obteniendo repetición por día' });
  }
});

export default router;