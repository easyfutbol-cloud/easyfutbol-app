

import { pool } from '../config/db.js';
import { sendPushNotification } from './pushService.js';
import { markSchedulerFailure, markSchedulerSuccess, registerScheduler } from './operationalHealthService.js';
import { isNotificationPushEnabled } from './socialService.js';

function formatMatchHour(startsAtISO) {
  return new Date(startsAtISO).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Madrid',
  });
}

function getMatchDayLabel(startsAtISO) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const matchDay = formatter.format(new Date(startsAtISO));
  const today = formatter.format(new Date());
  const tomorrow = formatter.format(new Date(Date.now() + 24 * 60 * 60 * 1000));
  if (matchDay === today) return 'Hoy';
  if (matchDay === tomorrow) return 'Mañana';
  return 'Próximamente';
}

function formatTicketSummary({ total_tickets, white_tickets, black_tickets }) {
  const total = Number(total_tickets || 0);
  const white = Number(white_tickets || 0);
  const black = Number(black_tickets || 0);
  const parts = [];
  if (white) parts.push(`${white} ${white === 1 ? 'blanca' : 'blancas'}`);
  if (black) parts.push(`${black} ${black === 1 ? 'negra' : 'negras'}`);
  if (!parts.length) return total === 1 ? 'Tienes 1 entrada.' : `Tienes ${total} entradas.`;
  const colors = parts.length === 2 ? `${parts[0]} y ${parts[1]}` : parts[0];
  return total === 1
    ? `Tienes 1 entrada de camiseta ${colors}.`
    : `Tienes ${total} entradas: ${colors}.`;
}

function buildReminderBody(candidate) {
  const { starts_at, field_name } = candidate;
  const hour = formatMatchHour(starts_at);
  const field = field_name || 'el campo indicado en la app';
  return `${getMatchDayLabel(starts_at)} a las ${hour} tienes partido en ${field}. ${formatTicketSummary(candidate)}`;
}

export async function sendMatchReminders({ hoursAhead = 4, windowMinutes = 10 } = {}) {
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
       COUNT(*) AS total_tickets,
       SUM(CASE WHEN i.ticket_type = 'white' THEN 1 ELSE 0 END) AS white_tickets,
       SUM(CASE WHEN i.ticket_type = 'black' THEN 1 ELSE 0 END) AS black_tickets
     FROM inscriptions i
     INNER JOIN matches m ON m.id = i.match_id
     LEFT JOIN fields f ON f.id = m.field_id
     LEFT JOIN push_notification_logs pnl
       ON pnl.user_id = i.user_id
      AND pnl.match_id = i.match_id
      AND pnl.type = 'match_reminder'
     WHERE i.status IN ('confirmed', 'paid', 'active')
       AND m.status <> 'cancelled'
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
    skippedByPreference: 0,
    failed: 0,
  };

  for (const candidate of candidates) {
    try {
      if (!await isNotificationPushEnabled(pool,candidate.user_id,'match_reminders_enabled')) {
        await pool.query(
          `INSERT INTO push_notification_logs (user_id, match_id, type)
           VALUES (?, ?, 'match_reminder')
           ON DUPLICATE KEY UPDATE sent_at = CURRENT_TIMESTAMP`,
          [candidate.user_id,candidate.match_id]
        );
        results.skippedByPreference += 1;
        continue;
      }
      const [tokenRows] = await pool.query(
        `SELECT CONVERT(push_token USING utf8mb4) COLLATE utf8mb4_unicode_ci AS push_token
         FROM users
         WHERE id = ? AND push_token IS NOT NULL AND push_token <> ''
         UNION
         SELECT CONVERT(expo_push_token USING utf8mb4) COLLATE utf8mb4_unicode_ci AS push_token
         FROM push_tokens
         WHERE user_id = ? AND is_active = 1`,
        [candidate.user_id, candidate.user_id]
      );

      const tokens = [...new Set((tokenRows || []).map(row => row.push_token).filter(Boolean))];

      if (!tokens.length) {
        results.skippedWithoutTokens += 1;
        continue;
      }

      const title = 'Tu partido es en 4 horas';
      const body = buildReminderBody(candidate);

      await sendPushNotification(tokens, {
        title,
        body,
        data: {
          type: 'match_reminder',
          screen: 'Match',
          matchId: candidate.match_id,
          totalTickets: Number(candidate.total_tickets || 0),
          whiteTickets: Number(candidate.white_tickets || 0),
          blackTickets: Number(candidate.black_tickets || 0),
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

let schedulerStarted = false;
let schedulerRunning = false;

/** Revisa cada cinco minutos los partidos que empiezan dentro de cuatro horas. */
export function startMatchReminderScheduler({ intervalMinutes = 5 } = {}) {
  if (schedulerStarted) return;
  schedulerStarted = true;
  registerScheduler('match-reminders', { maxAgeSeconds: 10 * 60 });

  const run = async () => {
    if (schedulerRunning) return;
    schedulerRunning = true;
    try {
      const result = await sendMatchReminders({ hoursAhead: 4, windowMinutes: 10 });
      markSchedulerSuccess('match-reminders');
      if (result.scanned || result.failed) console.log('[REMINDERS 4H]', result);
    } catch (error) {
      markSchedulerFailure('match-reminders', error);
      console.error('[REMINDERS 4H] Error ejecutando recordatorios:', error?.message || error);
    } finally {
      schedulerRunning = false;
    }
  };

  run();
  setInterval(run, Math.max(1, Number(intervalMinutes) || 5) * 60 * 1000);
}
