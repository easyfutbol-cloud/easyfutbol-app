// Reglas puras de racha, retos y personalizables (sin base de datos), para
// poder probarlas con `npm test`. Las semanas van de lunes a domingo en hora
// de Madrid y se identifican por la fecha de su lunes ("2026-10-26").

const MADRID_TIME_ZONE = 'Europe/Madrid';
const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (value) => String(value).padStart(2, '0');

function madridYmd(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: MADRID_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
  return { year: parts.year, month: parts.month, day: parts.day };
}

const formatUtcDay = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const parseDay = (key) => {
  const [year, month, day] = String(key).split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

export function weekKey(value) {
  const ymd = madridYmd(value);
  if (!ymd) return null;
  const dayMs = Date.UTC(ymd.year, ymd.month - 1, ymd.day);
  const mondayOffset = (new Date(dayMs).getUTCDay() + 6) % 7;
  return formatUtcDay(dayMs - mondayOffset * DAY_MS);
}

export function monthKey(value) {
  const ymd = madridYmd(value);
  return ymd ? `${ymd.year}-${pad(ymd.month)}` : null;
}

export const shiftWeek = (key, weeks) => formatUtcDay(parseDay(key) + weeks * 7 * DAY_MS);

export function shiftMonth(key, months) {
  const [year, month] = String(key).split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export const periodKey = (period, value) => (period === 'month' ? monthKey(value) : weekKey(value));
export const shiftPeriod = (period, key, n) => (period === 'month' ? shiftMonth(key, n) : shiftWeek(key, n));

/** Último día (incluido) del periodo, en "YYYY-MM-DD". */
export function periodEndsOn(period, key) {
  if (period === 'month') return formatUtcDay(parseDay(`${shiftMonth(key, 1)}-01`) - DAY_MS);
  return formatUtcDay(parseDay(key) + 6 * DAY_MS);
}

// --- Racha ---

// Cada 4 semanas seguidas jugando hay premio, que crece hasta un tope.
export const STREAK_MILESTONE_EVERY = 4;
export const streakMilestoneReward = (weeks) => Math.min(50 * (weeks / STREAK_MILESTONE_EVERY), 200);

/**
 * Semanas seguidas con al menos un partido jugado. No haber jugado todavía
 * esta semana no rompe la racha (queda "en juego" hasta el domingo).
 */
export function computeStreak(playedWeekKeys, currentWeek) {
  const played = new Set(playedWeekKeys);
  const playedThisWeek = played.has(currentWeek);

  let current = 0;
  let cursor = playedThisWeek ? currentWeek : shiftWeek(currentWeek, -1);
  while (played.has(cursor)) {
    current += 1;
    cursor = shiftWeek(cursor, -1);
  }
  const startedWeek = current ? shiftWeek(cursor, 1) : null;

  let best = 0;
  for (const key of played) {
    if (played.has(shiftWeek(key, -1))) continue;
    let run = 0;
    let walk = key;
    while (played.has(walk)) {
      run += 1;
      walk = shiftWeek(walk, 1);
    }
    best = Math.max(best, run);
  }

  const nextMilestone = (Math.floor(current / STREAK_MILESTONE_EVERY) + 1) * STREAK_MILESTONE_EVERY;
  return {
    current,
    best,
    started_week: startedWeek,
    played_this_week: playedThisWeek,
    at_risk: current > 0 && !playedThisWeek,
    next_milestone: nextMilestone,
    next_milestone_reward: streakMilestoneReward(nextMilestone),
  };
}

/** Hitos de racha alcanzados en la racha actual (4, 8, 12…). */
export function reachedStreakMilestones(streak) {
  const milestones = [];
  for (let weeks = STREAK_MILESTONE_EVERY; weeks <= streak.current; weeks += STREAK_MILESTONE_EVERY) {
    milestones.push({
      weeks,
      reward: streakMilestoneReward(weeks),
      source_key: `streak:${streak.started_week}:${weeks}`,
    });
  }
  return milestones;
}

// --- Retos ---
// Personales y nada competitivos: cada uno compite solo contra sí mismo.
// metric: qué se mira de los partidos del periodo (best_* = mejor partido).
export const CHALLENGES = [
  { code: 'ASSISTS_2_MATCH', title: 'Da 2 asistencias en un solo partido', icon: 'swap-horizontal', period: 'week', metric: 'best_assists', target: 2, reward: 40 },
  { code: 'SAVES_2_MATCH', title: 'Haz 2 paradas clave en un partido', icon: 'hand-left', period: 'week', metric: 'best_saves', target: 2, reward: 40 },
  { code: 'MVP_1', title: 'Gana el MVP de un partido', icon: 'star', period: 'week', metric: 'mvps', target: 1, reward: 60 },
  { code: 'PLAY_3', title: 'Juega 3 partidos', icon: 'calendar', period: 'month', metric: 'matches', target: 3, reward: 60 },
];

function metricValue(metric, matches) {
  switch (metric) {
    case 'best_assists': return matches.reduce((max, m) => Math.max(max, Number(m.assists || 0)), 0);
    case 'best_saves': return matches.reduce((max, m) => Math.max(max, Number(m.saves || 0)), 0);
    case 'mvps': return matches.filter((m) => Number(m.is_mvp) === 1 || m.is_mvp === true).length;
    case 'matches': return matches.length;
    default: return 0;
  }
}

/** Progreso de un reto en un periodo concreto. matches: partidos jugados (con starts_at). */
export function evaluateChallenge(challenge, matches, key) {
  const inPeriod = matches.filter((m) => periodKey(challenge.period, m.starts_at) === key);
  const value = metricValue(challenge.metric, inPeriod);
  return {
    progress: Math.min(value, challenge.target),
    completed: value >= challenge.target,
    source_key: `challenge:${challenge.code}:${key}`,
  };
}

// --- Personalizables del perfil ---
// No se usa dorado: es el color de los suscriptores Plus.
export const COSMETICS = [
  { code: 'FRAME_CESPED', type: 'frame', name: 'Césped', price: 100, colors: ['#56ab2f', '#a8e063'] },
  { code: 'FRAME_FUEGO', type: 'frame', name: 'Fuego', price: 150, colors: ['#ff8a00', '#ff2d55'] },
  { code: 'FRAME_HIELO', type: 'frame', name: 'Hielo', price: 150, colors: ['#7ee8fa', '#4f8bff'] },
  { code: 'FRAME_NOCHE', type: 'frame', name: 'Noche', price: 200, colors: ['#8e2de2', '#4a00e0'] },
  { code: 'FRAME_ARCOIRIS', type: 'frame', name: 'Arcoíris', price: 400, colors: ['#ff5f6d', '#ffc371', '#47e891', '#4f8bff'] },
  { code: 'TITLE_INCANSABLE', type: 'title', name: 'Incansable', price: 100 },
  { code: 'TITLE_MURO', type: 'title', name: 'El Muro', price: 120 },
  { code: 'TITLE_ASISTENTE', type: 'title', name: 'Asistente de lujo', price: 120 },
  { code: 'TITLE_PICHICHI', type: 'title', name: 'Pichichi del barrio', price: 150 },
  { code: 'TITLE_CAPITAN', type: 'title', name: 'Capitán', price: 200 },
  { code: 'TITLE_LEYENDA', type: 'title', name: 'Leyenda', price: 500 },
];

export const findCosmetic = (code) => COSMETICS.find((item) => item.code === code) || null;

/** Lo que se enseña en un perfil a partir de los códigos equipados. */
export function equippedCosmetics(frameCode, titleCode) {
  const frame = findCosmetic(frameCode);
  const title = findCosmetic(titleCode);
  return {
    frame: frame?.type === 'frame' ? { code: frame.code, name: frame.name, colors: frame.colors } : null,
    title: title?.type === 'title' ? { code: title.code, label: title.name } : null,
  };
}
