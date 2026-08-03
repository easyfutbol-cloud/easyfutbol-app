export async function grantSubscriptionEasyPass(
  db,
  { userId, planCode, amount, reference }
) {
  const normalizedAmount = Number(amount);
  if (!userId || !['plus', 'pro'].includes(planCode) || !Number.isInteger(normalizedAmount) || normalizedAmount <= 0 || !reference) {
    throw new Error('Datos inválidos para conceder EasyPass de suscripción');
  }

  const [grant] = await db.query(
    `INSERT IGNORE INTO subscription_monthly_grants (user_id, plan_code, stripe_reference, easypass_amount)
     VALUES (?, ?, ?, ?)`,
    [userId, planCode, reference, normalizedAmount]
  );
  if (!grant.affectedRows) return false;

  await db.query(
    'UPDATE users SET easypass_balance=COALESCE(easypass_balance,0)+? WHERE id=?',
    [normalizedAmount, userId]
  );
  await db.query(
    `INSERT INTO easypass_transactions (user_id, type, amount, description, payment_reference, created_at)
     VALUES (?, 'plus_grant', ?, ?, ?, NOW())`,
    [
      userId,
      normalizedAmount,
      `${normalizedAmount} EasyPass mensuales de EasyFutbol ${planCode === 'pro' ? 'Pro' : 'Plus'}`,
      reference,
    ]
  );
  return true;
}

