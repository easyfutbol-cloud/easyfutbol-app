import express from 'express';
import Stripe from 'stripe';
import { pool } from '../config/db.js';
import { qualifyReferralFromPurchase } from '../services/referralService.js';
import { grantPlusTrialForCurrentSeason } from '../services/competitiveService.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const webhookRouter = express.Router();

const unixToMysqlDate = (value) => value
  ? new Date(Number(value) * 1000).toISOString().slice(0, 19).replace('T', ' ')
  : null;

const getSubscriptionPeriod = (subscription) => {
  const item = subscription?.items?.data?.[0];
  return {
    start: subscription?.current_period_start || item?.current_period_start || null,
    end: subscription?.current_period_end || item?.current_period_end || null,
  };
};

async function upsertPlusSubscription(conn, { userId, customerId, subscription }) {
  const period = getSubscriptionPeriod(subscription);
  await conn.query(
    `INSERT INTO user_plus_subscriptions
       (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end, cancel_at_period_end)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       stripe_customer_id = VALUES(stripe_customer_id),
       stripe_subscription_id = VALUES(stripe_subscription_id),
       status = VALUES(status),
       current_period_start = VALUES(current_period_start),
       current_period_end = VALUES(current_period_end),
       cancel_at_period_end = VALUES(cancel_at_period_end)`,
    [
      userId,
      customerId || null,
      subscription?.id || null,
      subscription?.status || 'inactive',
      unixToMysqlDate(period.start),
      unixToMysqlDate(period.end),
      subscription?.cancel_at_period_end ? 1 : 0,
    ]
  );
}

async function upsertGenericSubscription(conn, { userId, customerId, subscription, planCode }) {
  const [[plan]] = await conn.query('SELECT id FROM subscription_plans WHERE code=? LIMIT 1', [planCode]);
  if (!plan) throw new Error(`Plan de suscripción no encontrado: ${planCode}`);
  const period = getSubscriptionPeriod(subscription);
  await conn.query(
    `INSERT INTO user_subscriptions
       (user_id, plan_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end, cancel_at_period_end, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))
     ON DUPLICATE KEY UPDATE plan_id=VALUES(plan_id), stripe_customer_id=VALUES(stripe_customer_id),
       status=VALUES(status), current_period_start=VALUES(current_period_start), current_period_end=VALUES(current_period_end),
       cancel_at_period_end=VALUES(cancel_at_period_end), ended_at=IF(VALUES(status) IN ('canceled','incomplete_expired'), NOW(), NULL)`,
    [userId, plan.id, customerId || null, subscription?.id || null, subscription?.status || 'inactive',
      unixToMysqlDate(period.start), unixToMysqlDate(period.end), subscription?.cancel_at_period_end ? 1 : 0, unixToMysqlDate(period.start)]
  );
}

async function grantPlanEasyPass(conn, { userId, planCode, amount, reference }) {
  const [grant] = await conn.query(
    `INSERT IGNORE INTO subscription_monthly_grants (user_id, plan_code, stripe_reference, easypass_amount)
     VALUES (?, ?, ?, ?)`,
    [userId, planCode, reference, amount]
  );
  if (!grant.affectedRows) return false;
  await conn.query('UPDATE users SET easypass_balance=COALESCE(easypass_balance,0)+? WHERE id=?', [amount, userId]);
  await conn.query(
    `INSERT INTO easypass_transactions (user_id, type, amount, description, payment_reference, created_at)
     VALUES (?, 'plus_grant', ?, ?, ?, NOW())`,
    [userId, amount, `${amount} EasyPass mensuales de EasyFutbol ${planCode === 'pro' ? 'Pro' : 'Plus'}`, reference]
  );
  return true;
}

async function handleGenericSubscriptionEvent(event) {
  const object = event.data.object;
  if (event.type === 'checkout.session.completed' && object?.metadata?.kind === 'easyfutbol_subscription') {
    const userId = Number(object.metadata.userId || object.client_reference_id);
    const planCode = String(object.metadata.subscriptionPlan || '').toLowerCase();
    if (!userId || !object.subscription || !['plus','pro'].includes(planCode)) return true;
    const subscription = await stripe.subscriptions.retrieve(object.subscription);
    const amount = planCode === 'pro' ? 4 : 1;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await upsertGenericSubscription(conn, { userId, customerId:object.customer, subscription, planCode });
      await grantPlanEasyPass(conn, { userId, planCode, amount, reference:`subscription_checkout:${object.id}` });
      if (planCode === 'plus') await grantPlusTrialForCurrentSeason(conn, userId, `subscription_checkout:${object.id}`);
      await conn.commit();
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
    return true;
  }
  if (event.type === 'invoice.paid' && object.billing_reason !== 'subscription_create' && object.subscription) {
    const subscription = await stripe.subscriptions.retrieve(object.subscription);
    if (subscription?.metadata?.kind !== 'easyfutbol_subscription') return false;
    const userId = Number(subscription.metadata.userId);
    const planCode = String(subscription.metadata.subscriptionPlan || '').toLowerCase();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await upsertGenericSubscription(conn, { userId, customerId:object.customer, subscription, planCode });
      await grantPlanEasyPass(conn, { userId, planCode, amount:planCode === 'pro' ? 4 : 1, reference:`subscription_invoice:${object.id}` });
      await conn.commit();
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
    return true;
  }
  if (event.type === 'invoice.payment_failed' && object.subscription) {
    const subscription=await stripe.subscriptions.retrieve(object.subscription);
    if (subscription?.metadata?.kind!=='easyfutbol_subscription') return false;
    await upsertGenericSubscription(pool,{ userId:Number(subscription.metadata.userId),customerId:object.customer,subscription,planCode:subscription.metadata.subscriptionPlan });
    return true;
  }
  if (['customer.subscription.updated','customer.subscription.deleted'].includes(event.type) && object?.metadata?.kind === 'easyfutbol_subscription') {
    await upsertGenericSubscription(pool, { userId:Number(object.metadata.userId), customerId:object.customer, subscription:object, planCode:object.metadata.subscriptionPlan });
    return true;
  }
  return false;
}

async function grantMonthlyPlusEasyPass(conn, { userId, reference }) {
  const [grant] = await conn.query(
    `INSERT IGNORE INTO plus_monthly_grants (user_id, stripe_reference, amount)
     VALUES (?, ?, 1)`,
    [userId, reference]
  );
  if (!grant.affectedRows) return false;

  await conn.query(
    'UPDATE users SET easypass_balance = COALESCE(easypass_balance, 0) + 1 WHERE id = ?',
    [userId]
  );
  await conn.query(
    `INSERT INTO easypass_transactions
       (user_id, type, amount, description, payment_reference, created_at)
     VALUES (?, 'plus_grant', 1, 'EasyPass mensual de EasyFutbol Plus', ?, NOW())`,
    [userId, reference]
  );
  return true;
}

async function handlePlusEvent(event) {
  const object = event.data.object;

  if (event.type === 'checkout.session.completed' && object?.metadata?.kind === 'easyfutbol_plus') {
    const userId = Number(object.metadata.userId || object.client_reference_id);
    if (!userId || !object.subscription) return true;
    const subscription = await stripe.subscriptions.retrieve(object.subscription);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await upsertPlusSubscription(conn, { userId, customerId: object.customer, subscription });
      await upsertGenericSubscription(conn, { userId, customerId: object.customer, subscription, planCode:'plus' });
      await grantMonthlyPlusEasyPass(conn, { userId, reference: `plus_checkout:${object.id}` });
      await grantPlusTrialForCurrentSeason(conn, userId, `plus_checkout:${object.id}`);
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    return true;
  }

  if (event.type === 'invoice.paid' && object.billing_reason !== 'subscription_create' && object.subscription) {
    const subscription = await stripe.subscriptions.retrieve(object.subscription);
    if (subscription?.metadata?.kind !== 'easyfutbol_plus') return false;
    const userId = Number(subscription.metadata.userId);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await upsertPlusSubscription(conn, { userId, customerId: object.customer, subscription });
      await upsertGenericSubscription(conn, { userId, customerId: object.customer, subscription, planCode:'plus' });
      await grantMonthlyPlusEasyPass(conn, { userId, reference: `plus_invoice:${object.id}` });
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    return true;
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    if (object?.metadata?.kind !== 'easyfutbol_plus') return false;
    const userId = Number(object.metadata.userId);
    await upsertPlusSubscription(pool, { userId, customerId: object.customer, subscription: object });
    await upsertGenericSubscription(pool, { userId, customerId: object.customer, subscription: object, planCode:'plus' });
    return true;
  }

  return false;
}

// OJO: este router usa express.raw(), por eso se monta antes del express.json() global
webhookRouter.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('⚠️  Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (await handleGenericSubscriptionEvent(event)) {
      return res.json({ received: true });
    }
    if (await handlePlusEvent(event)) {
      return res.json({ received: true });
    }
  } catch (error) {
    console.error('DB error en webhook EasyFutbol Plus:', error);
    return res.status(500).json({ received: false });
  }

  if (event.type !== 'checkout.session.completed') {
    return res.json({ received: true });
  }

  const session = event.data.object;

  // Seguridad extra: solo procesar pagos realmente completados
  if (session.payment_status && session.payment_status !== 'paid') {
    console.log('⚠️  Sesión completada pero payment_status != paid, se ignora:', session.id);
    return res.json({ received: true });
  }

  const metadata = session.metadata || {};
  const purchaseType = metadata.purchase_type || metadata.type || metadata.kind || null;
  const userId = metadata.user_id ? Number(metadata.user_id) : metadata.userId ? Number(metadata.userId) : null;
  const packId = metadata.pack_id ? Number(metadata.pack_id) : metadata.packId ? Number(metadata.packId) : null;
  const metadataLocationId = metadata.location_id ? Number(metadata.location_id) : metadata.locationId ? Number(metadata.locationId) : null;
  const packEasyPassAmountFromMetadata = metadata.packEasyPassAmount
    ? Number(metadata.packEasyPassAmount)
    : metadata.easyPassAmount
    ? Number(metadata.easyPassAmount)
    : metadata.credits
    ? Number(metadata.credits)
    : null;

  const isPackPurchase = purchaseType === 'pack' || purchaseType === 'easypass' || purchaseType === 'easypass_pack' || purchaseType === 'kind' || metadata.kind === 'easypass_pack' || !!packId;

  if (!isPackPurchase) {
    console.warn('⚠️  Webhook recibido sin tipo de compra EasyPass válido:', session.id, metadata);
    return res.json({ received: true });
  }

  if (!userId || !packId) {
    console.warn('⚠️  Compra EasyPass sin metadata suficiente (userId/packId):', session.id, metadata);
    return res.json({ received: true });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1 fila por sesión Stripe para idempotencia
    const [[payRow]] = await conn.query(
      'SELECT id, status FROM payments WHERE stripe_session_id=? LIMIT 1',
      [session.id]
    );

    if (payRow && payRow.status === 'confirmed') {
      await conn.rollback();
      console.log(`↩️  Webhook EasyPass repetido ignorado (session:${session.id})`);
      return res.json({ received: true });
    }

    let paymentId = payRow?.id || null;

    if (!paymentId) {
      const [insPay] = await conn.query(
        `INSERT INTO payments (stripe_session_id, match_id, user_id, quantity, ticket_type, status, created_at)
         VALUES (?, NULL, ?, 1, 'pack', 'pending', NOW())`,
        [session.id, userId]
      );
      paymentId = insPay.insertId;
    }

    // Idempotencia extra en el ledger de EasyPass
    const [[txRow]] = await conn.query(
      `SELECT id
       FROM easypass_transactions
       WHERE user_id=?
         AND type='purchase'
         AND pack_id=?
         AND payment_reference=?
       LIMIT 1`,
      [userId, packId, session.id]
    );

    if (txRow) {
      await conn.query(
        'UPDATE payments SET status="confirmed", confirmed_at=NOW() WHERE id=?',
        [paymentId]
      );
      await conn.commit();
      console.log(`↩️  Movimiento EasyPass ya existente, webhook ignorado (session:${session.id})`);
      return res.json({ received: true });
    }

    const [[pack]] = await conn.query(
      `SELECT ep.id,
              ep.location_id,
              ep.name,
              ep.credits AS easyPassAmount,
              ep.is_active,
              l.name AS locationName,
              l.slug AS locationSlug
       FROM easypass_packs ep
       LEFT JOIN locations l ON l.id = ep.location_id
       WHERE ep.id=?
       LIMIT 1`,
      [packId]
    );

    if (!pack || Number(pack.is_active) !== 1) {
      console.warn('⚠️  Pack EasyPass no encontrado o inactivo:', packId);
      await conn.rollback();
      return res.json({ received: true });
    }

    const easyPassAmount = Number(pack.easyPassAmount) || Number(packEasyPassAmountFromMetadata) || 0;

    if (easyPassAmount <= 0) {
      console.warn('⚠️  Pack con EasyPass inválidos:', packId);
      await conn.rollback();
      return res.json({ received: true });
    }

    const locationId = Number(pack.location_id || metadataLocationId || 1);
    const locationName = pack.locationName || (locationId === 2 ? 'Asturias' : 'Valladolid');

    await conn.query(
      `INSERT INTO user_easypass_balances (user_id, location_id, balance)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)`,
      [userId, locationId, easyPassAmount]
    );

    await conn.query(
      'UPDATE users SET easypass_balance = COALESCE(easypass_balance, 0) + ? WHERE id=?',
      [easyPassAmount, userId]
    );

    await conn.query(
      `INSERT INTO easypass_transactions (user_id, type, amount, description, pack_id, payment_reference, created_at)
       VALUES (?, 'purchase', ?, ?, ?, ?, NOW())`,
      [userId, easyPassAmount, `Compra pack ${pack.name || `#${packId}`} - ${locationName}`, packId, session.id]
    );

    await conn.query(
      'UPDATE payments SET status="confirmed", confirmed_at=NOW() WHERE id=?',
      [paymentId]
    );

    const referralResult = await qualifyReferralFromPurchase(conn, {
      referredUserId: userId,
      paymentReference: session.id,
    });
    if (referralResult.qualified) {
      console.log(`✅ Referido validado (usuario:${userId}, total:${referralResult.qualifiedTotal})`);
    }

    const [[updatedUser]] = await conn.query(
      'SELECT easypass_balance AS easyPassBalance FROM users WHERE id=? LIMIT 1',
      [userId]
    );

    await conn.commit();
    console.log(
      `✅ EasyPass acreditados (session:${session.id}, u:${userId}, pack:${packId}, sede:${locationName}, location:${locationId}, +${easyPassAmount}, saldo:${Number(updatedUser?.easyPassBalance || 0)})`
    );
  } catch (e) {
    await conn.rollback();
    console.error('DB error en webhook EasyPass:', e);
  } finally {
    conn.release();
  }

  return res.json({ received: true });
});

export default webhookRouter;
