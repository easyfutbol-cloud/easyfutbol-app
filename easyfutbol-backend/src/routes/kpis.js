import express from 'express';
import rateLimit from 'express-rate-limit';
import * as dbModule from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import {
  deleteMarketingSpend,
  getAcquisitionKpis,
  getInvestorReport,
  getMonetizationKpis,
  getTractionKpis,
  investorReportToCsv,
  listMarketingSpend,
  parseMarketingSpend,
  upsertMarketingSpend,
} from '../services/kpiService.js';
import { syncRevenue, countUnsyncedPurchases, getRevenueSyncStatus } from '../services/revenueSyncService.js';
import { getStripe } from '../services/stripeClient.js';

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

// ---------------------------------------------------------------------------
// KPIs de negocio: tracción, monetización, adquisición (CAC) e informe mensual.
// Todos admiten ?location_id=1|2 (sin él, global) y ?fresh=1 para saltarse la caché.
// ---------------------------------------------------------------------------

const kpiFailure = (res, label, error) => {
  console.error(`[KPIs] ${label}:`, error);
  return res.status(500).json({ ok: false, error: `No se pudo calcular: ${label}`, msg: `No se pudo calcular: ${label}` });
};

const syncLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, msg: 'Demasiadas sincronizaciones seguidas. Espera unos minutos.' },
});

router.get('/traction', async (req, res) => {
  try {
    const { locationId } = getLocationFilter(req.query);
    return res.json(await getTractionKpis({ locationId, fresh: req.query.fresh === '1' }));
  } catch (error) {
    return kpiFailure(res, 'tracción', error);
  }
});

router.get('/monetization', async (req, res) => {
  try {
    const { locationId } = getLocationFilter(req.query);
    const data = await getMonetizationKpis({ locationId, fresh: req.query.fresh === '1' });
    return res.json({ ...data, pending_sync: await countUnsyncedPurchases(dbModule.pool), stripe_configured: Boolean(getStripe()), last_sync: getRevenueSyncStatus() });
  } catch (error) {
    return kpiFailure(res, 'monetización', error);
  }
});

router.get('/acquisition', async (req, res) => {
  try {
    const { locationId } = getLocationFilter(req.query);
    return res.json(await getAcquisitionKpis({ locationId, fresh: req.query.fresh === '1' }));
  } catch (error) {
    return kpiFailure(res, 'adquisición', error);
  }
});

router.get('/investor-report', async (req, res) => {
  try {
    const { locationId } = getLocationFilter(req.query);
    const report = await getInvestorReport({ locationId });
    if (req.query.format === 'csv') {
      const day = report.generated_at.slice(0, 10);
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="kpis-easyfutbol-${day}.csv"`);
      return res.send(`\uFEFF${investorReportToCsv(report)}`);
    }
    return res.json(report);
  } catch (error) {
    return kpiFailure(res, 'informe mensual', error);
  }
});

router.get('/marketing-spend', async (_req, res) => {
  try {
    return res.json({ ok: true, data: await listMarketingSpend() });
  } catch (error) {
    return kpiFailure(res, 'gasto de marketing', error);
  }
});

router.put('/marketing-spend', async (req, res) => {
  try {
    const { value, error } = parseMarketingSpend(req.body);
    if (error) return res.status(400).json({ ok: false, msg: error, error });
    await upsertMarketingSpend(value, req.user?.id);
    return res.json({ ok: true, data: await listMarketingSpend() });
  } catch (error) {
    return kpiFailure(res, 'guardar el gasto', error);
  }
});

router.delete('/marketing-spend/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, msg: 'ID inválido' });
    const deleted = await deleteMarketingSpend(id);
    if (!deleted) return res.status(404).json({ ok: false, msg: 'Entrada no encontrada' });
    return res.json({ ok: true, data: await listMarketingSpend() });
  } catch (error) {
    return kpiFailure(res, 'borrar el gasto', error);
  }
});

/** Lee de Stripe el importe real de las compras pendientes (histórico incluido). */
router.post('/revenue/sync', syncLimiter, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ ok: false, msg: 'Stripe no está configurado en el servidor' });
  try {
    const limit = Math.min(400, Math.max(1, Number(req.body?.limit) || 200));
    const result = await syncRevenue({ stripe, limit, refundLimit: 150 });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return kpiFailure(res, 'sincronizar con Stripe', error);
  }
});

export default router;
