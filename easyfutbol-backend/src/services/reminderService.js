

import { pool } from '../config/db.js';
import { sendPushNotification } from './pushService.js';

function formatMatchHour(startsAtISO) {
  return new Date(startsAtISO).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function buildReminderBody({ starts_at, field_name, shirt_color }) {
  const hour = formatMatchHour(starts_at);
  const field = field_name || 'el campo indicado en la app';
  const shirt = String(shirt_color || '').trim().toLowerCase();

  if (shirt) {
    return `Recuerda tu partido a las ${hour} en ${field}. Lleva camiseta ${shirt}.`;
  }

  return `Recuerda tu partido a las ${hour} en ${field}.`;
}

export async function sendMatchReminders({ hoursAhead = 6, windowMinutes = 15 } = {}) {
  const now = new Date();
  const targetTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
  const windowStart = new Date(targetTime.getTime() - windowMinutes * 60 * 1000);
  const windowEnd = new Date(targetTime.getTime() + windowMinutes * 60 * 1000);

  const [candidates] = await pool.query(
    `SELECT
       i.user_id,
       i.match_id,
       m.starts_at,
       m.title AS match_title,
       f.name AS field_name,
       MAX(NULLIF(i.ticket_type, '')) AS shirt_color
     FROM inscriptions i
     INNER JOIN matches m ON m.id = i.match_id
     LEFT JOIN fields f ON f.id = m.field_id
     LEFT JOIN push_notification_logs pnl
       ON pnl.user_id = i.user_id
      AND pnl.match_id = i.match_id
      AND pnl.type = 'match_reminder'
     WHERE i.status = 'confirmed'
       AND m.starts_at >= ?
       AND m.starts_at <= ?
       AND pnl.id IS NULL
     GROUP BY i.user_id, i.match_id, m.starts_at, m.title, f.name
     ORDER BY m.starts_at ASC`,
    [windowStart, windowEnd]
  );

  const results = {
    scanned: candidates.length,
    sent: 0,
    skippedWithoutTokens: 0,
    failed: 0,
  };

  for (const candidate of candidates) {
    try {
      const [tokenRows] = await pool.query(
        `SELECT expo_push_token
         FROM push_tokens
         WHERE user_id = ? AND is_active = 1`,
        [candidate.user_id]
      );

      const tokens = (tokenRows || []).map(row => row.expo_push_token).filter(Boolean);

      if (!tokens.length) {
        results.skippedWithoutTokens += 1;
        continue;
      }

      const title = 'Hoy juegas';
      const body = buildReminderBody(candidate);

      await sendPushNotification(tokens, {
        title,
        body,
        data: {
          type: 'match_reminder',
          screen: 'EventDetails',
          matchId: candidate.match_id,
        },
      });

      await pool.query(
        `INSERT INTO push_notification_logs (user_id, match_id, type)
         VALUES (?, ?, 'match_reminder')
         ON DUPLICATE KEY UPDATE sent_at = CURRENT_TIMESTAMP`,
        [candidate.user_id, candidate.match_id]
      );

      results.sent += 1;
    } catch (error) {
      results.failed += 1;
      console.error(
        'Error enviando recordatorio push:',
        {
          userId: candidate.user_id,
          matchId: candidate.match_id,
          error: error?.message || error,
        }
      );
    }
  }

  return {
    ok: true,
    windowStart,
    windowEnd,
    ...results,
  };
}