// Pack de datos para inversores: SOLO LECTURA. Escribe una carpeta con CSVs
// (Excel en español) y un RESUMEN.md con todo lo medido y lo que no se sabe.
// Solo datos agregados: ningún nombre, email ni id de jugador sale del servidor.
//
//   npm run investor:pack
//   npm run investor:pack -- --field-cost-valladolid=30.88 --field-cost-asturias=53.50   # alquiler por partido (€)
//   npm run investor:pack -- --out=/tmp/pack      # carpeta de salida
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../config/db.js';
import {
  MATCH_LOCATION_SQL,
  fetchBalances, fetchMatchesForOccupancy, fetchPacks, fetchParticipations, fetchPassTransactions,
  fetchReferrals, fetchRevenueEvents, fetchSubscriptionStarts, fetchSubscriptionSummary, fetchUsers,
  listMarketingSpend,
} from '../services/kpiService.js';
import {
  computeAcquisition, computeActivation, computeFillRate, computeMonetization, computeTraction, madridDayKey, madridMonthKey,
} from '../services/kpiMetrics.js';
import {
  computeMatchEconomics, computePassBuyers, computeRepeatFunnel, computeStageCurve, monthsSince, toCsv,
} from '../services/investorPackMetrics.js';
import { ACTIONS_PARAMS, ACTIONS_SQL } from '../routes/featureUsage.js';
import { ACTION_LABELS, FEATURES } from '../services/featureUsageRules.js';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const parseEur = (v) => (v === undefined || v === '' ? null : Number(String(v).replace(',', '.')));
// Alquiler del campo por partido, dado por el fundador (noviembre 2026). Se puede cambiar con los flags.
const FIELD_COST = {
  1: parseEur(arg('field-cost-valladolid') ?? '30.88'),
  2: parseEur(arg('field-cost-asturias') ?? '53.50'),
};
const now = new Date();
const outDir = path.resolve(arg('out') || `investor-pack-${madridDayKey(now)}`);
const SEDES = [[null, 'global'], [1, 'valladolid'], [2, 'asturias']];
const NOT_ADMIN = "COALESCE(u.role, 'player') <> 'admin'";
const eur = (c) => (c === null || c === undefined ? null : Math.round(Number(c)) / 100);
const pct = (v) => (v === null || v === undefined ? 'n/d' : `${(v * 100).toFixed(1).replace('.', ',')} %`);
const num = (v) => (v === null || v === undefined ? 'n/d' : String(v).replace('.', ','));

const errors = [];
async function safe(label, fn, fallback = null) {
  try {
    return await fn();
  } catch (error) {
    errors.push(`${label}: ${error?.message || error}`);
    return fallback;
  }
}
const q = async (sql, params = []) => (await pool.query(sql, params))[0];
const write = (file, rows, columns) => fs.writeFileSync(path.join(outDir, file), toCsv(rows || [], columns));

fs.mkdirSync(outDir, { recursive: true });

// ---------- lectura (las mismas consultas que el panel de KPIs) ----------
const [users, participations, matches, passTransactions, packs, balances, revenueEvents, subscriptions, subscriptionStarts, referrals, spendRows] =
  await Promise.all([
    fetchUsers(pool), fetchParticipations(pool), fetchMatchesForOccupancy(pool), fetchPassTransactions(pool),
    fetchPacks(pool), fetchBalances(pool), fetchRevenueEvents(pool), fetchSubscriptionSummary(pool),
    fetchSubscriptionStarts(pool), fetchReferrals(pool), safe('marketing_spend', () => listMarketingSpend(pool), []),
  ]);

const firstMatch = matches.reduce((min, m) => (!min || new Date(m.starts_at) < min ? new Date(m.starts_at) : min), null);
const firstUser = users
  .filter((u) => String(u.role || '').toLowerCase() !== 'admin' && u.created_at)
  .reduce((min, u) => (!min || new Date(u.created_at) < min ? new Date(u.created_at) : min), null);
const seriesStart = [firstMatch, firstUser].filter(Boolean).reduce((a, b) => (b < a ? b : a), now);
const months = monthsSince(seriesStart, now);

// Global: coste medio ponderado por los partidos de cada sede en los últimos 90 días.
const since90 = now.getTime() - 90 * 24 * 60 * 60 * 1000;
const recentBySede = { 1: 0, 2: 0 };
for (const m of matches) {
  const t = new Date(m.starts_at).getTime();
  if (t > since90 && t <= now.getTime() && recentBySede[Number(m.location_id)] !== undefined) recentBySede[Number(m.location_id)] += 1;
}
const recentTotal = recentBySede[1] + recentBySede[2];
const globalFieldCost = recentTotal && FIELD_COST[1] !== null && FIELD_COST[2] !== null
  ? Math.round(((FIELD_COST[1] * recentBySede[1] + FIELD_COST[2] * recentBySede[2]) / recentTotal) * 100) / 100
  : null;
const fieldCostFor = (loc) => (loc ? FIELD_COST[loc] : globalFieldCost);

// Precio de lista por partido y desglose por ciudad (para Oviedo / Avilés).
const matchList = await safe('partidos con precio', () => q(
  `SELECT m.id, m.starts_at, m.capacity, m.city, m.price_eur, ${MATCH_LOCATION_SQL} AS location_id,
          (SELECT COUNT(*) FROM inscriptions i WHERE i.match_id = m.id AND i.status IN ('confirmed','paid','active')) AS taken
   FROM matches m
   WHERE COALESCE(m.status,'scheduled') <> 'cancelled' AND m.starts_at < UTC_TIMESTAMP()`
), []);

// ---------- 1. serie mensual por sede ----------
const summary = {};
for (const [loc, slug] of SEDES) {
  const traction = computeTraction({ participations, now, months, locationId: loc });
  const activation = computeActivation({ users, participations, now, months, locationId: loc });
  const fill = computeFillRate({ matches, now, months, locationId: loc });
  const money = computeMonetization({ revenueEvents, passTransactions, packs, balances, subscriptions, now, months, locationId: loc });
  const acq = computeAcquisition({
    users, participations, purchaseTransactions: passTransactions.filter((t) => t.type === 'purchase'),
    subscriptionStarts, referrals, spendRows, revenueEvents, now, months, locationId: loc,
  });
  const by = (rows) => new Map((rows || []).map((r) => [r.month, r]));
  const fillBy = by(fill.monthly);
  const moneyBy = by(money.monthly);
  const acqBy = by(acq.monthly);
  const listBy = new Map();
  for (const m of matchList) {
    if (loc && Number(m.location_id) !== loc) continue;
    const key = madridMonthKey(m.starts_at);
    listBy.set(key, (listBy.get(key) || 0) + Number(m.taken || 0) * Number(m.price_eur || 0));
  }

  const monthly = traction.monthly.map((t) => {
    const f = fillBy.get(t.month) || {};
    const mo = moneyBy.get(t.month) || {};
    const a = acqBy.get(t.month) || {};
    return {
      month: t.month,
      partial: t.partial ? 'sí (mes en curso)' : '',
      matches: f.matches ?? 0,
      seats_taken: f.taken ?? 0,
      capacity: f.capacity ?? 0,
      fill_rate: f.fill_rate,
      full_matches: f.full_matches ?? 0,
      active_players: t.active_players,
      new_players: t.new_players,
      returning_players: t.returning_players,
      recurrent_players: t.recurrent_players,
      avg_frequency: t.avg_frequency,
      mom_retention: t.mom_retention,
      registrations: a.registrations ?? null,
      referred_registrations: a.referred_registrations ?? null,
      new_payers: a.new_payers ?? null,
      paying_users: mo.paying_users ?? null,
      revenue_eur: eur(mo.revenue_cents),
      pack_revenue_eur: eur(mo.pack_revenue_cents),
      subscription_revenue_eur: eur(mo.subscription_revenue_cents),
      passes_sold: mo.passes_sold ?? null,
      paid_per_pass_eur: eur(mo.paid_per_pass_cents),
      list_value_eur: Math.round((listBy.get(t.month) || 0) * 100) / 100,
      spend_eur: eur(a.spend_cents),
      cac_new_player_eur: eur(a.cac_per_new_player_cents),
      cac_new_payer_eur: eur(a.cac_per_new_payer_cents),
    };
  });
  write(`01_mensual_${slug}.csv`, monthly, [
    ['month', 'Mes'], ['partial', 'Incompleto'], ['matches', 'Partidos jugados'], ['seats_taken', 'Plazas ocupadas'],
    ['capacity', 'Plazas ofertadas'], ['fill_rate', 'Ocupación'], ['full_matches', 'Partidos llenos'],
    ['active_players', 'Jugadores activos (MAU)'], ['new_players', 'Jugadores nuevos (1.er partido)'],
    ['returning_players', 'Jugadores que repiten'], ['recurrent_players', 'Jugadores con 2+ partidos en el mes'],
    ['avg_frequency', 'Partidos por jugador activo'], ['mom_retention', 'Retención mes a mes'],
    ['registrations', 'Registros'], ['referred_registrations', 'Registros por invitación'], ['new_payers', 'Compradores nuevos'],
    ['paying_users', 'Jugadores que pagan en el mes'], ['revenue_eur', 'Ingresos Stripe (€)'], ['pack_revenue_eur', 'Ingresos EasyPass (€)'], ['subscription_revenue_eur', 'Ingresos Plus (€)'],
    ['passes_sold', 'EasyPass vendidos'], ['paid_per_pass_eur', 'Precio efectivo por EasyPass (€)'],
    ['list_value_eur', 'Plazas × precio de lista (€)'], ['spend_eur', 'Gasto marketing (€)'],
    ['cac_new_player_eur', 'CAC por jugador nuevo (€)'], ['cac_new_payer_eur', 'CAC por comprador nuevo (€)'],
  ]);

  // cohortes
  write(`02_cohortes_${slug}.csv`, traction.retention.cohorts.map((c) => {
    const row = { cohort: c.cohort_month, size: c.size };
    c.rates.forEach((r, i) => { row[`m${i}`] = r; });
    return row;
  }), [['cohort', 'Cohorte (mes del 1.er partido)'], ['size', 'Jugadores'], ...Array.from({ length: 13 }, (_, i) => [`m${i}`, `Mes +${i}`])]);

  const funnel = computeRepeatFunnel(participations, { now, locationId: loc });
  const buyers = computePassBuyers(passTransactions, { locationId: loc });
  const listPrices = matchList.filter((m) => (!loc || Number(m.location_id) === loc) && Number(m.price_eur) > 0).map((m) => Number(m.price_eur));
  const listPrice = listPrices.length ? listPrices.reduce((s, v) => s + v, 0) / listPrices.length : null;
  const economics = computeMatchEconomics({
    fillRate: fill, effectivePassCents: money.effective_price?.last_90d?.paid_per_pass_cents ?? money.effective_price?.all_time?.paid_per_pass_cents ?? null,
    listPricePerSeatEur: listPrice, fieldCostEur: fieldCostFor(loc),
  });

  summary[slug] = { traction, activation, fill, money, acq, funnel, buyers, economics, monthly, listPrice };
}

// ---------- 2. embudo de repetición ----------
const funnelRows = [];
for (const [, slug] of SEDES) {
  const f = summary[slug].funnel;
  for (const [scope, data] of [['todos', f.lifetime], [`1.er partido hace ${f.mature_days}+ días`, f.mature]]) {
    for (const s of data.steps) funnelRows.push({ sede: slug, scope, base: data.players, n: s.match_n, players: s.players, rate: s.rate });
  }
}
write('03_repeticion.csv', funnelRows, [['sede', 'Sede'], ['scope', 'Base'], ['base', 'Jugadores con 1+ partido'], ['n', 'Llegan al partido n.º'], ['players', 'Jugadores'], ['rate', '%']]);
write('03b_distribucion_partidos_por_jugador.csv', SEDES.map(([, slug]) => ({ sede: slug, ...summary[slug].funnel.distribution, avg: summary[slug].funnel.avg_matches_per_player_lifetime })),
  [['sede', 'Sede'], ['1', '1 partido'], ['2', '2'], ['3-4', '3-4'], ['5-9', '5-9'], ['10-19', '10-19'], ['20+', '20+'], ['avg', 'Media por jugador']]);

// ---------- 3. base de usuarios ----------
const base = await safe('base de usuarios', async () => {
  const [[r]] = await pool.query(
    `SELECT COUNT(*) AS registered,
            SUM(u.preferred_location = 'valladolid') AS reg_valladolid,
            SUM(u.preferred_location = 'asturias') AS reg_asturias,
            SUM(u.preferred_location IS NULL OR u.preferred_location NOT IN ('valladolid','asturias')) AS reg_no_sede
     FROM users u WHERE ${NOT_ADMIN}`
  );
  return r;
}, {});

// ---------- 4. Plus y EasyPass ----------
const plus = await safe('suscriptores Plus', async () => {
  const rows = await q(
    `SELECT x.user_id, MAX(x.paid) AS paid FROM (
       SELECT us.user_id, us.stripe_subscription_id IS NOT NULL AS paid, us.status, us.current_period_end
       FROM user_subscriptions us JOIN subscription_plans sp ON sp.id = us.plan_id WHERE sp.code IN ('plus','pro')
       UNION ALL
       SELECT ups.user_id, ups.stripe_subscription_id IS NOT NULL, ups.status, ups.current_period_end FROM user_plus_subscriptions ups
     ) x JOIN users u ON u.id = x.user_id
     WHERE x.status IN ('active','trialing') AND (x.current_period_end IS NULL OR x.current_period_end > UTC_TIMESTAMP()) AND ${NOT_ADMIN}
     GROUP BY x.user_id`
  );
  const [[ever]] = await pool.query(
    `SELECT COUNT(DISTINCT s.user_id) AS n FROM (
       SELECT user_id FROM user_subscriptions WHERE stripe_subscription_id IS NOT NULL
       UNION SELECT user_id FROM user_plus_subscriptions WHERE stripe_subscription_id IS NOT NULL) s
     JOIN users u ON u.id = s.user_id WHERE ${NOT_ADMIN}`
  );
  return { active_total: rows.length, active_paid: rows.filter((r) => Number(r.paid)).length, active_gift: rows.filter((r) => !Number(r.paid)).length, paid_ever: Number(ever.n) };
}, {});
const passRows = SEDES.map(([, slug]) => ({ sede: slug, ...summary[slug].buyers }));
write('04_easypass_compradores.csv', passRows, [['sede', 'Sede'], ['buyers', 'Compradores'], ['orders', 'Compras'], ['passes', 'EasyPass comprados'],
  ['orders_per_buyer', 'Compras por comprador'], ['passes_per_buyer', 'EasyPass por comprador'], ['repeat_buyers', 'Compradores que repiten'], ['repeat_buyer_rate', '% que repite compra']]);

// ---------- 5. economía por partido ----------
write('05_economia_por_partido.csv', SEDES.map(([, slug]) => ({ sede: slug, list_price: summary[slug].listPrice === null ? null : Math.round(summary[slug].listPrice * 100) / 100, ...summary[slug].economics })), [
  ['sede', 'Sede'], ['avg_players_per_match_90d', 'Jugadores por partido (90 d)'], ['fill_rate_90d', 'Ocupación (90 d)'],
  ['list_price', 'Precio de lista medio (€)'], ['revenue_per_seat_eur', 'Ingreso por plaza (€)'], ['revenue_per_seat_source', 'Origen del ingreso por plaza'],
  ['revenue_per_match_eur', 'Ingreso por partido (€)'], ['field_cost_per_match_eur', 'Coste campo por partido (€)'],
  ['margin_per_match_eur', 'Margen por partido (€)'], ['margin_rate', 'Margen %'],
]);

// ---------- 6. Asturias vs Valladolid en la misma etapa ----------
const stageV = computeStageCurve({ participations, matches, locationId: 1 });
const stageA = computeStageCurve({ participations, matches, locationId: 2 });
const stageRows = [];
for (let i = 0; i < Math.max(stageV.rows.length, stageA.rows.length); i += 1) {
  const v = stageV.rows[i] || {};
  const a = stageA.rows[i] || {};
  stageRows.push({ stage: i + 1, v_month: v.month, v_matches: v.matches, v_active: v.active_players, v_new: v.new_players, v_cum: v.cumulative_players, v_fill: v.fill_rate,
    a_month: a.month, a_matches: a.matches, a_active: a.active_players, a_new: a.new_players, a_cum: a.cumulative_players, a_fill: a.fill_rate });
}
write('06_asturias_vs_valladolid_misma_etapa.csv', stageRows, [
  ['stage', 'Mes de vida de la sede'],
  ['v_month', 'Valladolid: mes'], ['v_matches', 'Valladolid: partidos'], ['v_active', 'Valladolid: activos'], ['v_new', 'Valladolid: nuevos'], ['v_cum', 'Valladolid: jugadores acumulados'], ['v_fill', 'Valladolid: ocupación'],
  ['a_month', 'Asturias: mes'], ['a_matches', 'Asturias: partidos'], ['a_active', 'Asturias: activos'], ['a_new', 'Asturias: nuevos'], ['a_cum', 'Asturias: jugadores acumulados'], ['a_fill', 'Asturias: ocupación'],
]);
// Agrupado aquí y no en SQL: CONVERT_TZ devuelve NULL si MySQL no tiene cargadas las zonas horarias.
const cityMap = new Map();
for (const m of matchList) {
  if (!Number(m.taken)) continue;
  const key = `${madridMonthKey(m.starts_at)}|${m.city}`;
  const r = cityMap.get(key) || { month: madridMonthKey(m.starts_at), city: m.city, matches: 0, seats: 0, capacity: 0 };
  r.matches += 1;
  r.seats += Number(m.taken);
  r.capacity += Number(m.capacity) || 0;
  cityMap.set(key, r);
}
const cityRows = [...cityMap.values()].sort((a, b) => a.month.localeCompare(b.month) || String(a.city).localeCompare(String(b.city), 'es'));
const cityPlayers = await safe('jugadores por ciudad', () => q(
  `SELECT m.city, COUNT(DISTINCT COALESCE(i.assigned_user_id, i.user_id)) AS players,
          MIN(m.starts_at) AS first_match
   FROM inscriptions i JOIN matches m ON m.id = i.match_id JOIN users u ON u.id = COALESCE(i.assigned_user_id, i.user_id)
   WHERE i.status IN ('confirmed','paid','active') AND COALESCE(m.status,'scheduled') <> 'cancelled' AND m.starts_at < UTC_TIMESTAMP() AND ${NOT_ADMIN}
   GROUP BY m.city ORDER BY players DESC`
), []);
write('06b_partidos_por_ciudad_y_mes.csv', (cityRows || []).map((r) => ({ ...r, fill: Number(r.capacity) ? Math.round((Number(r.seats) / Number(r.capacity)) * 1000) / 1000 : null })),
  [['month', 'Mes'], ['city', 'Ciudad'], ['matches', 'Partidos'], ['seats', 'Plazas ocupadas'], ['capacity', 'Plazas ofertadas'], ['fill', 'Ocupación']]);
write('06c_jugadores_por_ciudad.csv', (cityPlayers || []).map((r) => ({ ...r, first_match: r.first_match ? madridDayKey(r.first_match) : null })),
  [['city', 'Ciudad'], ['players', 'Jugadores distintos (histórico)'], ['first_match', 'Primer partido']]);

// ---------- 7. uso de funciones (ecosistema) ----------
const sinceAll = new Date('2000-01-01T00:00:00Z');
const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
const actionUsers = async (since) => q(
  `SELECT a.feature, a.action, COUNT(DISTINCT a.user_id) AS users, COUNT(*) AS events
   FROM (${ACTIONS_SQL}) a JOIN users u ON u.id = a.user_id WHERE ${NOT_ADMIN} GROUP BY a.feature, a.action`,
  Array(ACTIONS_PARAMS).fill(since)
);
const [actionsAll, actions30] = await Promise.all([safe('acciones (histórico)', () => actionUsers(sinceAll), []), safe('acciones (30 d)', () => actionUsers(since30), [])]);
const visits30 = await safe('visitas (30 d)', () => q(
  `SELECT d.feature, COUNT(DISTINCT d.user_id) AS users FROM feature_usage_daily d JOIN users u ON u.id = d.user_id
   WHERE d.used_on >= ? AND ${NOT_ADMIN} GROUP BY d.feature`, [since30.toISOString().slice(0, 10)]
), []);
const trackingSince = await safe('inicio medición visitas', async () => (await q('SELECT MIN(used_on) AS d FROM feature_usage_daily'))[0]?.d, null);

const featureLabel = Object.fromEntries(FEATURES.map((f) => [f.key, f.label]));
const g = summary.global;
const playersEver = g.traction.current.players_ever;
const mau30 = g.traction.current.mau_last_30d;
const appUsers30 = Number((visits30 || []).find((v) => v.feature === 'app')?.users || 0);
const a30 = new Map((actions30 || []).map((r) => [`${r.feature}:${r.action}`, r]));
const featureRows = (actionsAll || []).map((r) => {
  const recent = a30.get(`${r.feature}:${r.action}`);
  return {
    feature: featureLabel[r.feature] || r.feature, action: ACTION_LABELS[r.action] || r.action,
    users_all: Number(r.users), events_all: Number(r.events), pct_players_ever: playersEver ? Math.round((Number(r.users) / playersEver) * 1000) / 1000 : null,
    users_30d: Number(recent?.users || 0), events_30d: Number(recent?.events || 0),
    pct_mau_30d: mau30 ? Math.round((Number(recent?.users || 0) / mau30) * 1000) / 1000 : null,
  };
});
const visitRows = (visits30 || []).map((v) => ({ feature: v.feature === 'app' ? 'Abren la app' : featureLabel[v.feature] || v.feature, users: Number(v.users),
  pct: appUsers30 ? Math.round((Number(v.users) / appUsers30) * 1000) / 1000 : null }));

// Funciones con su propia tabla (no están en el panel de uso).
const EXTRA = [
  ['Partidos con eventos en directo (goles/paradas/MVP)', `SELECT COUNT(DISTINCT match_id) AS v FROM match_live_events`],
  ['Eventos en directo registrados', `SELECT COUNT(*) AS v FROM match_live_events`],
  ['Partidos con estadísticas individuales', `SELECT COUNT(DISTINCT match_id) AS v FROM match_player_stats`],
  ['Partidos con vídeo subido', `SELECT COUNT(*) AS v FROM matches WHERE video_available_at IS NOT NULL`],
  ['Partidos jugados (total)', `SELECT COUNT(*) AS v FROM matches m WHERE COALESCE(m.status,'scheduled') <> 'cancelled' AND m.starts_at < UTC_TIMESTAMP()`],
  ['Votaciones "El 8 de la semana" celebradas', `SELECT COUNT(*) AS v FROM weekly_lineup_polls`],
  ['Votos totales "El 8 de la semana"', `SELECT COUNT(*) AS v FROM weekly_lineup_votes`],
  ['Jugadores que han votado alguna vez', `SELECT COUNT(DISTINCT user_id) AS v FROM weekly_lineup_votes`],
  ['Amistades aceptadas', `SELECT COUNT(*) AS v FROM friendships WHERE status = 'accepted'`],
  ['Jugadores con al menos 1 amigo', `SELECT COUNT(DISTINCT x.id) AS v FROM (SELECT requester_id AS id FROM friendships WHERE status='accepted' UNION SELECT addressee_id FROM friendships WHERE status='accepted') x`],
  ['Ligas entre amigos activas', `SELECT COUNT(*) AS v FROM friend_leagues WHERE status = 'active'`],
  ['Jugadores en una liga activa', `SELECT COUNT(DISTINCT m.user_id) AS v FROM friend_league_members m JOIN friend_leagues l ON l.id = m.league_id WHERE m.status='accepted' AND l.status='active'`],
  ['Logros desbloqueados', `SELECT COUNT(*) AS v FROM user_achievements`],
  ['Jugadores con algún logro', `SELECT COUNT(DISTINCT user_id) AS v FROM user_achievements`],
  ['Jugadores con EasyPoints', `SELECT COUNT(DISTINCT user_id) AS v FROM easypoints_ledger`],
  ['Fotos subidas a perfiles', `SELECT COUNT(*) AS v FROM player_profile_photos`],
  ['Comentarios en perfiles', `SELECT COUNT(*) AS v FROM player_profile_comments`],
  ['Visitas a perfiles (jugador-día)', `SELECT COUNT(*) AS v FROM profile_views`],
  ['Valoraciones de partidos', `SELECT COUNT(*) AS v FROM match_feedback WHERE dismissed = 0`],
  ['Nota media al organizador (1-5)', `SELECT ROUND(AVG(organizer_rating),2) AS v FROM match_feedback WHERE dismissed = 0 AND organizer_rating IS NOT NULL`],
  ['Nota media al campo (1-5)', `SELECT ROUND(AVG(field_rating),2) AS v FROM match_feedback WHERE dismissed = 0 AND field_rating IS NOT NULL`],
  ['% valoraciones "equipos equilibrados"', `SELECT ROUND(AVG(teams_balance = 'balanced'),3) AS v FROM match_feedback WHERE dismissed = 0 AND teams_balance IS NOT NULL`],
  ['Entradas en lista de espera', `SELECT COUNT(*) AS v FROM match_waitlist`],
  ['Invitaciones a partidos enviadas', `SELECT COUNT(*) AS v FROM match_invitations`],
  ['Entradas regaladas/reclamadas por otro jugador', `SELECT COUNT(*) AS v FROM inscriptions WHERE assigned_user_id IS NOT NULL AND assigned_user_id <> user_id`],
  ['Invitaciones (referidos) registradas', `SELECT COUNT(*) AS v FROM user_referrals`],
  ['EasyPass regalados', `SELECT COUNT(*) AS v FROM easypass_gifts`],
  ['EasyPass en saldo sin gastar', `SELECT COALESCE(SUM(balance),0) AS v FROM user_easypass_balances WHERE balance > 0`],
];
const extraRows = [];
for (const [label, sql] of EXTRA) {
  const value = await safe(label, async () => (await q(sql))[0]?.v, null);
  extraRows.push({ label, value: value === null ? 'n/d' : Number(value) });
}
write('07_funciones_acciones.csv', featureRows, [['feature', 'Función'], ['action', 'Acción'], ['users_all', 'Jugadores (histórico)'], ['events_all', 'Veces (histórico)'],
  ['pct_players_ever', '% de jugadores que han jugado'], ['users_30d', 'Jugadores (30 d)'], ['events_30d', 'Veces (30 d)'], ['pct_mau_30d', '% de activos 30 d']]);
write('07b_funciones_visitas_30d.csv', visitRows, [['feature', 'Apartado'], ['users', 'Jugadores que entran (30 d)'], ['pct', '% de quienes abren la app']]);
write('07c_ecosistema_totales.csv', extraRows, [['label', 'Dato'], ['value', 'Valor']]);

// ---------- 8. ingresos totales y calidad del dato ----------
const revenueTotals = await safe('ingresos totales', async () => (await q(
  `SELECT kind, status, COUNT(*) AS n, SUM(paid_cents) AS paid, SUM(refunded_cents) AS refunded, MIN(COALESCE(paid_at, created_at)) AS first_at
   FROM revenue_events GROUP BY kind, status`
)), []);
write('08_ingresos_stripe_totales.csv', (revenueTotals || []).map((r) => ({ ...r, paid: eur(r.paid), refunded: eur(r.refunded), first_at: r.first_at ? madridDayKey(r.first_at) : null })),
  [['kind', 'Tipo'], ['status', 'Estado'], ['n', 'Operaciones'], ['paid', 'Cobrado (€)'], ['refunded', 'Devuelto (€)'], ['first_at', 'Primera operación']]);
write('08b_gasto_marketing.csv', spendRows.map((r) => ({ ...r, amount: eur(r.amount_cents) })), [['month', 'Mes'], ['channel', 'Canal'], ['location_id', 'Sede (0 = todas)'], ['amount', 'Importe (€)'], ['notes', 'Notas']]);

// ---------- RESUMEN.md ----------
const sedeLine = (slug) => {
  const s = summary[slug];
  const c = s.traction.current;
  const r = s.funnel.mature.steps;
  const rate = (n) => pct(r.find((x) => x.match_n === n)?.rate);
  return `| ${slug} | ${c.players_ever} | ${c.mau_last_30d} | ${c.wau_last_7d} | ${num(s.fill.last_90d.fill_rate !== null ? Math.round(s.fill.last_90d.fill_rate * 1000) / 10 : null)} % | ${rate(2)} | ${rate(3)} | ${rate(5)} | ${num(s.traction.frequency.avg_matches_per_active_player_last_3_full_months)} |`;
};
const revAll = (summary.global.monthly || []).reduce((t, m) => t + (m.revenue_eur || 0), 0);
const listAll = (summary.global.monthly || []).reduce((t, m) => t + (m.list_value_eur || 0), 0);
const dq = summary.global.money.data_quality || {};
const ep = summary.global.money.effective_price || {};
const md = `# Pack de datos EasyFutbol — ${madridDayKey(now)}

Generado en el servidor, solo lectura, solo datos agregados. Cuentas de administrador excluidas.
Primer partido en la app: **${firstMatch ? madridDayKey(firstMatch) : 'n/d'}**; primer registro: **${firstUser ? madridDayKey(firstUser) : 'n/d'}** (${months} meses de serie).
Mes en curso incompleto: no usarlo en medias ni en crecimiento.

## Foto actual

| Sede | Han jugado alguna vez | Activos 30 d | Activos 7 d | Ocupación 90 d | Llegan al 2.º | 3.º | 5.º | Partidos/jugador activo/mes (3 meses) |
|---|---|---|---|---|---|---|---|---|
${SEDES.map(([, s]) => sedeLine(s)).join('\n')}

(Repetición calculada solo con jugadores cuyo 1.er partido fue hace 60+ días; la cifra con todos está en 03_repeticion.csv.)

- Registrados (sin admin): **${num(base?.registered)}** — Valladolid ${num(base?.reg_valladolid)}, Asturias ${num(base?.reg_asturias)}, sin sede ${num(base?.reg_no_sede)}
- Han jugado al menos una vez: **${playersEver}** → ${pct(base?.registered ? playersEver / Number(base.registered) : null)} de los registrados
- Registro → 1.er partido en sus primeros 30 días: ${pct(summary.global.activation?.overall?.rate_30d ?? null)} (solo cuentas con 30+ días de antigüedad); en 7 días: ${pct(summary.global.activation?.overall?.rate_7d ?? null)}
- Partidos jugados (total): ver 07c_ecosistema_totales.csv
- Plus activos ahora: **${num(plus?.active_total)}** (de pago ${num(plus?.active_paid)}, regalados ${num(plus?.active_gift)}); han pagado Plus alguna vez: ${num(plus?.paid_ever)}
- EasyPass: ${num(summary.global.buyers.buyers)} compradores, ${num(summary.global.buyers.orders_per_buyer)} compras y ${num(summary.global.buyers.passes_per_buyer)} EasyPass por comprador, ${pct(summary.global.buyers.repeat_buyer_rate)} repite compra

## Dinero

- Cobrado por Stripe en la serie (bruto, IVA incluido si los precios lo incluyen): **${num(Math.round(revAll * 100) / 100)} €**
- Plazas ocupadas × precio de lista del partido: ${num(Math.round(listAll * 100) / 100)} € (referencia, no es caja)
- Precio efectivo por EasyPass: ${num(eur(ep.last_90d?.paid_per_pass_cents ?? null))} € (90 d), ${num(eur(ep.all_time?.paid_per_pass_cents ?? null))} € (histórico)
- Cobertura del libro de ingresos: ${num(dq.purchases_in_ledger)} de ${num(dq.purchases_with_stripe_ref)} compras con referencia de Stripe; ${num(dq.purchases_without_stripe_ref)} compras sin referencia (no se pueden leer); última sincronización ${dq.last_ledger_entry_at || 'n/d'}
- Alquiler del campo por partido: Valladolid ${num(FIELD_COST[1])} €, Asturias ${num(FIELD_COST[2])} €; global ponderado por partidos de los últimos 90 días (${recentBySede[1]} en Valladolid, ${recentBySede[2]} en Asturias): ${num(globalFieldCost)} €
${SEDES.map(([, slug]) => { const e = summary[slug].economics; return `- Ingreso por partido (90 d, ${slug}): ${num(e.revenue_per_match_eur)} € → margen tras campo ${num(e.margin_per_match_eur)} € (${pct(e.margin_rate)})`; }).join('\n')}
- Origen del ingreso por plaza: ${summary.global.economics.revenue_per_seat_source}. El margen es solo tras el campo: no incluye costes fijos, comisiones de Stripe ni IVA.
- Gasto en marketing registrado: ${spendRows.length ? `${spendRows.length} entradas (08b)` : '**no hay ninguno registrado → CAC = no lo sé**'}

## Lo que la base de datos NO sabe (hay que aportarlo a mano)

- Ingresos anteriores a la app o cobrados fuera de Stripe (efectivo, Bizum, transferencias).
- Coste del alquiler del campo por partido y costes fijos mensuales (herramientas, grabación, servidor, Apple/Google).
- Gasto en publicidad por mes y canal (se puede meter en Panel → KPIs → CAC y volver a ejecutar esto).
- Canal de captación (Instagram, boca a boca...): la app solo distingue "llegó por invitación de otro jugador" (columna Registros por invitación).
- Aperturas de la app antes de ${trackingSince ? madridDayKey(trackingSince) : 'que empezase la medición'}: las visitas por apartado solo existen desde entonces y solo con la app actualizada.

## Archivos

${fs.readdirSync(outDir).filter((f) => f.endsWith('.csv')).sort().map((f) => `- ${f}`).join('\n')}
${errors.length ? `\n## Secciones que fallaron (el resto es válido)\n\n${errors.map((e) => `- ${e}`).join('\n')}\n` : ''}`;
fs.writeFileSync(path.join(outDir, 'RESUMEN.md'), md);
fs.writeFileSync(path.join(outDir, 'datos.json'), JSON.stringify({ generated_at: now.toISOString(), base, plus, summary: Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, { ...v, monthly: undefined }])) }, null, 2));

console.log(`Pack escrito en ${outDir}`);
if (errors.length) console.warn(`Secciones con error (${errors.length}):\n- ${errors.join('\n- ')}`);
await pool.end();
