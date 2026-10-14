export async function grantSubscriptionEasyPass(
  db,
  { userId, planCode, amount, reference, locationId = null }
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

  // Con sede: va al saldo de esa sede. Sin sede (suscripciones antiguas): queda como saldo universal.
  const normalizedLocationId = Number(locationId) || null;
  if (normalizedLocationId) {
    await db.query(
      `INSERT INTO user_easypass_balances (user_id, location_id, balance)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)`,
      [userId, normalizedLocationId, normalizedAmount]
    );
  }
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

