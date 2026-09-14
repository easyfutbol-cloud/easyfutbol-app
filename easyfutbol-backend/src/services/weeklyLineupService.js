// "El 8 de la semana": lógica de semanas, apertura/cierre automático y
// recuento de votos. El servidor comprueba periódicamente (ver index.js)
// si hay que abrir la votación de la semana o cerrar y publicar resultado.
import { pool } from '../config/db.js';
import { markSchedulerFailure, markSchedulerSuccess, registerScheduler } from './operationalHealthService.js';

export const POSITIONS = ['portero', 'central', 'lateral', 'centrocampista', 'delantero'];
export const POSITION_SLOTS = { portero: 1, central: 1, lateral: 2, centrocampista: 2, delantero: 1 };
export const POSITION_LABELS = {
  portero: 'Portero',
  central: 'Central',
  lateral: 'Lateral',
  centrocampista: 'Centrocampista',
  delantero: 'Delantero',
};

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

/** Crea (si no existe) el borrador de la próxima semana para que el admin pueda ir preparando candidatos. */
export async function ensureUpcomingDraftPoll() {
  const { weekStart: currentWeekStart } = getWeekBounds();
  const nextWeekStart = addDays(currentWeekStart, 7);
  const nextWeekEnd = addDays(nextWeekStart, 6);

  const [[existingCurrent]] = await pool.query('SELECT id FROM weekly_lineup_polls WHERE week_start=? LIMIT 1', [currentWeekStart]);
  if (!existingCurrent) {
    const { weekEnd } = getWeekBounds();
    await pool.query('INSERT IGNORE INTO weekly_lineup_polls (week_start, week_end, status) VALUES (?,?,\'draft\')', [currentWeekStart, weekEnd]);
  }

  const [[existingNext]] = await pool.query('SELECT id FROM weekly_lineup_polls WHERE week_start=? LIMIT 1', [nextWeekStart]);
  if (!existingNext) {
    await pool.query('INSERT IGNORE INTO weekly_lineup_polls (week_start, week_end, status) VALUES (?,?,\'draft\')', [nextWeekStart, nextWeekEnd]);
  }
}

/** Abre los borradores cuya semana ya ha empezado y tienen al menos un candidato por posición requerida. */
export async function openDuePolls() {
  const { weekStart: today } = getWeekBounds();
  const [drafts] = await pool.query(
    "SELECT id FROM weekly_lineup_polls WHERE status='draft' AND week_start<=?",
    [today]
  );

  for (const draft of drafts) {
    const [rows] = await pool.query(
      'SELECT position, COUNT(*) AS total FROM weekly_lineup_candidates WHERE poll_id=? GROUP BY position',
      [draft.id]
    );
    const counts = Object.fromEntries(rows.map((r) => [r.position, r.total]));
    const ready = POSITIONS.every((position) => Number(counts[position] || 0) >= 1);
    if (ready) {
      await pool.query("UPDATE weekly_lineup_polls SET status='open', opened_at=NOW() WHERE id=?", [draft.id]);
    }
  }
}

/** Cierra las votaciones cuya semana ya ha terminado. El recuento se hace al vuelo en las consultas, no hace falta persistirlo. */
export async function closeDuePolls() {
  const { weekEnd: currentWeekEnd } = getWeekBounds();
  await pool.query(
    "UPDATE weekly_lineup_polls SET status='closed', closed_at=NOW() WHERE status='open' AND week_end<?",
    [currentWeekEnd]
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
      await openDuePolls();
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
    `SELECT c.id, c.position, c.user_id, u.name, u.avatar_url,
            (SELECT COUNT(*) FROM weekly_lineup_votes v WHERE v.candidate_id=c.id) AS votes
     FROM weekly_lineup_candidates c
     JOIN users u ON u.id = c.user_id
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
