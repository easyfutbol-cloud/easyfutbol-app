import express from 'express';
import Stripe from 'stripe';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { getUserEntitlements, getUserSubscription, listSubscriptionPlans } from '../services/subscriptionService.js';
import { getFirstDayBillingConfig } from '../services/subscriptionBillingService.js';

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const APP_BASE_URL = String(process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'https://easyfutbol.es').replace(/\/$/, '');

router.get('/plans', async (_req, res) => {
  try { return res.json({ ok: true, data: await listSubscriptionPlans() }); }
  catch (error) { console.error('[GET subscription plans]', error); return res.status(500).json({ ok:false, msg:'No se pudieron cargar los planes' }); }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const subscription = await getUserSubscription(pool, req.user.id);
    const entitlements = await getUserEntitlements(pool, req.user.id);
    return res.json({ ok:true, data:{ subscription, entitlements } });
  } catch (error) { console.error('[GET subscription me]', error); return res.status(500).json({ ok:false, msg:'No se pudo consultar la suscripción' }); }
});

router.post('/:planCode/checkout', requireAuth, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ ok:false, msg:'Stripe no está configurado' });
    const planCode = String(req.params.planCode || '').toLowerCase();
    const [[plan]] = await pool.query('SELECT * FROM subscription_plans WHERE code=? AND is_active=1 LIMIT 1', [planCode]);
    if (!plan) return res.status(404).json({ ok:false, msg:'Plan no encontrado' });
    if (!['plus','pro'].includes(planCode)) return res.status(400).json({ ok:false,msg:'Plan no válido' });
    const priceId = planCode === 'pro' ? process.env.STRIPE_PRO_PRICE_ID || plan.stripe_price_id : process.env.STRIPE_PLUS_PRICE_ID || plan.stripe_price_id;
    const current = await getUserSubscription(pool, req.user.id);
    if (current) return res.status(409).json({
      ok:false,
      msg:current.plan_code === planCode ? `Ya tienes ${plan.name} activo` : 'Gestiona el cambio de plan desde el portal de Stripe',
    });
    const [[user]] = await pool.query('SELECT id,email FROM users WHERE id=? LIMIT 1', [req.user.id]);
    const [[previous]] = await pool.query('SELECT stripe_customer_id FROM user_subscriptions WHERE user_id=? AND stripe_customer_id IS NOT NULL ORDER BY id DESC LIMIT 1',[req.user.id]);
    const metadata = { kind:'easyfutbol_subscription', subscriptionPlan:planCode, userId:String(req.user.id) };
    const lineItem=priceId ? { price:priceId,quantity:1 } : { price_data:{ currency:String(plan.currency || 'EUR').toLowerCase(),unit_amount:Number(plan.price_cents),recurring:{ interval:plan.billing_interval || 'month' },product_data:{ name:plan.name,description:`Suscripción mensual ${plan.name}` } },quantity:1 };
    const billingConfig=getFirstDayBillingConfig();
    const session = await stripe.checkout.sessions.create({
      mode:'subscription', customer:previous?.stripe_customer_id || undefined,
      customer_email:previous?.stripe_customer_id ? undefined : user?.email, client_reference_id:String(req.user.id),
      line_items:[lineItem], metadata, subscription_data:{ metadata,...billingConfig },
      success_url:`${APP_BASE_URL}/pago-ok/?subscription=${planCode}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${APP_BASE_URL}/pago-cancelado/?subscription=${planCode}`,
    });
    return res.json({ ok:true, checkout_url:session.url, session_id:session.id });
  } catch (error) { console.error('[POST subscription checkout]', error); return res.status(500).json({ ok:false, msg:'No se pudo iniciar la suscripción' }); }
});

router.post('/portal', requireAuth, async (req,res) => {
  try {
    if (!stripe) return res.status(503).json({ ok:false,msg:'Stripe no está configurado' });
    const [[subscription]]=await pool.query('SELECT stripe_customer_id FROM user_subscriptions WHERE user_id=? AND stripe_customer_id IS NOT NULL ORDER BY id DESC LIMIT 1',[req.user.id]);
    if (!subscription?.stripe_customer_id) return res.status(404).json({ ok:false,msg:'No se encontró una suscripción que gestionar' });
    const session=await stripe.billingPortal.sessions.create({ customer:subscription.stripe_customer_id,return_url:`${APP_BASE_URL}/` });
    return res.json({ ok:true,portal_url:session.url });
  } catch(error) { console.error('[POST subscription portal]',error); return res.status(500).json({ ok:false,msg:'No se pudo abrir el portal de suscripción' }); }
});

export default router;
