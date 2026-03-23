import express from 'express';
import Stripe from 'stripe';
import pool from '../config/db.js';
import requireAuth from '../middlewares/auth.js';

const router = express.Router();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.MOBILE_APP_URL ||
  process.env.FRONTEND_URL ||
  'easyfutbol://';

/**
 * Packs de EasyPass disponibles
 */
router.get('/packs', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, credits AS easyPassAmount, price_cents
       FROM easypass_packs
       WHERE is_active = 1
       ORDER BY credits ASC`
    );

    return res.json({
      ok: true,
      data: rows.map((row) => ({
        ...row,
        easyPassAmount: Number(row.easyPassAmount || 0),
        credits: Number(row.easyPassAmount || 0),
        price_cents: Number(row.price_cents || 0),
      })),
    });
  } catch (e) {
    console.error('[GET /packs]', e);
    return res.status(500).json({ ok:false, msg:'Error obteniendo packs EasyPass' });
  }
});

/**
 * Historial de movimientos de EasyPass del usuario autenticado
 */
router.get('/me/credits/history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT id, type, amount, description, event_id, pack_id, payment_reference, created_at
       FROM easypass_transactions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );

    return res.json({
      ok: true,
      data: rows.map((row) => ({
        ...row,
        amount: Number(row.amount || 0),
        easyPassAmount: Number(row.amount || 0),
        event_id: row.event_id ? Number(row.event_id) : null,
        pack_id: row.pack_id ? Number(row.pack_id) : null,
      })),
    });
  } catch (e) {
    console.error('[GET /me/credits/history]', e);
    return res.status(500).json({ ok:false, msg:'Error obteniendo movimientos EasyPass' });
  }
});

/**
 * Crear checkout de Stripe para comprar un pack EasyPass
 */
router.post('/packs/:id/checkout', requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ ok:false, msg:'Stripe no está configurado en el backend' });
    }

    const userId = req.user.id;
    const packId = Number(req.params.id);

    if (!Number.isInteger(packId) || packId <= 0) {
      return res.status(400).json({ ok:false, msg:'Pack inválido' });
    }

    const [[pack]] = await pool.query(
      `SELECT id, name, credits AS easyPassAmount, price_cents, is_active
       FROM easypass_packs
       WHERE id = ?
       LIMIT 1`,
      [packId]
    );

    if (!pack || Number(pack.is_active) !== 1) {
      return res.status(404).json({ ok:false, msg:'Pack no encontrado' });
    }

    const successUrl = `${APP_BASE_URL}`;
    const cancelUrl = `${APP_BASE_URL}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: pack.name || `${Number(pack.easyPassAmount || 0)} EasyPass`,
              description: `Pack de ${Number(pack.easyPassAmount || 0)} EasyPass`,
            },
            unit_amount: Number(pack.price_cents || 0),
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: String(userId),
        packId: String(pack.id),
        packEasyPassAmount: String(Number(pack.easyPassAmount || 0)),
        kind: 'easypass_pack',
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return res.json({
      ok: true,
      checkout_url: session.url,
      session_id: session.id,
      pack: {
        id: Number(pack.id),
        name: pack.name,
        easyPassAmount: Number(pack.easyPassAmount || 0),
        credits: Number(pack.easyPassAmount || 0),
        price_cents: Number(pack.price_cents || 0),
      },
    });
  } catch (e) {
    console.error('[POST /packs/:id/checkout]', e);
    return res.status(500).json({ ok:false, msg:'Error creando checkout de EasyPass' });
  }
});

/**
 * Confirmación manual temporal para pruebas sin depender del webhook de Stripe
 */
router.post('/packs/:id/confirm', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const userId = req.user.id;
    const packId = Number(req.params.id);
    const paymentReference = req.body?.payment_reference || `manual_${Date.now()}`;

    if (!Number.isInteger(packId) || packId <= 0) {
      return res.status(400).json({ ok:false, msg:'Pack inválido' });
    }

    await conn.beginTransaction();

    const [[existingTx]] = await conn.query(
      `SELECT id
       FROM easypass_transactions
       WHERE user_id=?
         AND type='purchase'
         AND pack_id=?
         AND payment_reference=?
       LIMIT 1`,
      [userId, packId, paymentReference]
    );

    if (existingTx) {
      await conn.rollback();
      return res.json({ ok:true, alreadyProcessed:true });
    }

    const [[pack]] = await conn.query(
      `SELECT id, name, credits AS easyPassAmount, is_active
       FROM easypass_packs
       WHERE id=?
       LIMIT 1`,
      [packId]
    );

    if (!pack || Number(pack.is_active) !== 1) {
      await conn.rollback();
      return res.status(404).json({ ok:false, msg:'Pack no encontrado' });
    }

    const easyPassAmount = Number(pack.easyPassAmount || 0);

    await conn.query(
      `UPDATE users
       SET easypass_balance = easypass_balance + ?
       WHERE id = ?`,
      [easyPassAmount, userId]
    );

    await conn.query(
      `INSERT INTO easypass_transactions
        (user_id, type, amount, description, pack_id, payment_reference, created_at)
       VALUES (?, 'purchase', ?, ?, ?, ?, NOW())`,
      [userId, easyPassAmount, `Compra pack ${pack.name || `#${packId}`}`, packId, paymentReference]
    );

    const [[updatedUser]] = await conn.query(
      'SELECT easypass_balance AS easyPassBalance FROM users WHERE id=? LIMIT 1',
      [userId]
    );

    await conn.commit();

    return res.json({
      ok: true,
      alreadyProcessed: false,
      easyPassAmountAdded: easyPassAmount,
      credits_added: easyPassAmount,
      easyPassBalance: Number(updatedUser?.easyPassBalance || 0),
      credits: Number(updatedUser?.easyPassBalance || 0),
    });
  } catch (e) {
    await conn.rollback();
    console.error('[POST /packs/:id/confirm]', e);
    return res.status(500).json({ ok:false, msg:'Error confirmando compra EasyPass' });
  } finally {
    conn.release();
  }
});

export default router;