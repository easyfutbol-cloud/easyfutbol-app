import { pool } from '../config/db.js';
import { checkAndUnlockAchievements, awardReward } from '../services/achievementsService.js';

async function getUserAchievementsSnapshot(userId) {
  const [[userRow]] = await pool.query(
    `SELECT achievement_points
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  const [[achievementsRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM user_achievements
     WHERE user_id = ?`,
    [userId]
  );

  const [[rewardsRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM user_rewards
     WHERE user_id = ?`,
    [userId]
  );

  const [[ledgerRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM points_ledger
     WHERE user_id = ?`,
    [userId]
  );

  return {
    points: Number(userRow?.achievement_points || 0),
    achievements: Number(achievementsRow?.total || 0),
    rewards: Number(rewardsRow?.total || 0),
    ledger: Number(ledgerRow?.total || 0),
  };
}

async function recalculateMatchMvpReward(userId, matchId) {
  const [[mpsRow]] = await pool.query(
    `SELECT is_mvp
     FROM match_player_stats
     WHERE user_id = ? AND match_id = ?
     LIMIT 1`,
    [userId, matchId]
  );

  if (!mpsRow || Number(mpsRow.is_mvp) !== 1) {
    return false;
  }

  const [[existingReward]] = await pool.query(
    `SELECT ur.id
     FROM user_rewards ur
     JOIN reward_types rt ON rt.id = ur.reward_type_id
     WHERE ur.user_id = ?
       AND ur.match_id = ?
       AND rt.code = 'MATCH_MVP'
     LIMIT 1`,
    [userId, matchId]
  );

  if (existingReward) {
    return false;
  }

  await awardReward(
    userId,
    'MATCH_MVP',
    matchId,
    null,
    null,
    null,
    'MVP recalculado desde script manual'
  );

  return true;
}

async function recalculateUserMatch(userId, matchId) {
  const before = await getUserAchievementsSnapshot(userId);

  await checkAndUnlockAchievements(userId, matchId);
  await recalculateMatchMvpReward(userId, matchId);

  const after = await getUserAchievementsSnapshot(userId);

  console.log(
    `[DEBUG] user=${userId} match=${matchId} | points ${before.points} -> ${after.points} | achievements ${before.achievements} -> ${after.achievements} | rewards ${before.rewards} -> ${after.rewards} | ledger ${before.ledger} -> ${after.ledger}`
  );
}

async function main() {
  try {
    const userIdArg = process.argv[2];
    const matchIdArg = process.argv[3];

    const userId = userIdArg ? Number(userIdArg) : null;
    const matchId = matchIdArg ? Number(matchIdArg) : null;

    if (!userId && !matchId) {
      console.log('Uso: node src/scripts/recalculateAchievements.js <userId> [matchId]');
      console.log('O bien: node src/scripts/recalculateAchievements.js all <matchId>');
      process.exit(1);
    }

    if (userIdArg === 'all' && matchId) {
      const [rows] = await pool.query(
        `SELECT DISTINCT user_id
         FROM match_player_stats
         WHERE match_id = ?`,
        [matchId]
      );

      for (const row of rows) {
        const uid = Number(row.user_id);
        await recalculateUserMatch(uid, matchId);
        console.log(`OK partido ${matchId} -> usuario ${uid}`);
      }

      process.exit(0);
    }

    if (!Number.isInteger(userId)) {
      console.log('userId inválido');
      process.exit(1);
    }

    if (matchId && Number.isInteger(matchId)) {
      await recalculateUserMatch(userId, matchId);
      console.log(`OK usuario ${userId} partido ${matchId}`);
      process.exit(0);
    }

    const [matches] = await pool.query(
      `SELECT DISTINCT match_id
       FROM match_player_stats
       WHERE user_id = ?
       ORDER BY match_id ASC`,
      [userId]
    );

    for (const row of matches) {
      await recalculateUserMatch(userId, Number(row.match_id));
      console.log(`OK usuario ${userId} partido ${row.match_id}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error recalculando logros:', error);
    process.exit(1);
  }
}

main();  