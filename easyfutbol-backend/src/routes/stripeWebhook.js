import express from 'express';
import Stripe from 'stripe';
import { pool } from '../config/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const webhookRouter = express.Router();

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
  const purchaseType = metadata.purchase_type || metadata.type || null;
  const userId = metadata.user_id ? Number(metadata.user_id) : metadata.userId ? Number(metadata.userId) : null;
  const packId = metadata.pack_id ? Number(metadata.pack_id) : metadata.packId ? Number(metadata.packId) : null;
  const packEasyPassAmountFromMetadata = metadata.packEasyPassAmount
    ? Number(metadata.packEasyPassAmount)
    : metadata.easyPassAmount
    ? Number(metadata.easyPassAmount)
    : metadata.credits
    ? Number(metadata.credits)
    : null;

  const isPackPurchase = purchaseType === 'pack' || purchaseType === 'easypass' || !!packId;

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
      'SELECT id, name, credits AS easyPassAmount, is_active FROM easypass_packs WHERE id=? LIMIT 1',
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

    await conn.query(
      'UPDATE users SET easypass_balance = COALESCE(easypass_balance, 0) + ? WHERE id=?',
      [easyPassAmount, userId]
    );

    await conn.query(
      `INSERT INTO easypass_transactions (user_id, type, amount, description, pack_id, payment_reference, created_at)
       VALUES (?, 'purchase', ?, ?, ?, ?, NOW())`,
      [userId, easyPassAmount, `Compra pack ${pack.name || `#${packId}`}`, packId, session.id]
    );

    await conn.query(
      'UPDATE payments SET status="confirmed", confirmed_at=NOW() WHERE id=?',
      [paymentId]
    );

    const [[updatedUser]] = await conn.query(
      'SELECT easypass_balance AS easyPassBalance FROM users WHERE id=? LIMIT 1',
      [userId]
    );

    await conn.commit();
    console.log(
      `✅ EasyPass acreditados (session:${session.id}, u:${userId}, pack:${packId}, +${easyPassAmount}, saldo:${Number(updatedUser?.easyPassBalance || 0)})`
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
