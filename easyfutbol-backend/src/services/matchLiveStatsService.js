// Mantiene sincronizadas las estadísticas oficiales (match_player_stats +
// inscriptions) con lo que se va apuntando en vivo desde "Apuntar eventos".
// Un gol/parada/asistencia suma o resta 1 según se cree, edite o borre el
// evento; el MVP es exclusivo (solo puede haber uno por partido).
import { pool } from '../config/db.js';
import { createSocialNotification } from './socialService.js';

const STAT_COLUMN_BY_TYPE = { goal: 'goals', save: 'saves' };

async function bumpStat(conn, matchId, userId, column, delta) {
  if (!userId || !delta) return;
  await conn.query(
    `INSERT INTO match_player_stats (match_id, user_id, ${column})
     VALUES (?, ?, GREATEST(?, 0))
     ON DUPLICATE KEY UPDATE ${column} = GREATEST(${column} + ?, 0)`,
    [matchId, userId, delta, delta]
  );
  await conn.query(
    `UPDATE inscriptions SET ${column} = GREATEST(COALESCE(${column}, 0) + ?, 0)
     WHERE match_id=? AND status='confirmed' AND (user_id=? OR assigned_user_id=?)`,
    [delta, matchId, userId, userId]
  );
}

/** Aplica (delta=+1) o revierte (delta=-1) el efecto de un evento gol/parada en las estadísticas. */
export async function applyEventStatDelta(conn, { matchId, type, userId, assistUserId }, delta) {
  const column = STAT_COLUMN_BY_TYPE[type];
  if (!column) return; // el MVP se gestiona aparte (setMvp/clearMvp)
  await bumpStat(conn, matchId, userId, column, delta);
  if (type === 'goal' && assistUserId) {
    await bumpStat(conn, matchId, assistUserId, 'assists', delta);
  }
}

/** Convierte a un jugador en el MVP del partido (quita el MVP a cualquier otro). */
export async function setMvp(conn, matchId, userId) {
  await conn.query('UPDATE match_player_stats SET is_mvp=0 WHERE match_id=?', [matchId]);
  await conn.query(
    `INSERT INTO match_player_stats (match_id, user_id, is_mvp)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE is_mvp=1`,
    [matchId, userId]
  );
  await conn.query('UPDATE inscriptions SET is_mvp=0 WHERE match_id=? AND status=\'confirmed\'', [matchId]);
  await conn.query(
    `UPDATE inscriptions SET is_mvp=1
     WHERE match_id=? AND status='confirmed' AND (user_id=? OR assigned_user_id=?)`,
    [matchId, userId, userId]
  );
}

/** Quita el MVP de un jugador concreto (al borrar el evento mvp). */
export async function clearMvp(conn, matchId, userId) {
  await conn.query('UPDATE match_player_stats SET is_mvp=0 WHERE match_id=? AND user_id=?', [matchId, userId]);
  await conn.query(
    `UPDATE inscriptions SET is_mvp=0
     WHERE match_id=? AND status='confirmed' AND (user_id=? OR assigned_user_id=?)`,
    [matchId, userId, userId]
  );
}

/**
 * Aplica el resultado final a todos los jugadores confirmados del partido,
 * según su color de camiseta. winnerColor: 'white' | 'black' | 'draw'.
 */
export async function applyMatchResult(matchId, winnerColor) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [players] = await conn.query(
      `SELECT COALESCE(assigned_user_id, user_id) AS user_id, ticket_type
       FROM inscriptions WHERE match_id=? AND status='confirmed'`,
      [matchId]
    );

    for (const player of players) {
      const result = winnerColor === 'draw'
        ? 'draw'
        : player.ticket_type === winnerColor ? 'win' : 'loss';
      await conn.query(
        `INSERT INTO match_player_stats (match_id, user_id, result)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE result=VALUES(result)`,
        [matchId, player.user_id, result]
      );
    }
    await conn.commit();
    return players.length;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

const RESULT_LABELS = { win: 'Victoria', loss: 'Derrota', draw: 'Empate' };

function buildResultNotificationBody(stat) {
  const resultLabel = RESULT_LABELS[stat.result] || 'Partido completado';
  const goals = Number(stat.goals || 0);
  const assists = Number(stat.assists || 0);
  const saves = Number(stat.saves || 0);
  const parts = [`${goals} ${goals === 1 ? 'gol' : 'goles'}`, `${assists} ${assists === 1 ? 'asistencia' : 'asistencias'}`];
  if (saves) parts.push(`${saves} ${saves === 1 ? 'parada' : 'paradas'}`);
  if (stat.is_mvp) parts.push('MVP del partido ⭐');
  return `${resultLabel} · ${parts.join(' · ')}`;
}

/**
 * Avisa a cada jugador con cuenta y estadísticas en el partido —los
 * invitados sin cuenta no están en match_player_stats, así que no se les
 * puede notificar— con su actuación personal, justo al cerrar el resultado
 * final. Un fallo al notificar nunca debe tirar abajo la petición que cerró
 * el resultado, así que cada aviso va envuelto en su propio try/catch.
 */
export async function notifyMatchResultToPlayers(matchId) {
  const [[match]] = await pool.query('SELECT id, title FROM matches WHERE id=? LIMIT 1', [matchId]);
  if (!match) return { sent: 0, total: 0 };

  const [stats] = await pool.query(
    `SELECT user_id, goals, assists, saves, CAST(is_mvp AS UNSIGNED) AS is_mvp, result
     FROM match_player_stats WHERE match_id=?`,
    [matchId]
  );

  let sent = 0;
  await Promise.all(stats.map(async (stat) => {
    try {
      const ok = await createSocialNotification(pool, {
        userId: stat.user_id,
        type: 'post_match_summary',
        entityType: 'match',
        entityId: matchId,
        title: `⚽ ${match.title || 'Resumen del partido'}`,
        body: buildResultNotificationBody(stat),
        data: { type: 'post_match_summary', screen: 'PostMatchSummary', matchId },
        dedupeKey: `post-match-summary:${matchId}:${stat.user_id}`,
      });
      if (ok) sent += 1;
    } catch (error) {
      console.error('[notifyMatchResultToPlayers]', { userId: stat.user_id, matchId, error: error?.message || error });
    }
  }));
  return { sent, total: stats.length };
}
