// Lo social es lo que más retiene: tras el partido se sugieren como amigos
// los compañeros con los que has jugado, y cuando alguien se apunta a un
// partido se avisa a sus amigos.
import { pool } from '../config/db.js';
import { createSocialNotification } from './socialService.js';
import { markSchedulerFailure, markSchedulerSuccess, registerScheduler } from './operationalHealthService.js';
import { buildFriendJoinedMessage, isSendingHour } from './retentionRules.js';

const HOUR_MS = 60 * 60 * 1000;
const ACTIVE_INSCRIPTION = "i.status IN ('confirmed','paid','active')";
const NOT_BLOCKED = (a, b) => `NOT EXISTS (SELECT 1 FROM user_blocks ub
  WHERE (ub.blocker_id = ${a} AND ub.blocked_id = ${b}) OR (ub.blocker_id = ${b} AND ub.blocked_id = ${a}))`;
// Las inscripciones de la noche se avisan a las 10:00 (el aviso solo sale de día).
const LOOKBACK_HOURS = 14;
const MAX_FRIEND_ALERTS_PER_DAY = 2;
const MAX_SENDS_PER_RUN = 200;

/**
 * Jugadores del partido que aún no son tus amigos (ni hay solicitud
 * pendiente o rechazada, ni bloqueo), primero con los que más has jugado.
 */
export async function getTeammateSuggestions(db, { matchId, userId, limit = 8 }) {
  const [rows] = await db.query(
    `SELECT u.id, u.name, u.avatar_url,
            GREATEST(1, (SELECT COUNT(DISTINCT a.match_id) FROM match_player_stats a
                         JOIN match_player_stats b ON b.match_id = a.match_id
                         WHERE a.user_id = ? AND b.user_id = u.id)) AS matches_together
     FROM (
       SELECT COALESCE(i.assigned_user_id, i.user_id) AS user_id FROM inscriptions i
       WHERE i.match_id = ? AND ${ACTIVE_INSCRIPTION}
       UNION
       SELECT mps.user_id FROM match_player_stats mps WHERE mps.match_id = ?
     ) p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN friendships f ON f.user_low_id = LEAST(?, u.id) AND f.user_high_id = GREATEST(?, u.id)
     WHERE u.id <> ? AND (f.id IS NULL OR f.status = 'cancelled') AND ${NOT_BLOCKED('?', 'u.id')}
     ORDER BY matches_together DESC, u.name ASC
     LIMIT ?`,
    [userId, matchId, matchId, userId, userId, userId, userId, userId, limit]
  );
  return rows.map((row) => ({ ...row, matches_together: Number(row.matches_together) }));
}

/**
 * "Pablo se ha apuntado al del jueves": a los amigos de quien se apunta a un
 * partido con plazas. Respeta la privacidad ("mostrar mis próximos partidos a
 * mis amigos"), los bloqueos y la preferencia social; como mucho un aviso
 * por partido y amigo, y dos al día por amigo.
 */
export async function sendFriendJoinedAlerts({ db = pool, now = new Date() } = {}) {
  const results = { joins: 0, sent: 0, skipped: 0, failed: 0 };
  const [joins] = await db.query(
    `SELECT DISTINCT COALESCE(i.assigned_user_id, i.user_id) AS actor_id, u.name AS actor_name,
            m.id AS match_id, m.starts_at, f.name AS field_name,
            GREATEST(m.capacity - m.spots_taken, 0) AS spots_left
     FROM inscriptions i
     JOIN matches m ON m.id = i.match_id
     JOIN users u ON u.id = COALESCE(i.assigned_user_id, i.user_id)
     LEFT JOIN fields f ON f.id = m.field_id
     LEFT JOIN user_social_privacy usp ON usp.user_id = u.id
     WHERE ${ACTIVE_INSCRIPTION} AND i.created_at >= ?
       AND m.status IN ('scheduled','open') AND m.spots_taken < m.capacity AND m.starts_at > ?
       AND COALESCE(usp.show_upcoming_to_friends, 1) = 1`,
    [new Date(now.getTime() - LOOKBACK_HOURS * HOUR_MS), new Date(now.getTime() + 2 * HOUR_MS)]
  );

  for (const join of joins) {
    results.joins += 1;
    const actorId = Number(join.actor_id);
    const [friends] = await db.query(
      `SELECT u.id FROM friendships f
       JOIN users u ON u.id = IF(f.requester_id = ?, f.addressee_id, f.requester_id)
       WHERE f.status = 'accepted' AND (f.requester_id = ? OR f.addressee_id = ?)
         AND ${NOT_BLOCKED('?', 'u.id')}
         AND NOT EXISTS (SELECT 1 FROM inscriptions i WHERE i.match_id = ? AND ${ACTIVE_INSCRIPTION}
                         AND (i.user_id = u.id OR i.assigned_user_id = u.id))
         AND NOT EXISTS (SELECT 1 FROM match_waitlist mw WHERE mw.match_id = ? AND mw.user_id = u.id
                         AND mw.status IN ('waiting','offered'))`,
      [actorId, actorId, actorId, actorId, actorId, join.match_id, join.match_id]
    );
    const message = buildFriendJoinedMessage(join.actor_name, { ...join, spots_left: Number(join.spots_left) }, now);

    for (const { id: friendId } of friends) {
      if (results.sent >= MAX_SENDS_PER_RUN) return results;
      try {
        const [[today]] = await db.query(
          `SELECT COUNT(*) AS total FROM social_notifications
           WHERE user_id = ? AND type = 'friend_joined' AND created_at >= ?`,
          [friendId, new Date(now.getTime() - 24 * HOUR_MS)]
        );
        if (Number(today.total) >= MAX_FRIEND_ALERTS_PER_DAY) { results.skipped += 1; continue; }
        const ok = await createSocialNotification(db, {
          userId: friendId,
          actorId,
          type: 'friend_joined',
          entityType: 'match',
          entityId: join.match_id,
          title: message.title,
          body: message.body,
          data: { type: 'friend_joined', screen: 'Match', matchId: join.match_id },
          dedupeKey: `friend-joined:${join.match_id}:${friendId}`,
        });
        if (ok) results.sent += 1; else results.skipped += 1;
      } catch (error) {
        results.failed += 1;
        console.error('[FRIEND JOINED]', { friendId, matchId: join.match_id, error: error?.message || error });
      }
    }
  }
  return results;
}

let schedulerStarted = false;
let schedulerRunning = false;

/** Cada 5 minutos, de 10:00 a 22:00 en Madrid. */
export function startFriendJoinedScheduler({ intervalMinutes = 5 } = {}) {
  if (schedulerStarted) return;
  schedulerStarted = true;
  registerScheduler('friend-joined', { maxAgeSeconds: 15 * 60 });

  const run = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      if (isSendingHour()) {
        const result = await sendFriendJoinedAlerts();
        if (result.sent || result.failed) console.log('[FRIEND JOINED]', result);
      }
      markSchedulerSuccess('friend-joined');
    } catch (error) {
      markSchedulerFailure('friend-joined', error);
      console.error('[FRIEND JOINED] Error ejecutando avisos:', error?.message || error);
    } finally {
      schedulerRunning = false;
    }
  };

  run();
  setInterval(run, Math.max(1, Number(intervalMinutes) || 5) * 60 * 1000);
}
