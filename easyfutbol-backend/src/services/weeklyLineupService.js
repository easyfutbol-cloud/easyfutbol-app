// "El 8 de la semana": lógica de semanas, cierre automático y recuento de
// votos. La apertura es manual (la hace un admin) mientras se rodan las
// primeras semanas; el cierre sigue siendo automático a la hora fijada.
import { pool } from '../config/db.js';
import { markSchedulerFailure, markSchedulerSuccess, registerScheduler } from './operationalHealthService.js';
import { madridWallTimeToUtc, toMysqlUtc } from '../utils/madridDateTime.js';

export const POSITIONS = ['portero', 'defensa', 'centrocampista', 'delantero'];
// Cuántos gana cada posición (y, a la vez, cuántos tiene que elegir cada
// votante en esa posición) — suman 8, de ahí "el 8 de la semana".
export const POSITION_SLOTS = { portero: 1, defensa: 3, centrocampista: 2, delantero: 2 };
// Tamaño máximo del grupo de candidatos que el admin puede poner por posición.
export const POSITION_CANDIDATE_POOL = { portero: 3, defensa: 5, centrocampista: 4, delantero: 4 };
export const POSITION_LABELS = {
  portero: 'Portero',
  defensa: 'Defensa',
  centrocampista: 'Centrocampista',
  delantero: 'Delantero',
};

const LOCATION_LABELS = { valladolid: 'Valladolid', asturias: 'Asturias' };
export function formatLocationLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return LOCATION_LABELS[key] || null;
}

// Muchas cuentas se crearon antes de que existiera el filtro de ciudad
// (preferred_location), así que si no lo tienen puesto deducimos su ciudad
// habitual por dónde han jugado la mayoría de sus partidos.
export const INFERRED_LOCATION_JOIN_SQL = `
  LEFT JOIN (
    SELECT user_id, location_slug FROM (
      SELECT mps.user_id,
             COALESCE(l.slug, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 'asturias' ELSE 'valladolid' END) AS location_slug,
             ROW_NUMBER() OVER (PARTITION BY mps.user_id ORDER BY COUNT(*) DESC) AS rn
      FROM match_player_stats mps
      JOIN matches m ON m.id = mps.match_id
      LEFT JOIN locations l ON l.id = m.location_id
      GROUP BY mps.user_id, location_slug
    ) ranked WHERE rn = 1
  ) inferred_loc ON inferred_loc.user_id = u.id
`;

export function resolveLocationLabel(preferredLocation, inferredLocationSlug) {
  return formatLocationLabel(preferredLocation) || formatLocationLabel(inferredLocationSlug);
}

const MADRID_TZ = 'Europe/Madrid';

function madridDateParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: MADRID_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value])
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function toDateString(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Lunes-domingo (en calendario, no en huso) de la semana que contiene `date`. */
export function getWeekBounds(date = new Date()) {
  const { year, month, day } = madridDateParts(date);
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  const isoWeekday = asUtc.getUTCDay() === 0 ? 7 : asUtc.getUTCDay(); // 1=lunes..7=domingo
  const monday = new Date(asUtc);
  monday.setUTCDate(asUtc.getUTCDate() - (isoWeekday - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    weekStart: toDateString(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()),
    weekEnd: toDateString(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate()),
  };
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return toDateString(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Ventana de votación de una semana: lunes 19:00 a miércoles 19:00, hora de Madrid. */
function computeVotingWindow(weekStart) {
  const opensAt = madridWallTimeToUtc(weekStart, '19:00');
  const closesAt = madridWallTimeToUtc(addDays(weekStart, 2), '19:00');
  return { opensAt, closesAt };
}

/** Crea (si no existe) el borrador de la próxima semana para que el admin pueda ir preparando candidatos. */
export async function ensureUpcomingDraftPoll() {
  const { weekStart: currentWeekStart, weekEnd: currentWeekEnd } = getWeekBounds();
  const nextWeekStart = addDays(currentWeekStart, 7);
  const nextWeekEnd = addDays(nextWeekStart, 6);

  for (const [weekStart, weekEnd] of [[currentWeekStart, currentWeekEnd], [nextWeekStart, nextWeekEnd]]) {
    const [[existing]] = await pool.query('SELECT id FROM weekly_lineup_polls WHERE week_start=? LIMIT 1', [weekStart]);
    if (existing) continue;

    const { opensAt, closesAt } = computeVotingWindow(weekStart);
    await pool.query(
      `INSERT IGNORE INTO weekly_lineup_polls (week_start, week_end, scheduled_open_at, scheduled_close_at, status)
       VALUES (?,?,?,?,'draft')`,
      [weekStart, weekEnd, opensAt ? toMysqlUtc(opensAt) : null, closesAt ? toMysqlUtc(closesAt) : null]
    );
  }
}

/**
 * Abre una votación a mano (mientras no automaticemos la apertura). Exige que
 * cada posición tenga al menos un candidato.
 */
export async function openPoll(pollId) {
  const [[poll]] = await pool.query('SELECT id, status FROM weekly_lineup_polls WHERE id=?', [pollId]);
  if (!poll) return { ok: false, msg: 'Votación no encontrada' };
  if (poll.status !== 'draft') return { ok: false, msg: 'Solo se puede abrir una votación que esté en borrador' };

  const [rows] = await pool.query(
    'SELECT position, COUNT(*) AS total FROM weekly_lineup_candidates WHERE poll_id=? GROUP BY position',
    [pollId]
  );
  const counts = Object.fromEntries(rows.map((r) => [r.position, r.total]));
  const missing = POSITIONS.filter((position) => Number(counts[position] || 0) < 1);
  if (missing.length) {
    return { ok: false, msg: `Falta al menos un candidato en: ${missing.map((p) => POSITION_LABELS[p]).join(', ')}` };
  }

  await pool.query("UPDATE weekly_lineup_polls SET status='open', opened_at=NOW() WHERE id=?", [pollId]);
  return { ok: true };
}

/** Cierra las votaciones abiertas cuya hora de cierre ya ha pasado. */
export async function closeDuePolls() {
  await pool.query(
    "UPDATE weekly_lineup_polls SET status='closed', closed_at=NOW() WHERE status='open' AND scheduled_close_at IS NOT NULL AND scheduled_close_at<=UTC_TIMESTAMP()"
  );
}

let started = false;
let running = false;

export function startWeeklyLineupScheduler() {
  if (started) return;
  started = true;
  registerScheduler('weekly-lineup-scheduler', { maxAgeSeconds: 20 * 60 });
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await ensureUpcomingDraftPoll();
      await closeDuePolls();
      markSchedulerSuccess('weekly-lineup-scheduler');
    } catch (error) {
      markSchedulerFailure('weekly-lineup-scheduler', error);
      console.error('[weeklyLineupScheduler]', error?.message || error);
    } finally {
      running = false;
    }
  };
  run();
  const timer = setInterval(run, 15 * 60 * 1000);
  timer.unref?.();
}

/** Candidatos de un poll agrupados por posición, con nombre de usuario, foto y votos. */
export async function getPollWithCandidates(pollId) {
  const [[poll]] = await pool.query('SELECT * FROM weekly_lineup_polls WHERE id=?', [pollId]);
  if (!poll) return null;

  const [rows] = await pool.query(
    `SELECT c.id, c.position, c.user_id, u.name, u.avatar_url, u.preferred_location, inferred_loc.location_slug AS inferred_location_slug,
            (SELECT COUNT(*) FROM weekly_lineup_votes v WHERE v.candidate_id=c.id) AS votes
     FROM weekly_lineup_candidates c
     JOIN users u ON u.id = c.user_id
     ${INFERRED_LOCATION_JOIN_SQL}
     WHERE c.poll_id=?
     ORDER BY c.position, votes DESC, c.id ASC`,
    [pollId]
  );

  const candidates = {};
  for (const position of POSITIONS) candidates[position] = [];
  for (const row of rows) {
    candidates[row.position]?.push({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      avatar_url: row.avatar_url,
      location: resolveLocationLabel(row.preferred_location, row.inferred_location_slug),
      votes: Number(row.votes),
    });
  }

  return { poll, candidates };
}

/** Alineación ganadora de un poll cerrado (top-N candidatos por posición según sus huecos). */
export async function getPollWinners(pollId) {
  const { candidates } = (await getPollWithCandidates(pollId)) || { candidates: {} };
  const winners = {};
  for (const position of POSITIONS) {
    winners[position] = (candidates[position] || [])
      .slice()
      .sort((a, b) => b.votes - a.votes)
      .slice(0, POSITION_SLOTS[position]);
  }
  return winners;
}
