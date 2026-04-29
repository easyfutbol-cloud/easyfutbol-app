

import { pool } from '../config/db.js';

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

export async function checkAndUnlockAchievements(userId, matchId = null) {
  if (!userId || !matchId) return;

  const seasonStartDateSql = '2026-05-01 00:00:00';

  const [matchRows] = await pool.query(
    `SELECT mps.goals, mps.assists, mps.is_mvp, m.starts_at
     FROM match_player_stats mps
     JOIN matches m ON m.id = mps.match_id
     WHERE mps.match_id = ?
       AND mps.user_id = ?
     ORDER BY mps.id DESC
     LIMIT 1`,
    [matchId, userId]
  );

  const seasonStartDate = new Date('2026-05-01T00:00:00');
  const currentMatch = matchRows[0] || { goals: 0, assists: 0, is_mvp: 0, starts_at: null };
  const isSeasonMatch =
    currentMatch.starts_at && new Date(currentMatch.starts_at) >= seasonStartDate;

  if (isSeasonMatch && currentMatch.goals >= 1) {
    await unlockAchievement(userId, 'FIRST_GOAL', matchId);
  }

  if (isSeasonMatch && currentMatch.assists >= 1) {
    await unlockAchievement(userId, 'FIRST_ASSIST', matchId);
  }

  if (isSeasonMatch && currentMatch.goals >= 2) {
    await unlockAchievement(userId, 'DOUBLE', matchId);
  }

  if (isSeasonMatch && currentMatch.goals >= 3) {
    await unlockAchievement(userId, 'HAT_TRICK', matchId);
  }

  if (isSeasonMatch && currentMatch.assists >= 3) {
    await unlockAchievement(userId, 'ASSISTS_3_MATCH', matchId);
  }

  if (isSeasonMatch && currentMatch.goals >= 1 && currentMatch.assists >= 1) {
    await unlockAchievement(userId, 'COMPLETE_PLAYER', matchId);
  }

  const [goalsRows] = await pool.query(
    `SELECT COALESCE(SUM(mps.goals), 0) AS total
     FROM match_player_stats mps
     JOIN matches m ON m.id = mps.match_id
     WHERE mps.user_id = ?
       AND m.starts_at >= ?`,
    [userId, seasonStartDateSql]
  );

  const totalGoals = Number(goalsRows?.[0]?.total || 0);

  if (totalGoals >= 10) await unlockAchievement(userId, 'GOALS_10');
  if (totalGoals >= 25) await unlockAchievement(userId, 'GOALS_25');
  if (totalGoals >= 50) await unlockAchievement(userId, 'GOALS_50');

  const [assistsRows] = await pool.query(
    `SELECT COALESCE(SUM(mps.assists), 0) AS total
     FROM match_player_stats mps
     JOIN matches m ON m.id = mps.match_id
     WHERE mps.user_id = ?
       AND m.starts_at >= ?`,
    [userId, seasonStartDateSql]
  );

  const totalAssists = Number(assistsRows?.[0]?.total || 0);

  if (totalAssists >= 10) await unlockAchievement(userId, 'ASSISTS_10');
  if (totalAssists >= 25) await unlockAchievement(userId, 'ASSISTS_25');
  if (totalAssists >= 50) await unlockAchievement(userId, 'ASSISTS_50');

  const [mvpRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM match_player_stats mps
     JOIN matches m ON m.id = mps.match_id
     WHERE mps.user_id = ?
       AND mps.is_mvp = 1
       AND m.starts_at >= ?`,
    [userId, seasonStartDateSql]
  );

  const totalMvps = Number(mvpRows?.[0]?.total || 0);

  if (totalMvps >= 5) await unlockAchievement(userId, 'MVP_5');
  if (totalMvps >= 10) await unlockAchievement(userId, 'MVP_10');

  const [matchesRows] = await pool.query(
    `SELECT COUNT(DISTINCT mps.match_id) AS total
     FROM match_player_stats mps
     JOIN matches m ON m.id = mps.match_id
     WHERE mps.user_id = ?
       AND m.starts_at >= ?`,
    [userId, seasonStartDateSql]
  );

  const totalMatches = Number(matchesRows?.[0]?.total || 0);

  if (totalMatches >= 1) await unlockAchievement(userId, 'DEBUTANTE');
  if (totalMatches >= 5) await unlockAchievement(userId, 'MATCHES_5');
  if (totalMatches >= 10) await unlockAchievement(userId, 'MATCHES_10');
  if (totalMatches >= 25) await unlockAchievement(userId, 'MATCHES_25');
  if (totalMatches >= 50) await unlockAchievement(userId, 'MATCHES_50');
}