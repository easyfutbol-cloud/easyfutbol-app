// Lee de la base de datos lo necesario para los KPIs de negocio y se lo pasa a
// los cálculos puros de kpiMetrics.js. Aquí solo hay consultas sencillas; toda
// la lógica (cohortes, medianas, CAC...) está en kpiMetrics.js, que se prueba
// con casos conocidos.
import { pool } from '../config/db.js';
import {
  computeAcquisition,
  computeActivation,
  computeFillRate,
  computeMonetization,
  computeTraction,
  madridMonthKey,
} from './kpiMetrics.js';

// Misma regla de sede que el resto de la app: la del partido o, si no la tiene, la ciudad.
const MATCH_LOCATION_SQL = `COALESCE(m.location_id, CASE
  WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2
  ELSE 1 END)`;

// Respuestas guardadas un minuto: el dashboard lanza varias consultas a la vez
// y recalcular todo el histórico en cada una sería un desperdicio.
const cache = new Map();
const CACHE_TTL_MS = 60_000;

async function memo(key, compute, { bypass = false } = {}) {
  const hit = cache.get(key);
  if (!bypass && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = await compute();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function clearKpiCache() {
  cache.clear();
}

// ---------- lecturas ----------

async function fetchUsers(db) {
  const [rows] = await db.query('SELECT id, created_at, role, preferred_location FROM users');
  return rows;
}

/**
 * Una fila por entrada confirmada de un partido ya disputado y no cancelado.
 * El jugador es la persona a la que se asignó la entrada o, si nadie la
 * reclamó, quien la compró. Se excluyen las cuentas de administrador.
 */
async function fetchParticipations(db) {
  const [rows] = await db.query(
    `SELECT COALESCE(i.assigned_user_id, i.user_id) AS player_id,
            i.match_id,
            m.starts_at,
            ${MATCH_LOCATION_SQL} AS location_id
     FROM inscriptions i
     JOIN matches m ON m.id = i.match_id
     JOIN users u ON u.id = COALESCE(i.assigned_user_id, i.user_id)
     WHERE i.status IN ('confirmed','paid','active')
       AND COALESCE(m.status, 'scheduled') <> 'cancelled'
       AND m.starts_at < UTC_TIMESTAMP()
       AND COALESCE(u.role, 'player') <> 'admin'`
  );
  return rows;
}

async function fetchMatchesForOccupancy(db) {
  const [rows] = await db.query(
    `SELECT m.id AS match_id, m.starts_at, m.capacity, ${MATCH_LOCATION_SQL} AS location_id, COUNT(i.id) AS taken
     FROM matches m
     JOIN inscriptions i ON i.match_id = m.id AND i.status IN ('confirmed','paid','active')
     WHERE COALESCE(m.status, 'scheduled') <> 'cancelled' AND m.starts_at < UTC_TIMESTAMP()
     GROUP BY m.id, m.starts_at, m.capacity, m.location_id, m.city`
  );
  return rows;
}

async function fetchPassTransactions(db) {
  const [rows] = await db.query(
    `SELECT t.id, t.user_id, t.type, t.amount, t.pack_id, t.payment_reference, t.created_at,
            CASE WHEN t.type = 'purchase' THEN ep.location_id
                 WHEN t.type IN ('spend', 'refund') THEN ${MATCH_LOCATION_SQL}
                 ELSE NULL END AS location_id
     FROM easypass_transactions t
     LEFT JOIN easypass_packs ep ON ep.id = t.pack_id AND t.type = 'purchase'
     LEFT JOIN matches m ON m.id = t.event_id AND t.type IN ('spend', 'refund')`
  );
  return rows;
}

async function fetchPacks(db) {
  const [rows] = await db.query('SELECT id, name, credits, price_cents, location_id FROM easypass_packs');
  return rows;
}

async function fetchBalances(db) {
  const [rows] = await db.query(
    `SELECT location_id, SUM(balance) AS passes, COUNT(*) AS holders
     FROM user_easypass_balances WHERE balance > 0 GROUP BY location_id`
  );
  return rows;
}

async function fetchRevenueEvents(db) {
  const [rows] = await db.query(
    `SELECT stripe_ref, kind, status, user_id, location_id, pack_id, credits, plan_code, list_cents,
            plus_discount_cents, promo_discount_cents, paid_cents, refunded_cents, paid_at, created_at
     FROM revenue_events`
  );
  return rows;
}

async function fetchSubscriptionSummary(db) {
  const [rows] = await db.query(
    `SELECT sp.code AS plan_code, us.status, COUNT(*) AS count, MAX(sp.price_cents) AS price_cents
     FROM user_subscriptions us
     JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.stripe_subscription_id IS NOT NULL
     GROUP BY sp.code, us.status`
  );
  return rows;
}

async function fetchSubscriptionStarts(db) {
  const [rows] = await db.query('SELECT user_id, started_at FROM user_subscriptions WHERE started_at IS NOT NULL AND stripe_subscription_id IS NOT NULL');
  return rows;
}

async function fetchReferrals(db) {
  const [rows] = await db.query('SELECT referred_user_id, created_at FROM user_referrals');
  return rows;
}

export async function listMarketingSpend(db = pool) {
  const [rows] = await db.query(
    `SELECT id, DATE_FORMAT(month, '%Y-%m-01') AS month, channel, location_id, amount_cents, notes
     FROM marketing_spend ORDER BY month DESC, id DESC`
  );
  return rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents), location_id: Number(r.location_id) }));
}

// ---------- KPIs ----------

export function getTractionKpis({ locationId = null, db = pool, now = new Date(), fresh = false } = {}) {
  return memo(`traction:${locationId || 0}`, async () => {
    const [participations, users, matches] = await Promise.all([
      fetchParticipations(db),
      fetchUsers(db),
      fetchMatchesForOccupancy(db),
    ]);
    const traction = computeTraction({ participations, now, locationId });
    return {
      ok: true,
      ...traction,
      activation: computeActivation({ users, participations, now, locationId }),
      occupancy: computeFillRate({ matches, now, locationId }),
    };
  }, { bypass: fresh });
}

export function getMonetizationKpis({ locationId = null, db = pool, now = new Date(), fresh = false } = {}) {
  return memo(`monetization:${locationId || 0}`, async () => {
    const [revenueEvents, passTransactions, packs, balances, subscriptions] = await Promise.all([
      fetchRevenueEvents(db),
      fetchPassTransactions(db),
      fetchPacks(db),
      fetchBalances(db),
      fetchSubscriptionSummary(db),
    ]);
    return { ok: true, ...computeMonetization({ revenueEvents, passTransactions, packs, balances, subscriptions, now, locationId }) };
  }, { bypass: fresh });
}

export function getAcquisitionKpis({ locationId = null, db = pool, now = new Date(), fresh = false } = {}) {
  return memo(`acquisition:${locationId || 0}`, async () => {
    const [users, participations, passTransactions, subscriptionStarts, referrals, spendRows, revenueEvents] = await Promise.all([
      fetchUsers(db),
      fetchParticipations(db),
      fetchPassTransactions(db),
      fetchSubscriptionStarts(db),
      fetchReferrals(db),
      listMarketingSpend(db),
      fetchRevenueEvents(db),
    ]);
    return {
      ok: true,
      ...computeAcquisition({
        users,
        participations,
        purchaseTransactions: passTransactions.filter((t) => t.type === 'purchase'),
        subscriptionStarts,
        referrals,
        spendRows,
        revenueEvents,
        now,
        locationId,
      }),
    };
  }, { bypass: fresh });
}

// ---------- informe mensual para inversores ----------

export const INVESTOR_COLUMNS = [
  ['month', 'Mes'],
  ['active_players', 'Jugadores activos (MAU)'],
  ['new_players', 'Jugadores nuevos'],
  ['mom_retention', 'Retención mes a mes'],
  ['avg_frequency', 'Partidos por jugador activo'],
  ['occupancy', 'Ocupación de plazas'],
  ['registrations', 'Registros'],
  ['new_payers', 'Compradores nuevos'],
  ['revenue_eur', 'Ingresos (€)'],
  ['pack_revenue_eur', 'Ingresos packs (€)'],
  ['subscription_revenue_eur', 'Ingresos suscripciones (€)'],
  ['passes_sold', 'EasyPass vendidos'],
  ['paid_per_pass_eur', 'Precio efectivo por EasyPass (€)'],
  ['arppu_eur', 'Ingreso por comprador (€)'],
  ['spend_eur', 'Gasto en marketing (€)'],
  ['cac_new_payer_eur', 'CAC por comprador nuevo (€)'],
];

const eur = (cents) => (cents === null || cents === undefined ? null : Math.round(cents) / 100);

/** Una fila por mes juntando tracción, ocupación, ingresos y CAC. */
export async function getInvestorReport({ locationId = null, db = pool, now = new Date() } = {}) {
  const [traction, monetization, acquisition] = await Promise.all([
    getTractionKpis({ locationId, db, now }),
    getMonetizationKpis({ locationId, db, now }),
    getAcquisitionKpis({ locationId, db, now }),
  ]);
  const byMonth = (rows) => new Map(rows.map((r) => [r.month, r]));
  const money = byMonth(monetization.monthly);
  const acq = byMonth(acquisition.monthly);
  const occ = byMonth(traction.occupancy.monthly);

  const rows = traction.monthly.map((m) => ({
    month: m.month,
    partial: m.partial,
    active_players: m.active_players,
    new_players: m.new_players,
    mom_retention: m.mom_retention,
    avg_frequency: m.avg_frequency,
    occupancy: occ.get(m.month)?.fill_rate ?? null,
    registrations: acq.get(m.month)?.registrations ?? 0,
    new_payers: acq.get(m.month)?.new_payers ?? 0,
    revenue_eur: eur(money.get(m.month)?.revenue_cents ?? 0),
    pack_revenue_eur: eur(money.get(m.month)?.pack_revenue_cents ?? 0),
    subscription_revenue_eur: eur(money.get(m.month)?.subscription_revenue_cents ?? 0),
    passes_sold: money.get(m.month)?.passes_sold ?? 0,
    paid_per_pass_eur: eur(money.get(m.month)?.paid_per_pass_cents),
    arppu_eur: eur(money.get(m.month)?.arppu_cents),
    spend_eur: eur(acq.get(m.month)?.spend_cents ?? 0),
    cac_new_payer_eur: eur(acq.get(m.month)?.cac_per_new_payer_cents),
  }));

  return {
    ok: true,
    location_id: locationId,
    generated_at: new Date(now).toISOString(),
    current_month: madridMonthKey(now),
    columns: INVESTOR_COLUMNS.map(([key, label]) => ({ key, label })),
    rows,
    notes: [
      'Jugador activo: al menos un partido jugado en el mes (inscripción confirmada, partido disputado, hora de Madrid). Se excluyen las cuentas de administrador.',
      'Los ingresos son lo realmente cobrado por Stripe (con descuentos aplicados), tal y como lo paga el jugador.',
      'El mes en curso está incompleto.',
    ],
  };
}

/** CSV con punto y coma y coma decimal, para que Excel en español lo abra bien. */
export function investorReportToCsv(report) {
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'number' ? String(value).replace('.', ',') : String(value);
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = report.columns.map((c) => escape(c.label)).join(';');
  const lines = report.rows.map((row) => report.columns.map((c) => escape(row[c.key])).join(';'));
  return [header, ...lines].join('\n');
}

// ---------- gasto de marketing (para el CAC) ----------

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const VALID_LOCATIONS = new Set([0, 1, 2]);

/** Valida y normaliza el cuerpo de una entrada de gasto. Devuelve { value } o { error }. */
export function parseMarketingSpend(body, now = new Date()) {
  const month = String(body?.month || '').slice(0, 7);
  if (!MONTH_RE.test(month)) return { error: 'Mes inválido (usa AAAA-MM)' };
  if (month > madridMonthKey(now)) return { error: 'No se puede registrar gasto de un mes futuro' };

  const channel = String(body?.channel || 'general').trim().slice(0, 60) || 'general';

  const locationId = body?.location_id === undefined || body?.location_id === null || body?.location_id === '' ? 0 : Number(body.location_id);
  if (!VALID_LOCATIONS.has(locationId)) return { error: 'Sede inválida' };

  let cents;
  if (body?.amount_cents !== undefined && body?.amount_cents !== null && body?.amount_cents !== '') cents = Number(body.amount_cents);
  else if (body?.amount_eur !== undefined && body?.amount_eur !== null && body?.amount_eur !== '') cents = Math.round(Number(String(body.amount_eur).replace(',', '.')) * 100);
  else return { error: 'Indica el importe' };
  if (!Number.isInteger(cents) || cents <= 0 || cents > 100_000_000) return { error: 'Importe inválido' };

  const notes = String(body?.notes || '').trim().slice(0, 255) || null;
  return { value: { month, channel, location_id: locationId, amount_cents: cents, notes } };
}

export async function upsertMarketingSpend(entry, userId, db = pool) {
  await db.query(
    `INSERT INTO marketing_spend (month, channel, location_id, amount_cents, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE amount_cents = VALUES(amount_cents), notes = VALUES(notes), created_by = VALUES(created_by)`,
    [`${entry.month}-01`, entry.channel, entry.location_id, entry.amount_cents, entry.notes, userId || null]
  );
  clearKpiCache();
}

export async function deleteMarketingSpend(id, db = pool) {
  const [result] = await db.query('DELETE FROM marketing_spend WHERE id = ?', [id]);
  clearKpiCache();
  return result.affectedRows > 0;
}
