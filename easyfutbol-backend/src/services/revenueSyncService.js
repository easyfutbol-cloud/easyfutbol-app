// Sincroniza con Stripe el dinero realmente cobrado y lo guarda en revenue_events.
//
// Por qué existe: al comprar un pack, easypass_transactions solo guarda cuántos
// EasyPass entran, no cuánto se cobró. El importe real (con descuento Plus o
// código promocional aplicado en Stripe Checkout) solo vive en Stripe, y es lo
// que hace falta para el precio efectivo por EasyPass y para los ingresos.
//
// No toca el webhook de pagos (no puede afectar a que los EasyPass se acrediten):
// busca las compras que ya están en la base de datos y le pregunta a Stripe
// cuánto costó cada una. Es idempotente: se puede ejecutar las veces que haga
// falta y cubre tanto el histórico como las compras nuevas.
import { pool } from '../config/db.js';
import { markSchedulerFailure, markSchedulerSuccess, registerScheduler } from './operationalHealthService.js';
import { clearKpiCache } from './kpiService.js';

const toInt = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0);

/**
 * Convierte una sesión de Stripe Checkout (con payment_intent.latest_charge
 * expandido) en los importes que guardamos.
 */
export function mapCheckoutSession(session) {
  const paid = toInt(session?.amount_total);
  const subtotal = session?.amount_subtotal === null || session?.amount_subtotal === undefined ? paid : toInt(session.amount_subtotal);
  let promoDiscount = toInt(session?.total_details?.amount_discount);

  // El descuento Plus ya viene aplicado en el precio de la sesión; el porcentaje
  // se guardó en los metadatos al crearla, así que se puede reconstruir el precio de lista.
  const metadata = session?.metadata || {};
  const plusPercent = Number(metadata.subscriptionDiscountPercent ?? metadata.plusDiscountPercent ?? 0);
  let list = subtotal;
  let plusDiscount = 0;
  if (plusPercent > 0 && plusPercent < 100) {
    list = Math.round(subtotal / (1 - plusPercent / 100));
    plusDiscount = list - subtotal;
  }
  // El 50% del primer EasyPass también viene ya en el precio; lo contamos como promoción.
  const firstPackPercent = Number(metadata.firstPackDiscountPercent ?? 0);
  if (metadata.firstPackDiscount === '1' && firstPackPercent > 0 && firstPackPercent < 100) {
    list = Math.round(subtotal / (1 - firstPackPercent / 100));
    promoDiscount += list - subtotal;
  }

  let status = 'paid';
  if (session?.payment_status !== 'paid') status = 'unavailable';
  else if (session?.livemode === false) status = 'test';

  const charge = session?.payment_intent && typeof session.payment_intent === 'object' ? session.payment_intent.latest_charge : null;
  const refunded = charge && typeof charge === 'object' ? toInt(charge.amount_refunded) : 0;

  return {
    status,
    paid_cents: paid,
    list_cents: list,
    plus_discount_cents: plusDiscount,
    promo_discount_cents: promoDiscount,
    refunded_cents: Math.min(refunded, paid),
    currency: String(session?.currency || 'eur').toUpperCase().slice(0, 3),
  };
}

/** Convierte una factura pagada de suscripción en los importes que guardamos. */
export function mapInvoice(invoice) {
  const paid = toInt(invoice?.amount_paid);
  const subtotal = invoice?.subtotal === null || invoice?.subtotal === undefined ? paid : toInt(invoice.subtotal);
  const discounts = Array.isArray(invoice?.total_discount_amounts)
    ? invoice.total_discount_amounts.reduce((total, d) => total + toInt(d?.amount), 0)
    : 0;
  const paidAtUnix = invoice?.status_transitions?.paid_at || invoice?.created;
  return {
    status: invoice?.livemode === false ? 'test' : 'paid',
    paid_cents: paid,
    list_cents: subtotal,
    plus_discount_cents: 0,
    promo_discount_cents: discounts,
    refunded_cents: 0,
    currency: String(invoice?.currency || 'eur').toUpperCase().slice(0, 3),
    paid_at: paidAtUnix ? new Date(Number(paidAtUnix) * 1000) : null,
  };
}

const INSERT_SQL = `INSERT IGNORE INTO revenue_events
  (stripe_ref, kind, status, user_id, location_id, pack_id, credits, plan_code, list_cents,
   plus_discount_cents, promo_discount_cents, paid_cents, refunded_cents, currency, paid_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`;

async function insertEvent(db, e) {
  const [result] = await db.query(INSERT_SQL, [
    e.stripe_ref, e.kind, e.status, e.user_id ?? null, e.location_id ?? null, e.pack_id ?? null, e.credits ?? null,
    e.plan_code ?? null, e.list_cents ?? null, e.plus_discount_cents ?? 0, e.promo_discount_cents ?? 0,
    e.paid_cents ?? 0, e.refunded_cents ?? 0, e.currency || 'EUR', e.paid_at,
  ]);
  return result.affectedRows > 0;
}

const isMissing = (error) => error?.code === 'resource_missing' || error?.statusCode === 404;

/** Compras de packs que están en la base de datos pero aún no en el libro de ingresos. */
export async function findUnsyncedPurchases(db, limit) {
  const [rows] = await db.query(
    `SELECT t.id, t.user_id, t.amount AS credits, t.pack_id, t.payment_reference, t.created_at, ep.location_id
     FROM easypass_transactions t
     LEFT JOIN easypass_packs ep ON ep.id = t.pack_id
     LEFT JOIN revenue_events r ON r.stripe_ref = t.payment_reference
     WHERE t.type = 'purchase' AND t.amount > 0
       AND t.payment_reference LIKE 'cs_%'
       AND r.id IS NULL
     ORDER BY t.id ASC
     LIMIT ?`,
    [Number(limit)]
  );
  return rows;
}

export async function countUnsyncedPurchases(db) {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS pending
     FROM easypass_transactions t
     LEFT JOIN revenue_events r ON r.stripe_ref = t.payment_reference
     WHERE t.type = 'purchase' AND t.amount > 0 AND t.payment_reference LIKE 'cs_%' AND r.id IS NULL`
  );
  return Number(row.pending);
}

async function syncPackPurchases({ db, stripe, limit, log }) {
  const result = { checked: 0, inserted: 0, test_mode: 0, unavailable: 0, failed: 0 };
  const purchases = await findUnsyncedPurchases(db, limit);
  for (const purchase of purchases) {
    result.checked += 1;
    const base = {
      stripe_ref: purchase.payment_reference,
      kind: 'easypass_pack',
      user_id: purchase.user_id,
      location_id: purchase.location_id,
      pack_id: purchase.pack_id,
      credits: Number(purchase.credits),
      // El momento del pago es el de la compra registrada en nuestro libro, que es la que usan el resto de métricas.
      paid_at: purchase.created_at,
    };
    try {
      const session = await stripe.checkout.sessions.retrieve(purchase.payment_reference, { expand: ['payment_intent.latest_charge'] });
      const mapped = mapCheckoutSession(session);
      if (await insertEvent(db, { ...base, ...mapped })) {
        result.inserted += 1;
        if (mapped.status === 'test') result.test_mode += 1;
        if (mapped.status === 'unavailable') result.unavailable += 1;
      }
    } catch (error) {
      if (isMissing(error)) {
        // Stripe ya no la encuentra (p. ej. compra en modo prueba): se marca para no volver a intentarlo.
        await insertEvent(db, { ...base, status: 'unavailable', paid_cents: 0 });
        result.unavailable += 1;
      } else {
        result.failed += 1;
        log.error?.('[REVENUE SYNC] No se pudo leer la sesión', purchase.payment_reference, error?.message || error);
      }
    }
  }
  return result;
}

async function syncSubscriptionInvoices({ db, stripe, log }) {
  const result = { subscriptions_checked: 0, inserted: 0, failed: 0 };
  const [subscriptions] = await db.query(
    `SELECT us.user_id, us.stripe_subscription_id, us.location_id, sp.code AS plan_code
     FROM user_subscriptions us
     JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.stripe_subscription_id IS NOT NULL`
  );
  for (const subscription of subscriptions) {
    result.subscriptions_checked += 1;
    try {
      for await (const invoice of stripe.invoices.list({ subscription: subscription.stripe_subscription_id, status: 'paid', limit: 100 })) {
        const mapped = mapInvoice(invoice);
        if (mapped.paid_cents <= 0 || !mapped.paid_at) continue; // pruebas gratuitas: no hay ingreso
        const inserted = await insertEvent(db, {
          stripe_ref: invoice.id,
          kind: 'subscription',
          user_id: subscription.user_id,
          location_id: subscription.location_id ?? null,
          plan_code: subscription.plan_code,
          ...mapped,
        });
        if (inserted) result.inserted += 1;
      }
    } catch (error) {
      result.failed += 1;
      log.error?.('[REVENUE SYNC] No se pudieron leer las facturas de', subscription.stripe_subscription_id, error?.message || error);
    }
  }
  return result;
}

/**
 * Ejecuta una sincronización. `limit` acota las compras de packs por pasada
 * (cada una es una llamada a Stripe); si quedan más, `remaining` lo indica.
 */
export async function syncRevenue({ db = pool, stripe, limit = 200, includeSubscriptions = true, log = console } = {}) {
  if (!stripe) throw new Error('Stripe no está configurado');
  const packs = await syncPackPurchases({ db, stripe, limit, log });
  const subscriptions = includeSubscriptions ? await syncSubscriptionInvoices({ db, stripe, log }) : null;
  clearKpiCache();
  return { packs, subscriptions, remaining: await countUnsyncedPurchases(db) };
}

// ---------- ejecución automática ----------

let started = false;
let running = false;

export function startRevenueSyncScheduler({ stripe, intervalHours = 6, log = console } = {}) {
  if (started) return;
  if (!stripe) {
    log.warn?.('[REVENUE SYNC] Sin STRIPE_SECRET_KEY: la sincronización automática de ingresos no se activa.');
    return;
  }
  started = true;
  registerScheduler('revenue-sync', { maxAgeSeconds: (intervalHours + 2) * 3600 });

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await syncRevenue({ stripe, limit: 300, log });
      markSchedulerSuccess('revenue-sync');
      if (result.packs.checked || result.subscriptions?.inserted) log.log?.('[REVENUE SYNC]', JSON.stringify(result));
    } catch (error) {
      markSchedulerFailure('revenue-sync', error);
      log.error?.('[REVENUE SYNC]', error?.message || error);
    } finally {
      running = false;
    }
  };

  // Primera pasada con el servidor ya arrancado, para no competir con el arranque.
  const first = setTimeout(run, 90_000);
  first.unref?.();
  const timer = setInterval(run, intervalHours * 3600 * 1000);
  timer.unref?.();
}
