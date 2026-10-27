// Avisos de retención: "repetir la semana que viene", alerta de hueco,
// reactivación a los 14/21/30 días sin jugar y saldo de EasyPass parado.
// Las reglas (huecos, etapas, textos) están en retentionRules.js.
import { pool } from '../config/db.js';
import { createSocialNotification } from './socialService.js';
import { markSchedulerFailure, markSchedulerSuccess, registerScheduler } from './operationalHealthService.js';
import {
  IDLE_BALANCE_DAYS,
  RETENTION_COOLDOWN_HOURS,
  RETENTION_TYPES,
  buildIdleBalanceMessage,
  buildReactivationMessage,
  buildSlotAlertMessage,
  daysSince,
  favoriteSlot,
  isSameSlot,
  isSendingHour,
  reactivationStage,
} from './retentionRules.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ACTIVE_INSCRIPTION = "i.status IN ('confirmed','paid','active')";
const OPEN_MATCH = "m.status IN ('scheduled','open') AND m.spots_taken < m.capacity";
// Tope por pasada para no mandar cientos de avisos de golpe el primer día.
const MAX_SENDS_PER_RUN = 150;

async function openMatches(db, { locationId = null, from, to }) {
  const params = [from, to];
  let locationClause = '';
  if (locationId) {
    locationClause = ' AND m.location_id = ?';
    params.push(locationId);
  }
  const [rows] = await db.query(
    `SELECT m.id, m.title, m.starts_at, m.location_id, f.name AS field_name,
            GREATEST(m.capacity - m.spots_taken, 0) AS spots_left
     FROM matches m
     LEFT JOIN fields f ON f.id = m.field_id
     WHERE ${OPEN_MATCH} AND m.starts_at > ? AND m.starts_at <= ?${locationClause}
     ORDER BY m.starts_at ASC`,
    params
  );
  return rows;
}

async function joinedMatchIds(db, userId, matchIds) {
  if (!matchIds.length) return new Set();
  const [rows] = await db.query(
    `SELECT DISTINCT i.match_id FROM inscriptions i
     WHERE ${ACTIVE_INSCRIPTION} AND (i.user_id = ? OR i.assigned_user_id = ?) AND i.match_id IN (?)`,
    [userId, userId, matchIds]
  );
  return new Set(rows.map((row) => Number(row.match_id)));
}

async function hasUpcomingMatch(db, userId) {
  const [[row]] = await db.query(
    `SELECT 1 AS found FROM inscriptions i JOIN matches m ON m.id = i.match_id
     WHERE ${ACTIVE_INSCRIPTION} AND (i.user_id = ? OR i.assigned_user_id = ?)
       AND m.status <> 'cancelled' AND m.starts_at > NOW()
     LIMIT 1`,
    [userId, userId]
  );
  return Boolean(row);
}

async function recentlyNudged(db, userId, hours = RETENTION_COOLDOWN_HOURS) {
  const [[row]] = await db.query(
    `SELECT 1 AS found FROM social_notifications
     WHERE user_id = ? AND type IN (?) AND created_at >= ? LIMIT 1`,
    [userId, RETENTION_TYPES, new Date(Date.now() - hours * HOUR_MS)]
  );
  return Boolean(row);
}

async function playedMatches(db, userId, limit = 12) {
  const [rows] = await db.query(
    `SELECT m.id, m.starts_at, m.location_id
     FROM inscriptions i JOIN matches m ON m.id = i.match_id
     WHERE ${ACTIVE_INSCRIPTION} AND COALESCE(i.assigned_user_id, i.user_id) = ?
       AND m.status <> 'cancelled' AND m.starts_at < NOW()
     GROUP BY m.id, m.starts_at, m.location_id
     ORDER BY m.starts_at DESC
     LIMIT ?`,
    [userId, limit]
  );
  return rows;
}

/**
 * El próximo partido del mismo hueco (mismo día de la semana y hora, misma
 * sede) en el que el jugador aún no está apuntado y con plazas libres.
 */
export async function findNextSimilarMatch(db, { matchId, userId }) {
  const [[source]] = await db.query('SELECT id, starts_at, location_id FROM matches WHERE id = ? LIMIT 1', [matchId]);
  if (!source) return null;
  const sourceTime = new Date(source.starts_at).getTime();
  const from = new Date(Math.max(Date.now(), sourceTime + HOUR_MS));
  const to = new Date(sourceTime + 15 * DAY_MS);
  if (from >= to) return null;
  const candidates = (await openMatches(db, { locationId: source.location_id, from, to }))
    .filter((match) => Number(match.id) !== Number(source.id) && isSameSlot(match.starts_at, source.starts_at));
  if (!candidates.length) return null;
  const joined = await joinedMatchIds(db, userId, candidates.map((match) => match.id));
  const next = candidates.find((match) => !joined.has(Number(match.id)));
  return next ? { ...next, spots_left: Number(next.spots_left) } : null;
}

/**
 * Alerta de hueco: cuando se publica un partido, avisa a quien se quedó en
 * lista de espera de ese mismo hueco en las últimas 5 semanas y a quien jugó
 * la edición anterior (misma sede, día y hora) y todavía no se ha apuntado.
 */
export async function sendSlotAlerts({ db = pool, now = new Date() } = {}) {
  const results = { matches: 0, sent: 0, skipped: 0, failed: 0 };
  const [fresh] = await db.query(
    `SELECT m.id, m.title, m.starts_at, m.location_id, f.name AS field_name,
            GREATEST(m.capacity - m.spots_taken, 0) AS spots_left
     FROM matches m LEFT JOIN fields f ON f.id = m.field_id
     WHERE ${OPEN_MATCH} AND m.created_at >= ? AND m.starts_at > ?`,
    [new Date(now.getTime() - 2 * DAY_MS), new Date(now.getTime() + 2 * HOUR_MS)]
  );

  for (const match of fresh) {
    results.matches += 1;
    const matchTime = new Date(match.starts_at).getTime();
    const [waitlisted] = await db.query(
      `SELECT DISTINCT mw.user_id, m2.starts_at
       FROM match_waitlist mw JOIN matches m2 ON m2.id = mw.match_id
       WHERE m2.location_id = ? AND m2.id <> ? AND m2.starts_at >= ?
         AND mw.status IN ('waiting','offered','expired')`,
      [match.location_id, match.id, new Date(now.getTime() - 35 * DAY_MS)]
    );
    const [previousEdition] = await db.query(
      `SELECT DISTINCT COALESCE(i.assigned_user_id, i.user_id) AS user_id, m2.starts_at
       FROM inscriptions i JOIN matches m2 ON m2.id = i.match_id
       WHERE ${ACTIVE_INSCRIPTION} AND m2.location_id = ? AND m2.id <> ? AND m2.status <> 'cancelled'
         AND m2.starts_at BETWEEN ? AND ?`,
      [match.location_id, match.id, new Date(matchTime - 15 * DAY_MS), new Date(Math.min(matchTime - 5 * DAY_MS, now.getTime()))]
    );
    const audience = new Set(
      [...waitlisted, ...previousEdition]
        .filter((row) => row.user_id && isSameSlot(row.starts_at, match.starts_at))
        .map((row) => Number(row.user_id))
    );
    if (!audience.size) continue;

    const [already] = await db.query(
      `SELECT COALESCE(i.assigned_user_id, i.user_id) AS user_id FROM inscriptions i
       WHERE i.match_id = ? AND ${ACTIVE_INSCRIPTION}
       UNION SELECT i.user_id FROM inscriptions i WHERE i.match_id = ? AND ${ACTIVE_INSCRIPTION}
       UNION SELECT mw.user_id FROM match_waitlist mw WHERE mw.match_id = ?`,
      [match.id, match.id, match.id]
    );
    for (const row of already) audience.delete(Number(row.user_id));

    const message = buildSlotAlertMessage({ ...match, spots_left: Number(match.spots_left) }, now);
    for (const userId of audience) {
      if (results.sent >= MAX_SENDS_PER_RUN) return results;
      try {
        if (await recentlyNudged(db, userId)) { results.skipped += 1; continue; }
        const ok = await createSocialNotification(db, {
          userId,
          type: 'slot_alert',
          entityType: 'match',
          entityId: match.id,
          title: message.title,
          body: message.body,
          data: { type: 'slot_alert', screen: 'Match', matchId: match.id },
          dedupeKey: `slot-alert:${match.id}:${userId}`,
        });
        if (ok) results.sent += 1; else results.skipped += 1;
      } catch (error) {
        results.failed += 1;
        console.error('[SLOT ALERT]', { userId, matchId: match.id, error: error?.message || error });
      }
    }
  }
  return results;
}

async function balanceIn(db, userId, locationId) {
  const [[row]] = await db.query(
    'SELECT COALESCE(SUM(balance), 0) AS balance FROM user_easypass_balances WHERE user_id = ? AND location_id = ?',
    [userId, locationId]
  );
  return Number(row?.balance || 0);
}

/** Partido que proponer: el de su hueco favorito esta semana, o el más cercano. */
async function suggestMatch(db, userId, history, now) {
  if (!history.length) return null;
  const locationId = history[0].location_id;
  const options = await openMatches(db, {
    locationId,
    from: new Date(now.getTime() + 2 * HOUR_MS),
    to: new Date(now.getTime() + 8 * DAY_MS),
  });
  if (!options.length) return null;
  const joined = await joinedMatchIds(db, userId, options.map((match) => match.id));
  const available = options.filter((match) => !joined.has(Number(match.id)));
  const favorite = favoriteSlot(history.map((match) => match.starts_at));
  const pick = (favorite && available.find((match) => isSameSlot(match.starts_at, favorite))) || available[0];
  return pick ? { ...pick, spots_left: Number(pick.spots_left) } : null;
}

/** Mensajes a los 14, 21 y 30 días sin jugar con un partido que le encaje. */
export async function sendReactivationNudges({ db = pool, now = new Date() } = {}) {
  const results = { scanned: 0, sent: 0, skipped: 0, failed: 0 };
  const [candidates] = await db.query(
    `SELECT x.user_id, x.last_played FROM (
       SELECT COALESCE(i.assigned_user_id, i.user_id) AS user_id, MAX(m.starts_at) AS last_played
       FROM inscriptions i JOIN matches m ON m.id = i.match_id
       WHERE ${ACTIVE_INSCRIPTION} AND m.status <> 'cancelled' AND m.starts_at < ?
       GROUP BY COALESCE(i.assigned_user_id, i.user_id)
     ) x
     WHERE x.user_id IS NOT NULL AND x.last_played <= ? AND x.last_played > ?`,
    [now, new Date(now.getTime() - 14 * DAY_MS), new Date(now.getTime() - 33 * DAY_MS)]
  );

  for (const candidate of candidates) {
    if (results.sent >= MAX_SENDS_PER_RUN) break;
    results.scanned += 1;
    const userId = Number(candidate.user_id);
    const stage = reactivationStage(daysSince(candidate.last_played, now));
    if (!stage) continue;
    try {
      const dedupeKey = `reactivation:${stage}:${userId}:${new Date(candidate.last_played).toISOString().slice(0, 10)}`;
      const [[sentBefore]] = await db.query('SELECT 1 AS found FROM social_notifications WHERE dedupe_key = ? LIMIT 1', [dedupeKey]);
      if (sentBefore || await hasUpcomingMatch(db, userId) || await recentlyNudged(db, userId)) { results.skipped += 1; continue; }
      const history = await playedMatches(db, userId);
      const match = await suggestMatch(db, userId, history, now);
      // Sin partido que proponer no hay mensaje: se reintenta en la siguiente pasada.
      if (!match) { results.skipped += 1; continue; }
      const balance = await balanceIn(db, userId, match.location_id);
      const message = buildReactivationMessage(stage, match, { balance, now });
      const ok = await createSocialNotification(db, {
        userId,
        type: 'reactivation',
        entityType: 'match',
        entityId: match.id,
        title: message.title,
        body: message.body,
        data: { type: 'reactivation', screen: 'Match', matchId: match.id, stage },
        dedupeKey,
      });
      if (ok) results.sent += 1; else results.skipped += 1;
    } catch (error) {
      results.failed += 1;
      console.error('[REACTIVATION]', { userId, error: error?.message || error });
    }
  }
  return results;
}

/**
 * Recordatorio de EasyPass parados: saldo positivo, sin movimientos en 21
 * días y sin partido apuntado. Una vez por periodo de inactividad, y nunca a
 * menos de una semana de otro aviso de retención (la reactivación ya
 * menciona el saldo).
 */
export async function sendIdleBalanceReminders({ db = pool, now = new Date() } = {}) {
  const results = { scanned: 0, sent: 0, skipped: 0, failed: 0 };
  const [rows] = await db.query(
    `SELECT b.user_id, b.location_id, b.balance,
            (SELECT MAX(t.created_at) FROM easypass_transactions t WHERE t.user_id = b.user_id) AS last_activity
     FROM user_easypass_balances b
     WHERE b.balance > 0
     ORDER BY b.user_id, b.balance DESC`
  );
  const byUser = new Map();
  for (const row of rows) if (!byUser.has(Number(row.user_id))) byUser.set(Number(row.user_id), row);

  for (const [userId, row] of byUser) {
    if (results.sent >= MAX_SENDS_PER_RUN) break;
    if (!row.last_activity || daysSince(row.last_activity, now) < IDLE_BALANCE_DAYS) continue;
    results.scanned += 1;
    try {
      const dedupeKey = `idle-balance:${userId}:${new Date(row.last_activity).toISOString().slice(0, 10)}`;
      const [[sentBefore]] = await db.query('SELECT 1 AS found FROM social_notifications WHERE dedupe_key = ? LIMIT 1', [dedupeKey]);
      if (sentBefore || await hasUpcomingMatch(db, userId) || await recentlyNudged(db, userId, 7 * 24)) { results.skipped += 1; continue; }
      const [next] = await openMatches(db, {
        locationId: row.location_id,
        from: new Date(now.getTime() + 2 * HOUR_MS),
        to: new Date(now.getTime() + 8 * DAY_MS),
      });
      const balance = Number(row.balance);
      const message = buildIdleBalanceMessage(balance, next || null, now);
      const ok = await createSocialNotification(db, {
        userId,
        type: 'idle_balance',
        entityType: next ? 'match' : 'user',
        entityId: next ? next.id : userId,
        title: message.title,
        body: message.body,
        data: next ? { type: 'idle_balance', screen: 'Match', matchId: next.id } : { type: 'idle_balance', screen: 'Matchs' },
        dedupeKey,
      });
      if (ok) results.sent += 1; else results.skipped += 1;
    } catch (error) {
      results.failed += 1;
      console.error('[IDLE BALANCE]', { userId, error: error?.message || error });
    }
  }
  return results;
}

let schedulerStarted = false;
let schedulerRunning = false;

/** Cada 15 minutos, solo de 10:00 a 22:00 en Madrid. */
export function startRetentionScheduler({ intervalMinutes = 15 } = {}) {
  if (schedulerStarted) return;
  schedulerStarted = true;
  registerScheduler('retention-nudges', { maxAgeSeconds: 40 * 60 });

  const run = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      if (isSendingHour()) {
        const slot = await sendSlotAlerts();
        const reactivation = await sendReactivationNudges();
        const idle = await sendIdleBalanceReminders();
        if (slot.sent || reactivation.sent || idle.sent || slot.failed || reactivation.failed || idle.failed) {
          console.log('[RETENTION]', { slot, reactivation, idle });
        }
      }
      markSchedulerSuccess('retention-nudges');
    } catch (error) {
      markSchedulerFailure('retention-nudges', error);
      console.error('[RETENTION] Error ejecutando avisos:', error?.message || error);
    } finally {
      schedulerRunning = false;
    }
  };

  run();
  setInterval(run, Math.max(5, Number(intervalMinutes) || 15) * 60 * 1000);
}
