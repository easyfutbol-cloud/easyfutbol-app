export function buildReferralCode(userId) {
  return `EF${Number(userId).toString(36).toUpperCase().padStart(6, '0')}`;
}

export async function qualifyReferralFromPurchase(conn, { referredUserId, paymentReference }) {
  const [[referral]] = await conn.query(
    `SELECT id, referrer_user_id
     FROM user_referrals
     WHERE referred_user_id = ? AND status = 'registered'
     LIMIT 1 FOR UPDATE`,
    [referredUserId]
  );
  if (!referral) return { qualified: false, rewarded: false };

  const [qualified] = await conn.query(
    `UPDATE user_referrals
     SET status='qualified', qualified_payment_reference=?, qualified_at=NOW()
     WHERE id=? AND status='registered'`,
    [paymentReference, referral.id]
  );
  if (!qualified.affectedRows) return { qualified: false, rewarded: false };

  const [[totalRow]] = await conn.query(
    `SELECT COUNT(*) AS total FROM user_referrals
     WHERE referrer_user_id=? AND status='qualified'`,
    [referral.referrer_user_id]
  );
  const qualifiedTotal = Number(totalRow?.total || 0);
  const milestone = Math.floor(qualifiedTotal / 5) * 5;
  if (milestone < 5) return { qualified: true, rewarded: false, qualifiedTotal };

  const [reward] = await conn.query(
    `INSERT IGNORE INTO referral_rewards (user_id, milestone, easypass_awarded)
     VALUES (?, ?, 1)`,
    [referral.referrer_user_id, milestone]
  );
  if (!reward.affectedRows) return { qualified: true, rewarded: false, qualifiedTotal };

  await conn.query(
    'UPDATE users SET easypass_balance=COALESCE(easypass_balance,0)+1 WHERE id=?',
    [referral.referrer_user_id]
  );
  await conn.query(
    `INSERT INTO easypass_transactions
       (user_id, type, amount, description, payment_reference, created_at)
     VALUES (?, 'referral_reward', 1, ?, ?, NOW())`,
    [
      referral.referrer_user_id,
      `Recompensa por ${milestone} referidos`,
      `referral_milestone:${referral.referrer_user_id}:${milestone}`,
    ]
  );

  return { qualified: true, rewarded: true, qualifiedTotal, milestone };
}
