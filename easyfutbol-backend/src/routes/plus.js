import express from 'express';
import Stripe from 'stripe';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { getPlusFairPlayStatus } from '../services/plusFairPlayService.js';
import { getFirstDayBillingConfig } from '../services/subscriptionBillingService.js';

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const APP_BASE_URL = String(process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'https://easyfutbol.es').replace(/\/$/, '');
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

const serializeSubscription = (row, fairPlay = {}) => {
  const isActive = ACTIVE_STATUSES.has(String(row?.status || '').toLowerCase());
  const benefitsActive = isActive && !fairPlay.suspended;
  return {
    is_plus: isActive,
    isPlus: isActive,
    status: row?.status || 'inactive',
    current_period_end: row?.current_period_end || null,
    cancel_at_period_end: Boolean(row?.cancel_at_period_end),
    plus_benefits_suspended: Boolean(fairPlay.suspended),
    fair_play_warnings: Number(fairPlay.warningCount || 0),
    fair_play_warnings_remaining: Number(fairPlay.warningsRemaining ?? 3),
    benefits: {
      monthly_easypass: 1,
      easypass_discount_percent: 10,
      waitlist_priority: benefitsActive,
      tournament_early_access: benefitsActive,
      cancellation_deadline_hours: benefitsActive ? 4 : 8,
      golden_name: benefitsActive,
    },
  };
};

router.get('/status', requireAuth, async (req, res) => {
  try {
    const [[subscription]] = await pool.query(
      `SELECT status, current_period_end, cancel_at_period_end
       FROM user_plus_subscriptions
       WHERE user_id = ?
       LIMIT 1`,
      [req.user.id]
    );
    const fairPlay = await getPlusFairPlayStatus(pool, req.user.id);
    return res.json({ ok: true, data: serializeSubscription(subscription, fairPlay) });
  } catch (error) {
    console.error('[GET /plus/status]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudo consultar EasyFutbol Plus' });
  }
});

router.post('/checkout', requireAuth, async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ ok: false, msg: 'Stripe no está configurado' });

    const userId = req.user.id;
    const [[user]] = await pool.query('SELECT id, name, email FROM users WHERE id = ? LIMIT 1', [userId]);
    const [[existing]] = await pool.query(
      'SELECT stripe_customer_id, status FROM user_plus_subscriptions WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (ACTIVE_STATUSES.has(String(existing?.status || '').toLowerCase())) {
      return res.status(409).json({ ok: false, msg: 'Ya tienes EasyFutbol Plus activo' });
    }

    const priceId = process.env.STRIPE_PLUS_PRICE_ID;
    const lineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          price_data: {
            currency: 'eur',
            unit_amount: 999,
            recurring: { interval: 'month' },
            product_data: {
              name: 'EasyFutbol Plus',
              description: 'Membresía mensual para jugadores EasyFutbol',
            },
          },
          quantity: 1,
        };

    const metadata = { kind: 'easyfutbol_plus', userId: String(userId) };
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: existing?.stripe_customer_id || undefined,
      customer_email: existing?.stripe_customer_id ? undefined : user?.email,
      client_reference_id: String(userId),
      line_items: [lineItem],
      metadata,
      subscription_data: { metadata, ...getFirstDayBillingConfig() },
      success_url: `${APP_BASE_URL}/pago-ok/?plus=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_BASE_URL}/pago-cancelado/?plus=1`,
    });

    return res.json({ ok: true, checkout_url: session.url, session_id: session.id });
  } catch (error) {
    console.error('[POST /plus/checkout]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudo iniciar la suscripción' });
  }
});

router.post('/portal', requireAuth, async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ ok: false, msg: 'Stripe no está configurado' });
    const [[subscription]] = await pool.query(
      'SELECT stripe_customer_id FROM user_plus_subscriptions WHERE user_id = ? LIMIT 1',
      [req.user.id]
    );
    if (!subscription?.stripe_customer_id) {
      return res.status(404).json({ ok: false, msg: 'No se encontró una suscripción que gestionar' });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${APP_BASE_URL}/`,
    });
    return res.json({ ok: true, portal_url: session.url });
  } catch (error) {
    console.error('[POST /plus/portal]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudo abrir la gestión de la suscripción' });
  }
});

export default router;
