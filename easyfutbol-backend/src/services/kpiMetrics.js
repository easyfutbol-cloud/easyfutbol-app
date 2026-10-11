// Cálculos de los KPIs de negocio (tracción, monetización y adquisición).
// Son funciones puras: reciben filas ya leídas de la base de datos y devuelven
// objetos JSON, sin tocar la base de datos. Así se pueden comprobar con casos
// de prueba y cualquier cifra del dashboard se puede reproducir a mano.
//
// Definiciones (las mismas que se enseñan en la app):
// - Participación: inscripción confirmada en un partido ya disputado y no
//   cancelado. Jugador = COALESCE(assigned_user_id, user_id): la persona a la
//   que se asignó la entrada, o quien la compró si nadie la reclamó.
// - Jugador activo del mes: al menos una participación ese mes natural
//   (hora de Madrid). Un mismo jugador en un mismo partido cuenta una vez.
// - Todas las fechas se guardan en UTC; los meses se cortan en hora de Madrid.

const TIME_ZONE = 'Europe/Madrid';
const DAY_MS = 24 * 60 * 60 * 1000;

const monthFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit' });
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

const asTime = (value) => {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

// ---------- meses (clave "AAAA-MM", en hora de Madrid) ----------

export function madridMonthKey(value) {
  const time = asTime(value);
  if (time === null) return null;
  const parts = monthFormatter.formatToParts(new Date(time));
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}`;
}

export function madridDayKey(value) {
  const time = asTime(value);
  if (time === null) return null;
  const parts = dayFormatter.formatToParts(new Date(time));
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}-${parts.find((p) => p.type === 'day').value}`;
}

export const monthIndex = (key) => {
  const [year, month] = String(key).split('-').map(Number);
  return year * 12 + (month - 1);
};

export const monthFromIndex = (index) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

export const addMonths = (key, delta) => monthFromIndex(monthIndex(key) + delta);

/** Las últimas `count` claves de mes terminando en el mes de `now` (incluido). */
export function lastMonthKeys(now, count) {
  const current = monthIndex(madridMonthKey(now));
  return Array.from({ length: count }, (_, i) => monthFromIndex(current - (count - 1 - i)));
}

function makeMonthKeyer() {
  const cache = new Map();
  return (time) => {
    let key = cache.get(time);
    if (!key) {
      key = madridMonthKey(new Date(time));
      cache.set(time, key);
    }
    return key;
  };
}

// ---------- utilidades ----------

const ratio = (numerator, denominator) => (denominator > 0 ? numerator / denominator : null);

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const mean = (values) => (values.length ? values.reduce((total, v) => total + v, 0) / values.length : null);

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

const round = (value, decimals = 4) => (value === null || value === undefined ? null : Math.round(value * 10 ** decimals) / 10 ** decimals);

export const LOCATION_BY_SLUG = { valladolid: 1, asturias: 2 };
export const locationIdFromSlug = (slug) => LOCATION_BY_SLUG[String(slug || '').trim().toLowerCase()] || 0;

// ---------- línea temporal de cada jugador ----------

/**
 * Agrupa las participaciones por jugador: [{ matchId, t }] ordenado en el
 * tiempo, sin repetir partido (dos entradas del mismo partido son una).
 */
export function buildPlayerTimelines(participations, { locationId = null } = {}) {
  const byPlayer = new Map();
  for (const row of participations) {
    if (locationId && Number(row.location_id) !== Number(locationId)) continue;
    const playerId = Number(row.player_id);
    const time = asTime(row.starts_at);
    if (!playerId || time === null) continue;
    let matches = byPlayer.get(playerId);
    if (!matches) {
      matches = new Map();
      byPlayer.set(playerId, matches);
    }
    const matchId = Number(row.match_id);
    if (!matches.has(matchId)) matches.set(matchId, time);
  }
  const timelines = new Map();
  for (const [playerId, matches] of byPlayer) {
    timelines.set(
      playerId,
      [...matches.entries()].map(([matchId, t]) => ({ matchId, t })).sort((a, b) => a.t - b.t || a.matchId - b.matchId)
    );
  }
  return timelines;
}

// ---------- tracción: MAU, retención y frecuencia ----------

export function computeTraction({ participations, now = new Date(), months = 12, locationId = null }) {
  const nowTime = asTime(now);
  const currentKey = madridMonthKey(now);
  const monthKeyOf = makeMonthKeyer();
  const rows = locationId ? participations.filter((p) => Number(p.location_id) === Number(locationId)) : participations;
  const timelines = buildPlayerTimelines(rows);
  const seriesKeys = lastMonthKeys(now, months);

  const activeByMonth = new Map(); // mes -> Set(jugadores)
  const countsByMonth = new Map(); // mes -> Map(jugador -> partidos)
  const firstMonthOf = new Map(); // jugador -> mes de su primer partido
  const firstTimeOf = new Map();

  for (const [playerId, timeline] of timelines) {
    firstMonthOf.set(playerId, monthKeyOf(timeline[0].t));
    firstTimeOf.set(playerId, timeline[0].t);
    for (const { t } of timeline) {
      const key = monthKeyOf(t);
      if (!activeByMonth.has(key)) {
        activeByMonth.set(key, new Set());
        countsByMonth.set(key, new Map());
      }
      activeByMonth.get(key).add(playerId);
      const counts = countsByMonth.get(key);
      counts.set(playerId, (counts.get(playerId) || 0) + 1);
    }
  }

  const ticketsByMonth = new Map();
  for (const row of rows) {
    const time = asTime(row.starts_at);
    if (time === null) continue;
    const key = monthKeyOf(time);
    ticketsByMonth.set(key, (ticketsByMonth.get(key) || 0) + 1);
  }

  const newPlayersByMonth = new Map();
  for (const key of firstMonthOf.values()) newPlayersByMonth.set(key, (newPlayersByMonth.get(key) || 0) + 1);

  const monthly = seriesKeys.map((key) => {
    const active = activeByMonth.get(key) || new Set();
    const counts = countsByMonth.get(key) || new Map();
    const participationsCount = [...counts.values()].reduce((total, v) => total + v, 0);
    const recurrent = [...counts.values()].filter((v) => v >= 2).length;
    const newPlayers = newPlayersByMonth.get(key) || 0;
    const previous = activeByMonth.get(addMonths(key, -1));
    let retained = null;
    let momRate = null;
    if (previous && previous.size) {
      retained = [...previous].filter((id) => active.has(id)).length;
      momRate = retained / previous.size;
    }
    return {
      month: key,
      partial: key === currentKey,
      active_players: active.size,
      new_players: newPlayers,
      returning_players: active.size - newPlayers,
      participations: participationsCount,
      tickets: ticketsByMonth.get(key) || 0,
      avg_frequency: round(ratio(participationsCount, active.size), 3),
      recurrent_players: recurrent,
      recurrent_rate: round(ratio(recurrent, active.size)),
      previous_active: previous ? previous.size : null,
      retained_from_previous: retained,
      churned_from_previous: previous && retained !== null ? previous.size - retained : null,
      mom_retention: round(momRate),
    };
  });

  // --- instantáneas ---
  const windowCount = (days) => {
    const from = nowTime - days * DAY_MS;
    let count = 0;
    for (const timeline of timelines.values()) {
      if (timeline.some(({ t }) => t > from && t <= nowTime)) count += 1;
    }
    return count;
  };
  const mau30 = windowCount(30);
  const wau7 = windowCount(7);
  const newLast30 = [...firstTimeOf.values()].filter((t) => t > nowTime - 30 * DAY_MS && t <= nowTime).length;

  const current = {
    mau_month_to_date: (activeByMonth.get(currentKey) || new Set()).size,
    mau_last_30d: mau30,
    wau_last_7d: wau7,
    stickiness_wau_mau: round(ratio(wau7, mau30)),
    active_previous_month: (activeByMonth.get(addMonths(currentKey, -1)) || new Set()).size,
    players_ever: timelines.size,
    new_players_last_30d: newLast30,
  };

  // --- retención por cohorte mensual (mes del primer partido) ---
  const maxOffset = 12;
  const currentIndex = monthIndex(currentKey);
  const cohortKeys = lastMonthKeys(now, months);
  const cohorts = cohortKeys.map((cohortKey) => {
    const members = [...firstMonthOf.entries()].filter(([, key]) => key === cohortKey).map(([id]) => id);
    const counts = [];
    const rates = [];
    let partialOffset = null;
    for (let offset = 0; offset <= maxOffset; offset += 1) {
      const targetIndex = monthIndex(cohortKey) + offset;
      if (targetIndex > currentIndex) {
        counts.push(null);
        rates.push(null);
        continue;
      }
      const active = activeByMonth.get(monthFromIndex(targetIndex)) || new Set();
      const retained = members.filter((id) => active.has(id)).length;
      counts.push(retained);
      rates.push(round(ratio(retained, members.length)));
      if (targetIndex === currentIndex) partialOffset = offset;
    }
    return { cohort_month: cohortKey, size: members.length, retained: counts, rates, partial_offset: partialOffset };
  });

  // Curva media: solo meses completos (el mes en curso aún no ha terminado).
  const averageCurve = [];
  for (let offset = 0; offset <= maxOffset; offset += 1) {
    let retained = 0;
    let size = 0;
    for (const cohort of cohorts) {
      if (cohort.retained[offset] === null || cohort.partial_offset === offset) continue;
      retained += cohort.retained[offset];
      size += cohort.size;
    }
    averageCurve.push(size ? round(retained / size) : null);
  }

  // --- retención a N días (solo jugadores cuyo periodo ya se puede observar entero) ---
  const windows = {};
  for (const days of [30, 60, 90]) {
    let eligible = 0;
    let returned = 0;
    for (const timeline of timelines.values()) {
      const first = timeline[0].t;
      if (nowTime - first < days * DAY_MS) continue; // aún no se puede saber: se descarta, no cuenta como "no volvió"
      eligible += 1;
      if (timeline.length > 1 && timeline[1].t - first <= days * DAY_MS) returned += 1;
    }
    windows[`d${days}`] = { days, eligible_players: eligible, returned_players: returned, rate: round(ratio(returned, eligible)) };
  }

  const gapsToSecond = [];
  let withSecond = 0;
  for (const timeline of timelines.values()) {
    if (timeline.length > 1) {
      withSecond += 1;
      gapsToSecond.push(Math.floor((timeline[1].t - timeline[0].t) / DAY_MS));
    }
  }

  // --- frecuencia de juego ---
  const lastFullKey = addMonths(currentKey, -1);
  const lastFullCounts = countsByMonth.get(lastFullKey) || new Map();
  const distribution = { one: 0, two: 0, three_four: 0, five_plus: 0 };
  for (const count of lastFullCounts.values()) {
    if (count === 1) distribution.one += 1;
    else if (count === 2) distribution.two += 1;
    else if (count <= 4) distribution.three_four += 1;
    else distribution.five_plus += 1;
  }

  const lastThree = [1, 2, 3].map((n) => addMonths(currentKey, -n));
  let threeParticipations = 0;
  let threeActive = 0;
  for (const key of lastThree) {
    threeParticipations += [...(countsByMonth.get(key) || new Map()).values()].reduce((total, v) => total + v, 0);
    threeActive += (activeByMonth.get(key) || new Set()).size;
  }

  const intervals = [];
  const intervalFrom = nowTime - 180 * DAY_MS;
  for (const timeline of timelines.values()) {
    for (let i = 1; i < timeline.length; i += 1) {
      if (timeline[i].t >= intervalFrom) intervals.push((timeline[i].t - timeline[i - 1].t) / DAY_MS);
    }
  }

  return {
    location_id: locationId,
    as_of: new Date(nowTime).toISOString(),
    current,
    monthly,
    retention: {
      cohorts,
      average_curve: averageCurve,
      windows,
      second_match: {
        players_with_second_match: withSecond,
        players_total: timelines.size,
        rate_lifetime: round(ratio(withSecond, timelines.size)),
        median_days_to_second: median(gapsToSecond),
      },
    },
    frequency: {
      last_full_month: lastFullKey,
      last_full_month_distribution: distribution,
      avg_matches_per_active_player_last_3_full_months: round(ratio(threeParticipations, threeActive), 3),
      days_between_matches_last_180d: {
        pairs: intervals.length,
        median: round(median(intervals), 1),
        mean: round(mean(intervals), 1),
        p75: round(percentile(intervals, 0.75), 1),
      },
    },
  };
}

// ---------- activación: del registro al primer partido ----------

export function computeActivation({ users, participations, now = new Date(), months = 12, locationId = null }) {
  const nowTime = asTime(now);
  const timelines = buildPlayerTimelines(participations);
  const seriesKeys = lastMonthKeys(now, months);
  const monthKeyOf = makeMonthKeyer();

  const eligibleUsers = users.filter((u) => {
    if (String(u.role || '').toLowerCase() === 'admin') return false;
    if (locationId && locationIdFromSlug(u.preferred_location) !== Number(locationId)) return false;
    return asTime(u.created_at) !== null;
  });

  const byMonth = new Map(seriesKeys.map((key) => [key, { registrations: 0, e7: 0, p7: 0, e30: 0, p30: 0, never: 0 }]));
  for (const user of eligibleUsers) {
    const created = asTime(user.created_at);
    const bucket = byMonth.get(monthKeyOf(created));
    if (!bucket) continue;
    bucket.registrations += 1;
    const timeline = timelines.get(Number(user.id));
    const delay = timeline ? Math.max(0, timeline[0].t - created) : null;
    for (const days of [7, 30]) {
      if (nowTime - created < days * DAY_MS) continue;
      bucket[`e${days}`] += 1;
      if (delay !== null && delay <= days * DAY_MS) bucket[`p${days}`] += 1;
    }
    if (!timeline && nowTime - created >= 30 * DAY_MS) bucket.never += 1;
  }

  const monthly = seriesKeys.map((key) => {
    const b = byMonth.get(key);
    return {
      month: key,
      registrations: b.registrations,
      eligible_7d: b.e7,
      played_within_7d: b.p7,
      rate_7d: round(ratio(b.p7, b.e7)),
      eligible_30d: b.e30,
      played_within_30d: b.p30,
      rate_30d: round(ratio(b.p30, b.e30)),
      never_played_after_30d: b.never,
    };
  });

  const sum = (field) => monthly.reduce((total, row) => total + row[field], 0);
  return {
    location_id: locationId,
    monthly,
    overall: {
      registrations: sum('registrations'),
      rate_7d: round(ratio(sum('played_within_7d'), sum('eligible_7d'))),
      rate_30d: round(ratio(sum('played_within_30d'), sum('eligible_30d'))),
    },
  };
}

// ---------- ocupación de los partidos ----------

export function computeFillRate({ matches, now = new Date(), months = 12, locationId = null }) {
  const monthKeyOf = makeMonthKeyer();
  const keys = lastMonthKeys(now, months);
  const byMonth = new Map(keys.map((key) => [key, { matches: 0, capacity: 0, taken: 0, full: 0 }]));
  const nowTime = asTime(now);
  const recent = { matches: 0, capacity: 0, taken: 0 };

  for (const match of matches) {
    if (locationId && Number(match.location_id) !== Number(locationId)) continue;
    const time = asTime(match.starts_at);
    if (time === null) continue;
    const capacity = Number(match.capacity) || 0;
    const taken = Math.min(Number(match.taken) || 0, capacity || Number(match.taken) || 0);
    const bucket = byMonth.get(monthKeyOf(time));
    if (bucket) {
      bucket.matches += 1;
      bucket.capacity += capacity;
      bucket.taken += taken;
      if (capacity > 0 && taken >= capacity) bucket.full += 1;
    }
    if (time > nowTime - 90 * DAY_MS && time <= nowTime) {
      recent.matches += 1;
      recent.capacity += capacity;
      recent.taken += taken;
    }
  }

  return {
    location_id: locationId,
    last_90d: { matches: recent.matches, fill_rate: round(ratio(recent.taken, recent.capacity)), avg_players_per_match: round(ratio(recent.taken, recent.matches), 1) },
    monthly: keys.map((key) => {
      const b = byMonth.get(key);
      return {
        month: key,
        matches: b.matches,
        capacity: b.capacity,
        taken: b.taken,
        full_matches: b.full,
        fill_rate: round(ratio(b.taken, b.capacity)),
        avg_players_per_match: round(ratio(b.taken, b.matches), 1),
      };
    }),
  };
}

// ---------- monetización: ingresos y precio efectivo por EasyPass ----------

const FREE_ISSUE_TYPES = new Set(['plus_grant', 'referral_reward']);
const isManualReference = (reference) => String(reference || '').startsWith('manual_');

const sumOf = (items, pick) => items.reduce((total, item) => total + (Number(pick(item)) || 0), 0);

/** Estadísticas de precio de un conjunto de compras de packs ya cobradas. */
export function priceStats(events) {
  const orders = events.length;
  const passes = sumOf(events, (e) => e.credits);
  const paid = sumOf(events, (e) => e.paid_cents);
  const refunded = sumOf(events, (e) => e.refunded_cents);
  const withList = events.filter((e) => e.list_cents !== null && e.list_cents !== undefined && Number(e.list_cents) > 0);
  const listPasses = sumOf(withList, (e) => e.credits);
  const list = sumOf(withList, (e) => e.list_cents);
  const paidOfListed = sumOf(withList, (e) => e.paid_cents);
  const plusDiscount = sumOf(events, (e) => e.plus_discount_cents);
  const promoDiscount = sumOf(events, (e) => e.promo_discount_cents);
  return {
    orders,
    passes_sold: passes,
    revenue_cents: paid,
    refunded_cents: refunded,
    net_revenue_cents: paid - refunded,
    paid_per_pass_cents: passes ? Math.round(paid / passes) : null,
    net_per_pass_cents: passes ? Math.round((paid - refunded) / passes) : null,
    list_per_pass_cents: listPasses ? Math.round(list / listPasses) : null,
    avg_order_cents: orders ? Math.round(paid / orders) : null,
    discount_rate: round(list > 0 ? 1 - paidOfListed / list : null),
    plus_discount_cents: plusDiscount,
    promo_discount_cents: promoDiscount,
    orders_with_discount: events.filter((e) => Number(e.plus_discount_cents) > 0 || Number(e.promo_discount_cents) > 0).length,
  };
}

export function computeMonetization({
  revenueEvents,
  passTransactions,
  packs = [],
  balances = [],
  subscriptions = [],
  now = new Date(),
  months = 12,
  locationId = null,
}) {
  const nowTime = asTime(now);
  const currentKey = madridMonthKey(now);
  const monthKeyOf = makeMonthKeyer();
  const keys = lastMonthKeys(now, months);

  const paidEvents = revenueEvents.filter((e) => e.status === 'paid');
  const packEvents = paidEvents.filter((e) => e.kind === 'easypass_pack' && (!locationId || Number(e.location_id) === Number(locationId)));
  const subscriptionEvents = locationId ? [] : paidEvents.filter((e) => e.kind === 'subscription');

  const manualPurchases = passTransactions.filter((t) => t.type === 'purchase' && isManualReference(t.payment_reference));
  const txs = passTransactions.filter((t) => !(t.type === 'purchase' && isManualReference(t.payment_reference)));
  const scopedTxs = locationId ? txs.filter((t) => Number(t.location_id) === Number(locationId)) : txs;

  const purchaseTxs = scopedTxs.filter((t) => t.type === 'purchase' && Number(t.amount) > 0);
  const freeTxs = locationId ? [] : txs.filter((t) => (FREE_ISSUE_TYPES.has(t.type) || t.type === 'admin_adjustment') && Number(t.amount) > 0);
  const spendTxs = scopedTxs.filter((t) => t.type === 'spend');
  const refundTxs = scopedTxs.filter((t) => t.type === 'refund');

  const monthlyBuckets = new Map(keys.map((key) => [key, {
    packEvents: [], subscriptionEvents: [], payers: new Set(), issuedPaid: 0, issuedFree: 0, spent: 0, refunded: 0,
  }]));
  for (const e of packEvents) {
    const bucket = monthlyBuckets.get(monthKeyOf(asTime(e.paid_at)));
    if (bucket) { bucket.packEvents.push(e); bucket.payers.add(Number(e.user_id)); }
  }
  for (const e of subscriptionEvents) {
    const bucket = monthlyBuckets.get(monthKeyOf(asTime(e.paid_at)));
    if (bucket) { bucket.subscriptionEvents.push(e); bucket.payers.add(Number(e.user_id)); }
  }
  const addTo = (list, field, sign = 1) => {
    for (const t of list) {
      const time = asTime(t.created_at);
      if (time === null) continue;
      const bucket = monthlyBuckets.get(monthKeyOf(time));
      if (bucket) bucket[field] += sign * Math.abs(Number(t.amount) || 0);
    }
  };
  addTo(purchaseTxs, 'issuedPaid');
  addTo(freeTxs, 'issuedFree');
  addTo(spendTxs, 'spent');
  addTo(refundTxs, 'refunded');

  const monthly = keys.map((key) => {
    const b = monthlyBuckets.get(key);
    const packs$ = priceStats(b.packEvents);
    const subsRevenue = sumOf(b.subscriptionEvents, (e) => e.paid_cents);
    const subsRefunded = sumOf(b.subscriptionEvents, (e) => e.refunded_cents);
    const issuedTotal = b.issuedPaid + b.issuedFree;
    const totalRevenue = packs$.revenue_cents + subsRevenue;
    return {
      month: key,
      partial: key === currentKey,
      pack_revenue_cents: packs$.revenue_cents,
      subscription_revenue_cents: subsRevenue,
      revenue_cents: totalRevenue,
      refunded_cents: packs$.refunded_cents + subsRefunded,
      net_revenue_cents: totalRevenue - packs$.refunded_cents - subsRefunded,
      orders: packs$.orders,
      passes_sold: packs$.passes_sold,
      paying_users: b.payers.size,
      arppu_cents: b.payers.size ? Math.round(totalRevenue / b.payers.size) : null,
      avg_order_cents: packs$.avg_order_cents,
      paid_per_pass_cents: packs$.paid_per_pass_cents,
      list_per_pass_cents: packs$.list_per_pass_cents,
      discount_rate: packs$.discount_rate,
      passes_issued_paid: b.issuedPaid,
      passes_issued_free: b.issuedFree,
      passes_redeemed: Math.max(0, b.spent - b.refunded),
      blended_price_per_issued_pass_cents: issuedTotal ? Math.round(packs$.revenue_cents / issuedTotal) : null,
    };
  });

  // --- precio efectivo ---
  const since = (days) => packEvents.filter((e) => asTime(e.paid_at) > nowTime - days * DAY_MS);
  const effective = {
    all_time: priceStats(packEvents),
    last_90d: priceStats(since(90)),
    current_month: priceStats(packEvents.filter((e) => monthKeyOf(asTime(e.paid_at)) === currentKey)),
    by_location: {},
    by_pack: [],
  };
  const locationIds = [...new Set(paidEvents.filter((e) => e.kind === 'easypass_pack' && e.location_id).map((e) => Number(e.location_id)))].sort();
  for (const id of locationIds) {
    const scoped = paidEvents.filter((e) => e.kind === 'easypass_pack' && Number(e.location_id) === id);
    effective.by_location[id] = {
      all_time: priceStats(scoped),
      last_90d: priceStats(scoped.filter((e) => asTime(e.paid_at) > nowTime - 90 * DAY_MS)),
    };
  }
  const packName = new Map(packs.map((p) => [Number(p.id), p]));
  const packIds = [...new Set(packEvents.filter((e) => e.pack_id).map((e) => Number(e.pack_id)))];
  effective.by_pack = packIds
    .map((id) => {
      const stats = priceStats(packEvents.filter((e) => Number(e.pack_id) === id));
      const pack = packName.get(id);
      return {
        pack_id: id,
        name: pack?.name || `Pack #${id}`,
        credits: pack ? Number(pack.credits) : null,
        location_id: pack ? Number(pack.location_id) : null,
        current_list_price_cents: pack ? Number(pack.price_cents) : null,
        ...stats,
      };
    })
    .sort((a, b) => b.revenue_cents - a.revenue_cents);

  // Estimación con los precios de lista de hoy, para comparar con lo realmente cobrado.
  let estimatedList = 0;
  let estimatedPasses = 0;
  for (const t of purchaseTxs) {
    const pack = packName.get(Number(t.pack_id));
    if (!pack || !Number(pack.credits)) continue;
    estimatedList += (Number(t.amount) / Number(pack.credits)) * Number(pack.price_cents);
    estimatedPasses += Number(t.amount);
  }

  // --- emisión y canje de EasyPass (últimos 12 meses) ---
  const sumMonthly = (field) => monthly.reduce((total, m) => total + m[field], 0);
  const issuedPaid12 = sumMonthly('passes_issued_paid');
  const issuedFree12 = sumMonthly('passes_issued_free');
  const issuance = {
    last_12m: {
      issued_paid: issuedPaid12,
      issued_free: issuedFree12,
      free_share: round(ratio(issuedFree12, issuedPaid12 + issuedFree12)),
      redeemed_net: sumMonthly('passes_redeemed'),
      blended_packs_only_cents: issuedPaid12 + issuedFree12 ? Math.round(sumMonthly('pack_revenue_cents') / (issuedPaid12 + issuedFree12)) : null,
      blended_total_cents: issuedPaid12 + issuedFree12 ? Math.round(sumMonthly('revenue_cents') / (issuedPaid12 + issuedFree12)) : null,
    },
    free_passes_scope: locationId ? 'no_disponible_por_sede' : 'global',
  };

  // --- pasivo: EasyPass vendidos y aún sin usar ---
  const balanceRows = balances.filter((b) => !locationId || Number(b.location_id) === Number(locationId));
  const outstanding = balanceRows.map((b) => {
    const passes = Math.max(0, Number(b.passes) || 0);
    const perPass = effective.by_location[Number(b.location_id)]?.last_90d.paid_per_pass_cents
      ?? effective.by_location[Number(b.location_id)]?.all_time.paid_per_pass_cents
      ?? effective.all_time.paid_per_pass_cents;
    return { location_id: Number(b.location_id), passes, holders: Number(b.holders) || 0, price_used_cents: perPass, estimated_value_cents: perPass === null ? null : Math.round(passes * perPass) };
  });
  const liability = {
    outstanding_passes: sumOf(outstanding, (o) => o.passes),
    estimated_value_cents: outstanding.some((o) => o.estimated_value_cents === null) ? null : sumOf(outstanding, (o) => o.estimated_value_cents),
    by_location: outstanding,
    note: 'Valorado al precio efectivo medio de los últimos 90 días de cada sede. Es una estimación.',
  };

  // --- recompra (se calcula con el libro de EasyPass, que está completo) ---
  const purchasesByUser = new Map();
  for (const t of purchaseTxs) {
    const time = asTime(t.created_at);
    if (time === null) continue;
    const list = purchasesByUser.get(Number(t.user_id)) || [];
    list.push(time);
    purchasesByUser.set(Number(t.user_id), list);
  }
  for (const list of purchasesByUser.values()) list.sort((a, b) => a - b);
  const repurchase = { payers: purchasesByUser.size, repeat_payers: 0, avg_orders_per_payer: null, windows: {} };
  let totalOrders = 0;
  for (const list of purchasesByUser.values()) {
    totalOrders += list.length;
    if (list.length > 1) repurchase.repeat_payers += 1;
  }
  repurchase.repeat_rate = round(ratio(repurchase.repeat_payers, repurchase.payers));
  repurchase.avg_orders_per_payer = round(ratio(totalOrders, repurchase.payers), 2);
  for (const days of [30, 60, 90]) {
    let eligible = 0;
    let again = 0;
    for (const list of purchasesByUser.values()) {
      if (nowTime - list[0] < days * DAY_MS) continue;
      eligible += 1;
      if (list.length > 1 && list[1] - list[0] <= days * DAY_MS) again += 1;
    }
    repurchase.windows[`d${days}`] = { days, eligible_payers: eligible, repurchased: again, rate: round(ratio(again, eligible)) };
  }

  // --- ingreso por comprador a 90 días (con el libro de Stripe) ---
  const revenueByUser = new Map();
  for (const e of paidEvents) {
    if (!locationId || (e.kind === 'easypass_pack' && Number(e.location_id) === Number(locationId))) {
      const list = revenueByUser.get(Number(e.user_id)) || [];
      list.push({ t: asTime(e.paid_at), net: Number(e.paid_cents) - Number(e.refunded_cents) });
      revenueByUser.set(Number(e.user_id), list);
    }
  }
  let ltvEligible = 0;
  let ltvCovered = 0;
  let ltvRevenue = 0;
  for (const [userId, list] of purchasesByUser) {
    if (nowTime - list[0] < 90 * DAY_MS) continue;
    ltvEligible += 1;
    const events = revenueByUser.get(userId);
    if (!events) continue;
    ltvCovered += 1;
    ltvRevenue += events.filter((ev) => ev.t >= list[0] && ev.t <= list[0] + 90 * DAY_MS).reduce((total, ev) => total + ev.net, 0);
  }

  const subscribers = {
    active: sumOf(subscriptions.filter((s) => ['active', 'trialing'].includes(String(s.status))), (s) => s.count),
    mrr_list_cents: sumOf(subscriptions.filter((s) => ['active', 'trialing'].includes(String(s.status))), (s) => Number(s.count) * Number(s.price_cents || 0)),
    by_plan: subscriptions
      .filter((s) => ['active', 'trialing'].includes(String(s.status)))
      .map((s) => ({ plan_code: s.plan_code, status: s.status, count: Number(s.count), price_cents: Number(s.price_cents || 0) })),
    scope: locationId ? 'no_disponible_por_sede' : 'global',
  };

  // --- calidad del dato ---
  const ledgerPackRefs = new Set(revenueEvents.filter((e) => e.kind === 'easypass_pack').map((e) => e.stripe_ref));
  const realPurchases = txs.filter((t) => t.type === 'purchase' && Number(t.amount) > 0);
  // Solo las compras con referencia de sesión de Stripe (cs_...) se pueden leer de Stripe; el resto
  // (compras antiguas o sin referencia) se cuentan aparte para que no tapen el porcentaje de cobertura.
  const readable = realPurchases.filter((t) => String(t.payment_reference || '').startsWith('cs_'));
  const covered = readable.filter((t) => ledgerPackRefs.has(t.payment_reference)).length;
  const lastSync = revenueEvents.reduce((latest, e) => {
    const t = asTime(e.created_at);
    return t !== null && (latest === null || t > latest) ? t : latest;
  }, null);
  const dataQuality = {
    purchases_total: realPurchases.length,
    purchases_with_stripe_ref: readable.length,
    purchases_without_stripe_ref: realPurchases.length - readable.length,
    purchases_in_ledger: covered,
    coverage_rate: round(ratio(covered, readable.length)),
    purchases_unavailable_in_stripe: revenueEvents.filter((e) => e.kind === 'easypass_pack' && e.status === 'unavailable').length,
    purchases_test_mode: revenueEvents.filter((e) => e.kind === 'easypass_pack' && e.status === 'test').length,
    manual_test_purchases_excluded: manualPurchases.length,
    last_ledger_entry_at: lastSync === null ? null : new Date(lastSync).toISOString(),
    estimated_from_current_list_prices: {
      passes: estimatedPasses,
      revenue_cents: Math.round(estimatedList),
      per_pass_cents: estimatedPasses ? Math.round(estimatedList / estimatedPasses) : null,
    },
  };

  return {
    currency: 'EUR',
    location_id: locationId,
    as_of: new Date(nowTime).toISOString(),
    monthly,
    effective_price: effective,
    issuance,
    liability,
    repurchase,
    first_90_days: {
      eligible_payers: ltvEligible,
      payers_with_ledger_data: ltvCovered,
      revenue_per_payer_cents: ltvCovered ? Math.round(ltvRevenue / ltvCovered) : null,
    },
    subscribers,
    data_quality: dataQuality,
  };
}

// ---------- adquisición: CAC ----------

export function computeAcquisition({
  users,
  participations,
  purchaseTransactions,
  subscriptionStarts = [],
  referrals = [],
  spendRows = [],
  revenueEvents = [],
  now = new Date(),
  months = 12,
  locationId = null,
}) {
  const nowTime = asTime(now);
  const currentKey = madridMonthKey(now);
  const monthKeyOf = makeMonthKeyer();
  const keys = lastMonthKeys(now, months);

  const realUsers = users.filter((u) => String(u.role || '').toLowerCase() !== 'admin' && asTime(u.created_at) !== null);
  const scopedUsers = locationId ? realUsers.filter((u) => locationIdFromSlug(u.preferred_location) === Number(locationId)) : realUsers;
  const referredIds = new Set(referrals.map((r) => Number(r.referred_user_id)));

  const timelines = buildPlayerTimelines(participations, { locationId });
  const newPlayersByMonth = new Map();
  for (const timeline of timelines.values()) {
    const key = monthKeyOf(timeline[0].t);
    newPlayersByMonth.set(key, (newPlayersByMonth.get(key) || 0) + 1);
  }

  // Primera vez que paga cada usuario: primera compra de pack o primera suscripción.
  const firstPayment = new Map();
  const noteFirst = (userId, time, location) => {
    const current = firstPayment.get(userId);
    if (!current || time < current.t) firstPayment.set(userId, { t: time, location });
  };
  for (const t of purchaseTransactions) {
    if (!(Number(t.amount) > 0) || isManualReference(t.payment_reference)) continue;
    const time = asTime(t.created_at);
    if (time !== null) noteFirst(Number(t.user_id), time, Number(t.location_id) || 0);
  }
  for (const s of subscriptionStarts) {
    const time = asTime(s.started_at);
    if (time !== null) noteFirst(Number(s.user_id), time, 0);
  }
  const adminIds = new Set(users.filter((u) => String(u.role || '').toLowerCase() === 'admin').map((u) => Number(u.id)));
  const newPayersByMonth = new Map();
  for (const [userId, info] of firstPayment) {
    if (adminIds.has(userId)) continue;
    if (locationId && info.location !== Number(locationId)) continue;
    const key = monthKeyOf(info.t);
    newPayersByMonth.set(key, (newPayersByMonth.get(key) || 0) + 1);
  }

  const registrationsByMonth = new Map();
  const referredByMonth = new Map();
  for (const user of scopedUsers) {
    const key = monthKeyOf(asTime(user.created_at));
    registrationsByMonth.set(key, (registrationsByMonth.get(key) || 0) + 1);
    if (referredIds.has(Number(user.id))) referredByMonth.set(key, (referredByMonth.get(key) || 0) + 1);
  }

  const spendByMonth = new Map();
  const spendByChannel = new Map();
  let unallocated = 0;
  for (const row of spendRows) {
    const key = String(row.month).slice(0, 7);
    const amount = Number(row.amount_cents) || 0;
    if (locationId && Number(row.location_id) !== Number(locationId)) {
      if (Number(row.location_id) === 0) unallocated += amount;
      continue;
    }
    spendByMonth.set(key, (spendByMonth.get(key) || 0) + amount);
    if (keys.includes(key)) spendByChannel.set(row.channel, (spendByChannel.get(row.channel) || 0) + amount);
  }

  const monthly = keys.map((key) => {
    const spend = spendByMonth.get(key) || 0;
    const registrations = registrationsByMonth.get(key) || 0;
    const newPlayers = newPlayersByMonth.get(key) || 0;
    const newPayers = newPayersByMonth.get(key) || 0;
    return {
      month: key,
      partial: key === currentKey,
      spend_cents: spend,
      registrations,
      referred_registrations: referredByMonth.get(key) || 0,
      new_players: newPlayers,
      new_payers: newPayers,
      cac_per_registration_cents: spend > 0 && registrations ? Math.round(spend / registrations) : null,
      cac_per_new_player_cents: spend > 0 && newPlayers ? Math.round(spend / newPlayers) : null,
      cac_per_new_payer_cents: spend > 0 && newPayers ? Math.round(spend / newPayers) : null,
    };
  });

  // Totales: solo meses completos con gasto registrado, para no mezclar con meses sin dato.
  const base = monthly.filter((m) => !m.partial && m.spend_cents > 0);
  const totalsOf = (rows) => {
    const spend = sumOf(rows, (m) => m.spend_cents);
    const registrations = sumOf(rows, (m) => m.registrations);
    const newPlayers = sumOf(rows, (m) => m.new_players);
    const newPayers = sumOf(rows, (m) => m.new_payers);
    return {
      months_with_spend: rows.length,
      spend_cents: spend,
      registrations,
      new_players: newPlayers,
      new_payers: newPayers,
      cac_per_registration_cents: spend > 0 && registrations ? Math.round(spend / registrations) : null,
      cac_per_new_player_cents: spend > 0 && newPlayers ? Math.round(spend / newPlayers) : null,
      cac_per_new_payer_cents: spend > 0 && newPayers ? Math.round(spend / newPayers) : null,
    };
  };
  const totals = { last_3_full_months: totalsOf(base.slice(-3)), last_12_months: totalsOf(base) };

  // Recuperación: ingreso por comprador a 90 días frente al CAC por comprador.
  const paidEvents = revenueEvents.filter((e) => e.status === 'paid' && (!locationId || (e.kind === 'easypass_pack' && Number(e.location_id) === Number(locationId))));
  const revenueByUser = new Map();
  for (const e of paidEvents) {
    const list = revenueByUser.get(Number(e.user_id)) || [];
    list.push({ t: asTime(e.paid_at), net: Number(e.paid_cents) - Number(e.refunded_cents) });
    revenueByUser.set(Number(e.user_id), list);
  }
  let payerRevenue = 0;
  let coveredPayers = 0;
  for (const [userId, info] of firstPayment) {
    if (adminIds.has(userId) || (locationId && info.location !== Number(locationId))) continue;
    if (nowTime - info.t < 90 * DAY_MS) continue;
    const events = revenueByUser.get(userId);
    if (!events) continue;
    coveredPayers += 1;
    payerRevenue += events.filter((ev) => ev.t >= info.t && ev.t <= info.t + 90 * DAY_MS).reduce((total, ev) => total + ev.net, 0);
  }
  const revenuePerPayer90 = coveredPayers ? Math.round(payerRevenue / coveredPayers) : null;
  const cacPayer = totals.last_12_months.cac_per_new_payer_cents;

  return {
    location_id: locationId,
    has_spend_data: spendRows.length > 0,
    monthly,
    totals,
    spend_by_channel_last_12m: [...spendByChannel.entries()].map(([channel, spend_cents]) => ({ channel, spend_cents })).sort((a, b) => b.spend_cents - a.spend_cents),
    unallocated_spend_cents: locationId ? unallocated : 0,
    payback: {
      payers_observed_90d: coveredPayers,
      revenue_per_payer_90d_cents: revenuePerPayer90,
      cac_per_new_payer_cents: cacPayer,
      revenue_to_cac_ratio: revenuePerPayer90 !== null && cacPayer ? round(revenuePerPayer90 / cacPayer, 2) : null,
    },
    definitions: {
      new_payer: 'Primera compra de pack EasyPass o primera suscripción del usuario.',
      new_player: 'Primer partido jugado (inscripción confirmada en un partido ya disputado).',
      registration: 'Cuenta creada (se excluyen administradores).',
    },
  };
}
