// Cálculos del pack de datos para inversores que no cubre kpiMetrics.js.
// Sin base de datos: se prueban con datos a mano (test/investorPackMetrics.test.js).
import { buildPlayerTimelines, madridMonthKey, monthIndex, monthFromIndex } from './kpiMetrics.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ratio = (a, b) => (b > 0 ? a / b : null);
const round = (v, d = 4) => (v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d);
const toTime = (v) => (v instanceof Date ? v.getTime() : new Date(v).getTime());

/** Meses desde el primero con actividad hasta el actual (incluido). Mínimo 1. */
export function monthsSince(firstDate, now = new Date()) {
  if (!firstDate) return 1;
  return Math.max(1, monthIndex(madridMonthKey(now)) - monthIndex(madridMonthKey(firstDate)) + 1);
}

export const REPEAT_STEPS = [2, 3, 5, 10, 20];

/**
 * Embudo de repetición: de los que jugaron 1 partido, cuántos llegan al 2.º, 3.º, 5.º...
 * - lifetime: todos los jugadores (los recién llegados aún no han tenido tiempo: tira a la baja).
 * - mature: solo jugadores cuyo primer partido fue hace >= matureDays (comparación justa).
 */
export function computeRepeatFunnel(participations, { now = new Date(), locationId = null, matureDays = 60 } = {}) {
  const timelines = buildPlayerTimelines(participations, { locationId });
  const nowTime = toTime(now);
  const build = (list) => {
    const total = list.length;
    const steps = REPEAT_STEPS.map((n) => {
      const reached = list.filter((t) => t.length >= n).length;
      return { match_n: n, players: reached, rate: round(ratio(reached, total)) };
    });
    return { players: total, steps };
  };
  const all = [...timelines.values()];
  const mature = all.filter((t) => nowTime - t[0].t >= matureDays * DAY_MS);

  const distribution = { '1': 0, '2': 0, '3-4': 0, '5-9': 0, '10-19': 0, '20+': 0 };
  for (const t of all) {
    const n = t.length;
    if (n === 1) distribution['1'] += 1;
    else if (n === 2) distribution['2'] += 1;
    else if (n <= 4) distribution['3-4'] += 1;
    else if (n <= 9) distribution['5-9'] += 1;
    else if (n <= 19) distribution['10-19'] += 1;
    else distribution['20+'] += 1;
  }
  const totalMatches = all.reduce((s, t) => s + t.length, 0);
  return {
    location_id: locationId,
    mature_days: matureDays,
    lifetime: build(all),
    mature: build(mature),
    distribution,
    avg_matches_per_player_lifetime: round(ratio(totalMatches, all.length), 2),
  };
}

/**
 * Cada sede contada desde SU primer partido (mes 1, mes 2...), para comparar
 * Asturias con Valladolid en la misma etapa de vida.
 */
export function computeStageCurve({ participations, matches, locationId, maxMonths = 24 }) {
  const parts = participations.filter((p) => Number(p.location_id) === Number(locationId));
  const own = matches.filter((m) => Number(m.location_id) === Number(locationId));
  const times = own.map((m) => toTime(m.starts_at)).filter(Number.isFinite);
  if (!times.length) return { location_id: locationId, first_match_month: null, rows: [] };
  const startIndex = monthIndex(madridMonthKey(Math.min(...times)));
  const rows = new Map();
  const row = (i) => {
    if (!rows.has(i)) rows.set(i, { stage_month: i + 1, month: monthFromIndex(startIndex + i), matches: 0, capacity: 0, taken: 0, players: new Set(), tickets: 0 });
    return rows.get(i);
  };
  for (const m of own) {
    const i = monthIndex(madridMonthKey(m.starts_at)) - startIndex;
    if (i < 0 || i >= maxMonths) continue;
    const r = row(i);
    r.matches += 1;
    r.capacity += Number(m.capacity) || 0;
    r.taken += Math.min(Number(m.taken) || 0, Number(m.capacity) || Number(m.taken) || 0);
  }
  const firstSeen = new Map();
  for (const p of parts) {
    const i = monthIndex(madridMonthKey(p.starts_at)) - startIndex;
    if (i < 0 || i >= maxMonths) continue;
    const r = row(i);
    r.players.add(Number(p.player_id));
    r.tickets += 1;
    const prev = firstSeen.get(Number(p.player_id));
    if (prev === undefined || i < prev) firstSeen.set(Number(p.player_id), i);
  }
  const newBy = new Map();
  for (const i of firstSeen.values()) newBy.set(i, (newBy.get(i) || 0) + 1);
  let cumulative = 0;
  const out = [...rows.values()].sort((a, b) => a.stage_month - b.stage_month).map((r) => {
    const newPlayers = newBy.get(r.stage_month - 1) || 0;
    cumulative += newPlayers;
    return {
      stage_month: r.stage_month,
      month: r.month,
      matches: r.matches,
      tickets: r.tickets,
      active_players: r.players.size,
      new_players: newPlayers,
      cumulative_players: cumulative,
      fill_rate: round(ratio(r.taken, r.capacity)),
      avg_players_per_match: round(ratio(r.taken, r.matches), 1),
    };
  });
  return { location_id: locationId, first_match_month: monthFromIndex(startIndex), rows: out };
}

/** Compras de EasyPass por comprador (sin las compras manuales de prueba). */
export function computePassBuyers(passTransactions, { locationId = null } = {}) {
  const purchases = passTransactions.filter(
    (t) => t.type === 'purchase' && Number(t.amount) > 0 && !String(t.payment_reference || '').startsWith('manual_')
      && (!locationId || Number(t.location_id) === Number(locationId))
  );
  const byUser = new Map();
  for (const t of purchases) {
    const e = byUser.get(t.user_id) || { orders: 0, passes: 0 };
    e.orders += 1;
    e.passes += Number(t.amount);
    byUser.set(t.user_id, e);
  }
  const buyers = [...byUser.values()];
  const repeatBuyers = buyers.filter((b) => b.orders >= 2).length;
  return {
    location_id: locationId,
    buyers: buyers.length,
    orders: purchases.length,
    passes: buyers.reduce((s, b) => s + b.passes, 0),
    orders_per_buyer: round(ratio(purchases.length, buyers.length), 2),
    passes_per_buyer: round(ratio(buyers.reduce((s, b) => s + b.passes, 0), buyers.length), 2),
    repeat_buyers: repeatBuyers,
    repeat_buyer_rate: round(ratio(repeatBuyers, buyers.length)),
  };
}

/**
 * Economía por partido. El coste del campo no está en la base de datos: si se
 * pasa (fieldCostEur por partido) se calcula el margen; si no, queda en null.
 */
export function computeMatchEconomics({ fillRate, effectivePassCents, listPricePerSeatEur, fieldCostEur = null }) {
  const seats = fillRate?.last_90d?.avg_players_per_match ?? null;
  const perSeat = effectivePassCents ? effectivePassCents / 100 : listPricePerSeatEur ?? null;
  const revenue = seats !== null && perSeat !== null ? seats * perSeat : null;
  return {
    avg_players_per_match_90d: seats,
    fill_rate_90d: fillRate?.last_90d?.fill_rate ?? null,
    revenue_per_seat_eur: perSeat === null ? null : round(perSeat, 2),
    revenue_per_seat_source: effectivePassCents ? 'precio efectivo cobrado por EasyPass (Stripe)' : 'precio de lista del partido',
    revenue_per_match_eur: revenue === null ? null : round(revenue, 2),
    field_cost_per_match_eur: fieldCostEur,
    margin_per_match_eur: revenue !== null && fieldCostEur !== null ? round(revenue - fieldCostEur, 2) : null,
    margin_rate: revenue && fieldCostEur !== null ? round((revenue - fieldCostEur) / revenue) : null,
  };
}

/** CSV con punto y coma y coma decimal (Excel en español). */
export function toCsv(rows, columns) {
  const cols = columns || (rows.length ? Object.keys(rows[0]).map((k) => [k, k]) : []);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const text = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [cols.map(([, label]) => esc(label)).join(';'), ...rows.map((r) => cols.map(([key]) => esc(r[key])).join(';'))].join('\n') + '\n';
}
