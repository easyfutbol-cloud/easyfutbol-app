

import { pool } from '../config/db.js';
import { ACHIEVEMENT_CATALOG, getAchievementProgress } from './achievementCatalog.js';

async function addPoints(userId, points, sourceType, sourceId = null, description = null) {
  if (!userId || !points) return;

  await pool.query(
    `INSERT INTO points_ledger (user_id, points, source_type, source_id, description)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, points, sourceType, sourceId, description]
  );

  await pool.query(
    `UPDATE users
     SET achievement_points = COALESCE(achievement_points, 0) + ?
     WHERE id = ?`,
    [points, userId]
  );
}

async function unlockAchievement(userId, code, matchId = null) {
  const [achievementRows] = await pool.query(
    `SELECT id, name, points
     FROM achievements
     WHERE code = ? AND is_active = 1
     LIMIT 1`,
    [code]
  );

  if (!achievementRows.length) return false;

  const achievement = achievementRows[0];

  const [existingRows] = await pool.query(
    `SELECT id
     FROM user_achievements
     WHERE user_id = ? AND achievement_id = ?
     LIMIT 1`,
    [userId, achievement.id]
  );

  if (existingRows.length) return false;

  const [insertResult] = await pool.query(
    `INSERT INTO user_achievements (user_id, achievement_id, match_id)
     VALUES (?, ?, ?)`,
    [userId, achievement.id, matchId]
  );

  await addPoints(
    userId,
    achievement.points,
    'achievement',
    insertResult.insertId,
    `Logro desbloqueado: ${achievement.name}`
  );

  return true;
}

export async function awardReward(
  userId,
  code,
  matchId = null,
  weekLabel = null,
  monthLabel = null,
  awardedByUserId = null,
  notes = null
) {
  const [rewardRows] = await pool.query(
    `SELECT id, name, points
     FROM reward_types
     WHERE code = ? AND is_active = 1
     LIMIT 1`,
    [code]
  );

  if (!rewardRows.length) return false;

  const reward = rewardRows[0];

  const [insertResult] = await pool.query(
    `INSERT INTO user_rewards
     (user_id, reward_type_id, match_id, week_label, month_label, awarded_by_user_id, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, reward.id, matchId, weekLabel, monthLabel, awardedByUserId, notes]
  );

  await addPoints(
    userId,
    reward.points,
    'reward',
    insertResult.insertId,
    `Recompensa obtenida: ${reward.name}`
  );

  return true;
}

/** Códigos del catálogo cuyo objetivo ya se ha alcanzado con este progreso. */
export function getReachedAchievementCodes(progressByType) {
  return ACHIEVEMENT_CATALOG
    .filter((item) => Number(progressByType?.[item.type] || 0) >= item.target)
    .map((item) => item.code);
}

/**
 * Desbloquea (y suma sus puntos) los logros que el jugador ya ha alcanzado en
 * la temporada. Usa el mismo catálogo y progreso que la pantalla de Logros, así
 * que lo que se ve y lo que se desbloquea nunca se desincronizan. El bloqueo
 * por usuario evita sumar dos veces los puntos si se guardan dos actas a la vez.
 */
export async function syncUserAchievements(userId) {
  if (!userId) return [];
  const conn = await pool.getConnection();
  const lockName = `achievements:${userId}`;
  try {
    const [[lock]] = await conn.query('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
    if (Number(lock?.acquired) !== 1) throw new Error(`No se pudo bloquear los logros del usuario ${userId}`);
    const progress = await getAchievementProgress(pool, userId);
    const unlocked = [];
    for (const code of getReachedAchievementCodes(progress)) {
      if (await unlockAchievement(userId, code)) unlocked.push(code);
    }
    return unlocked;
  } finally {
    await conn.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    conn.release();
  }
}

/** Compatibilidad con scripts/recalculateAchievements.js: recalcula al jugador entero. */
export async function checkAndUnlockAchievements(userId) {
  return syncUserAchievements(userId);
}
