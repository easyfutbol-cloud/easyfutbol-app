import express from 'express';
import Stripe from 'stripe';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { getUserEntitlements, getUserSubscription, listSubscriptionPlans } from '../services/subscriptionService.js';
import { getFirstDayBillingConfig } from '../services/subscriptionBillingService.js';

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const APP_BASE_URL = String(process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'https://easyfutbol.es').replace(/\/$/, '');

async function getReusableStripeCustomerId(customerId) {
  if (!customerId) return null;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer && !customer.deleted ? customer.id : null;
  } catch (error) {
    if (error?.code === 'resource_missing') {
      console.warn('[STRIPE customer unavailable]', { customerId });
      return null;
    }
    throw error;
  }
}

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
    if (planCode !== 'plus') return res.status(404).json({ ok:false,msg:'Plan no disponible' });
    // La app actual obliga a elegir sede; las versiones antiguas no la envían y su EasyPass mensual sigue siendo universal.
    const locationId = Number(req.body?.location_id) || null;
    let location = null;
    if (locationId) {
      [[location]] = await pool.query('SELECT id, name FROM locations WHERE id=? AND active=1 LIMIT 1', [locationId]);
      if (!location) return res.status(400).json({ ok:false, msg:'Sede no válida' });
    }
    const priceId = process.env.STRIPE_PLUS_PRICE_ID || plan.stripe_price_id;
    const current = await getUserSubscription(pool, req.user.id);
    if (current) return res.status(409).json({
      ok:false,
      msg:current.plan_code === planCode ? `Ya tienes ${plan.name} activo` : 'Gestiona el cambio de plan desde el portal de Stripe',
    });
    const [[user]] = await pool.query('SELECT id,email FROM users WHERE id=? LIMIT 1', [req.user.id]);
    const [[previous]] = await pool.query('SELECT stripe_customer_id FROM user_subscriptions WHERE user_id=? AND stripe_customer_id IS NOT NULL ORDER BY id DESC LIMIT 1',[req.user.id]);
    const reusableCustomerId = await getReusableStripeCustomerId(previous?.stripe_customer_id);
    const billingConfig=getFirstDayBillingConfig();
    const metadata = {
      kind:'easyfutbol_subscription', subscriptionPlan:planCode, userId:String(req.user.id), locationId:location ? String(location.id) : '',
      renewalAnchor:billingConfig.renewalAnchor ? String(billingConfig.renewalAnchor) : '',
    };
    const lineItem=priceId ? { price:priceId,quantity:1 } : { price_data:{ currency:String(plan.currency || 'EUR').toLowerCase(),unit_amount:Number(plan.price_cents),recurring:{ interval:plan.billing_interval || 'month' },product_data:{ name:plan.name,description:`Suscripción mensual ${plan.name}${location ? ` · ${location.name}` : ''}` } },quantity:1 };
    const session = await stripe.checkout.sessions.create({
      mode:'subscription', customer:reusableCustomerId || undefined,
      customer_email:reusableCustomerId ? undefined : user?.email, client_reference_id:String(req.user.id),
      line_items:[lineItem], metadata, subscription_data:{ metadata },
      success_url:`${APP_BASE_URL}/pago-ok/?subscription=${planCode}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${APP_BASE_URL}/pago-cancelado/?subscription=${planCode}`,
    });
    return res.json({ ok:true, checkout_url:session.url, session_id:session.id });
  } catch (error) { console.error('[POST subscription checkout]', error); return res.status(500).json({ ok:false, msg:'No se pudo iniciar la suscripción' }); }
});

// Cambia la sede a la que va el EasyPass mensual. Se guarda también en Stripe porque cada
// renovación lee la sede de los metadatos de la suscripción. Lo ya ingresado no se mueve.
router.patch('/me/location', requireAuth, async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ ok:false, msg:'Stripe no está configurado' });
    const locationId = Number(req.body?.location_id) || null;
    const [[location]] = locationId
      ? await pool.query('SELECT id, name FROM locations WHERE id=? AND active=1 LIMIT 1', [locationId])
      : [[null]];
    if (!location) return res.status(400).json({ ok:false, msg:'Sede no válida' });
    const current = await getUserSubscription(pool, req.user.id);
    if (!current) return res.status(404).json({ ok:false, msg:'No tienes una suscripción activa' });
    if (!current.stripe_subscription_id) return res.status(400).json({ ok:false, msg:'Tu Plus de regalo no incluye EasyPass mensual, así que no tiene sede' });
    await stripe.subscriptions.update(current.stripe_subscription_id, { metadata:{ locationId:String(location.id) } });
    await pool.query('UPDATE user_subscriptions SET location_id=? WHERE stripe_subscription_id=?', [location.id, current.stripe_subscription_id]);
    return res.json({ ok:true, data:{ location_id:location.id, location_name:location.name } });
  } catch (error) { console.error('[PATCH subscription location]', error); return res.status(500).json({ ok:false, msg:'No se pudo cambiar la sede' }); }
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
