const MAX_WARNINGS = 3;

export async function getPlusFairPlayStatus(db, userId) {
  const [[subscription]] = await db.query(
    `SELECT 1 AS active
     FROM (
       SELECT ups.user_id, ups.status, ups.current_period_end
       FROM user_plus_subscriptions ups
       WHERE ups.user_id=?
       UNION ALL
       SELECT us.user_id, us.status, us.current_period_end
       FROM user_subscriptions us
       JOIN subscription_plans sp ON sp.id=us.plan_id
       WHERE us.user_id=? AND sp.code IN ('plus','pro')
     ) subscriptions
     WHERE status IN ('active','trialing')
       AND (current_period_end IS NULL OR current_period_end > NOW())
     LIMIT 1`,
    [userId, userId]
  );
  const [[warnings]] = await db.query(
    `SELECT COUNT(*) AS total FROM plus_fair_play_warnings
     WHERE user_id=? AND warning_month=DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')`,
    [userId]
  );
  const warningCount = Number(warnings?.total || 0);
  const isActive = Boolean(subscription?.active);
  return {
    isActive,
    warningCount,
    warningsRemaining: Math.max(MAX_WARNINGS - warningCount, 0),
    suspended: isActive && warningCount >= MAX_WARNINGS,
    eligible: isActive && warningCount < MAX_WARNINGS,
  };
}

export async function addPlusFairPlayWarning(db, { userId, inscriptionId = null, matchId, reason, createdBy = null }) {
  await db.query(
    `INSERT IGNORE INTO plus_fair_play_warnings
       (user_id, inscription_id, match_id, reason, warning_month, created_by)
     VALUES (?, ?, ?, ?, DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), ?)`,
    [userId, inscriptionId, matchId, reason, createdBy]
  );
  return getPlusFairPlayStatus(db, userId);
}
