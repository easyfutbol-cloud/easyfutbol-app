// Racha, retos y EasyPoints sobre la base de datos. Las reglas viven en
// engagementRules.js; aquí solo se leen partidos y se apuntan premios.
// Solo cuentan los partidos con el acta publicada (match_player_stats.result
// no nulo): las estadísticas en directo pueden corregirse hasta entonces.
import { pool } from '../config/db.js';
import { createSocialNotification } from './socialService.js';
import {
  CHALLENGES,
  computeStreak,
  evaluateChallenge,
  periodEndsOn,
  periodKey,
  reachedStreakMilestones,
  shiftPeriod,
  weekKey,
} from './engagementRules.js';

export async function getPlayedMatches(db, userId) {
  const [rows] = await db.query(
    `SELECT m.id AS match_id, m.starts_at, mps.goals, mps.assists, mps.saves, CAST(mps.is_mvp AS UNSIGNED) AS is_mvp
     FROM match_player_stats mps
     JOIN matches m ON m.id = mps.match_id
     WHERE mps.user_id = ? AND mps.result IS NOT NULL`,
    [userId]
  );
  return rows;
}

export async function getEasyPointsBalance(db, userId) {
  const [[row]] = await db.query('SELECT COALESCE(SUM(amount), 0) AS balance FROM easypoints_ledger WHERE user_id = ?', [userId]);
  return Number(row.balance);
}

/**
 * Calcula racha y retos y apunta los premios que falten. Es idempotente
 * (source_key único por usuario), así que se puede llamar al abrir la
 * pantalla y al publicar cada acta. Además del periodo actual mira el
 * anterior: un acta del domingo publicada el lunes también cuenta.
 */
export async function syncEngagement(userId, { db = pool, now = new Date() } = {}) {
  const matches = await getPlayedMatches(db, userId);
  const streak = computeStreak(matches.map((m) => weekKey(m.starts_at)).filter(Boolean), weekKey(now));

  const challenges = [];
  const candidates = [];
  for (const challenge of CHALLENGES) {
    const currentKey = periodKey(challenge.period, now);
    const current = evaluateChallenge(challenge, matches, currentKey);
    challenges.push({
      code: challenge.code,
      title: challenge.title,
      icon: challenge.icon,
      period: challenge.period,
      target: challenge.target,
      reward: challenge.reward,
      progress: current.progress,
      completed: current.completed,
      ends_on: periodEndsOn(challenge.period, currentKey),
    });
    for (const state of [current, evaluateChallenge(challenge, matches, shiftPeriod(challenge.period, currentKey, -1))]) {
      if (state.completed) {
        candidates.push({ amount: challenge.reward, type: 'challenge', key: state.source_key, description: `Reto: ${challenge.title}` });
      }
    }
  }
  for (const milestone of reachedStreakMilestones(streak)) {
    candidates.push({ amount: milestone.reward, type: 'streak', key: milestone.source_key, description: `Racha de ${milestone.weeks} semanas` });
  }

  const awarded = [];
  for (const candidate of candidates) {
    const [result] = await db.query(
      `INSERT IGNORE INTO easypoints_ledger (user_id, amount, source_type, source_key, description)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, candidate.amount, candidate.type, candidate.key, candidate.description]
    );
    if (result.affectedRows) awarded.push(candidate);
  }

  return { streak, challenges, awarded };
}

/**
 * Tras publicar un acta: evalúa a cada jugador y le avisa si ha completado
 * algún reto o hito de racha. Un fallo con un jugador no afecta al resto.
 */
export async function syncEngagementAfterMatch(matchId) {
  const [players] = await pool.query('SELECT user_id FROM match_player_stats WHERE match_id = ? AND result IS NOT NULL', [matchId]);
  let rewarded = 0;
  for (const { user_id: userId } of players) {
    try {
      const { awarded } = await syncEngagement(userId);
      if (!awarded.length) continue;
      rewarded += 1;
      const total = awarded.reduce((sum, item) => sum + item.amount, 0);
      const body = awarded.length === 1
        ? `${awarded[0].description.replace(/^Reto: /, '')} · +${total} EasyPoints`
        : `Has completado ${awarded.length} retos · +${total} EasyPoints`;
      await createSocialNotification(pool, {
        userId,
        type: 'easypoints_reward',
        entityType: 'match',
        entityId: matchId,
        title: '🎯 ¡Reto completado!',
        body: body.slice(0, 255),
        data: { type: 'easypoints_reward', screen: 'Challenges' },
        dedupeKey: `easypoints-reward:${matchId}:${userId}`,
      });
    } catch (error) {
      console.error('[syncEngagementAfterMatch]', { userId, matchId, error: error?.message || error });
    }
  }
  return { rewarded, total: players.length };
}
