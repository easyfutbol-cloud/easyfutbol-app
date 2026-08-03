import { pool } from '../config/db.js';
import { getPlusFairPlayStatus } from './plusFairPlayService.js';

const ACTIVE_STATUSES = ['active', 'trialing'];

const parseBenefits = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};

export async function listSubscriptionPlans(db = pool) {
  const [rows] = await db.query(
    `SELECT code, name, price_cents, currency, billing_interval, stripe_price_id, benefits
     FROM subscription_plans WHERE is_active=1 ORDER BY display_order ASC, id ASC`
  );
  return rows.map((row) => ({
    ...row,
    price_cents: Number(row.price_cents),
    benefits: parseBenefits(row.benefits),
    checkout_available: Boolean(process.env.STRIPE_SECRET_KEY),
  }));
}

export async function getUserSubscription(db, userId) {
  const [[row]] = await db.query(
    `SELECT us.*, sp.code AS plan_code, sp.name AS plan_name, sp.benefits
     FROM user_subscriptions us JOIN subscription_plans sp ON sp.id=us.plan_id
     WHERE us.user_id=? AND us.status IN ('active','trialing')
       AND (us.current_period_end IS NULL OR us.current_period_end > NOW())
     ORDER BY FIELD(sp.code,'pro','plus'), us.id DESC LIMIT 1`,
    [userId]
  );
  return row ? { ...row, benefits: parseBenefits(row.benefits) } : null;
}

export async function getUserEntitlements(db, userId) {
  const subscription = await getUserSubscription(db, userId);
  const fairPlay = await getPlusFairPlayStatus(db, userId);
  const [grants] = await db.query(
    `SELECT entitlement_code, source_type, starts_at, ends_at
     FROM subscription_entitlements
     WHERE user_id=? AND revoked_at IS NULL AND starts_at<=NOW()
       AND (ends_at IS NULL OR ends_at>NOW())`,
    [userId]
  );
  const plan = subscription?.plan_code || null;
  const benefitsActive = Boolean(subscription) && !fairPlay.suspended;
  const competitiveGrant = grants.find((grant) => grant.entitlement_code === 'competitive_access');
  return {
    plan,
    subscription_active: Boolean(subscription),
    benefits_active: benefitsActive,
    fair_play_warnings: fairPlay.warningCount,
    benefits: benefitsActive ? subscription.benefits : {},
    competitive: {
      has_access: plan === 'pro' || Boolean(competitiveGrant),
      source: plan === 'pro' ? 'pro' : competitiveGrant?.source_type || null,
      ends_at: plan === 'pro' ? subscription?.current_period_end || null : competitiveGrant?.ends_at || null,
    },
  };
}

export function isActiveSubscriptionStatus(status) {
  return ACTIVE_STATUSES.includes(String(status || '').toLowerCase());
}
