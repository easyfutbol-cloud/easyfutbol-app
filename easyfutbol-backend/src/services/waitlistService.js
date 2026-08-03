import { pool } from '../config/db.js';
import { sendPushNotification } from './pushService.js';

const OFFER_MINUTES = 30;

export async function processWaitlistForMatch(matchId) {
  const conn = await pool.getConnection();
  const notifications = [];

  try {
    await conn.beginTransaction();

    const [[match]] = await conn.query(
      `SELECT id, title, starts_at, capacity, spots_taken, status
       FROM matches WHERE id = ? FOR UPDATE`,
      [matchId]
    );
    if (!match || !['scheduled', 'open'].includes(match.status) || new Date(match.starts_at).getTime() <= Date.now()) {
      await conn.rollback();
      return { offered: 0 };
    }

    await conn.query(
      `UPDATE match_waitlist
       SET status = 'expired', updated_at = NOW()
       WHERE match_id = ? AND status = 'offered' AND offer_expires_at <= NOW()`,
      [matchId]
    );

    const [[offerCountRow]] = await conn.query(
      `SELECT COUNT(*) AS count FROM match_waitlist
       WHERE match_id = ? AND status = 'offered' AND offer_expires_at > NOW()`,
      [matchId]
    );
    const freeSpots = Math.max(Number(match.capacity || 0) - Number(match.spots_taken || 0), 0);
    const offersToCreate = Math.max(freeSpots - Number(offerCountRow?.count || 0), 0);

    if (!offersToCreate) {
      await conn.commit();
      return { offered: 0 };
    }

    const [candidates] = await conn.query(
      `SELECT mw.id, mw.user_id
       FROM match_waitlist mw
       WHERE mw.match_id = ? AND mw.status = 'waiting'
       ORDER BY mw.is_plus_snapshot DESC, mw.created_at ASC
       LIMIT ?
       FOR UPDATE`,
      [matchId, offersToCreate]
    );

    for (const candidate of candidates) {
      await conn.query(
        `UPDATE match_waitlist
         SET status = 'offered', notified_at = NOW(), offer_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
         WHERE id = ?`,
        [OFFER_MINUTES, candidate.id]
      );
      const [tokenRows] = await conn.query(
        `SELECT expo_push_token FROM push_tokens
         WHERE user_id = ? AND is_active = 1`,
        [candidate.user_id]
      );
      notifications.push({
        tokens: tokenRows.map((row) => row.expo_push_token).filter(Boolean),
        userId: candidate.user_id,
      });
    }

    await conn.commit();

    for (const notification of notifications) {
      await sendPushNotification(notification.tokens, {
        title: '¡Hay una plaza para ti!',
        body: `Se ha liberado una plaza en ${match.title}. Tienes 30 minutos para reservarla.`,
        data: {
          type: 'waitlist_offer',
          screen: 'Match',
          matchId: Number(match.id),
          expiresInMinutes: OFFER_MINUTES,
        },
      });
    }

    return { offered: candidates.length };
  } catch (error) {
    await conn.rollback();
    console.error('[WAITLIST] No se pudo procesar la cola:', error);
    throw error;
  } finally {
    conn.release();
  }
}

let schedulerRunning = false;
let processing = false;

export function startWaitlistScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;

  const run = async () => {
    if (processing) return;
    processing = true;
    try {
      const [rows] = await pool.query(
        `SELECT DISTINCT mw.match_id
         FROM match_waitlist mw
         JOIN matches m ON m.id = mw.match_id
         WHERE m.starts_at > NOW()
           AND m.status IN ('scheduled', 'open')
           AND (mw.status = 'waiting' OR (mw.status = 'offered' AND mw.offer_expires_at <= NOW()))`
      );
      for (const row of rows) await processWaitlistForMatch(Number(row.match_id));
    } catch (error) {
      console.error('[WAITLIST] Error del programador:', error);
    } finally {
      processing = false;
    }
  };

  run();
  const timer = setInterval(run, 60 * 1000);
  timer.unref?.();
}
