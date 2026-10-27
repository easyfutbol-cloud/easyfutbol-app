import assert from 'node:assert/strict';
import test from 'node:test';

import { mapCheckoutSession, mapInvoice, refreshRecentRefunds } from '../src/services/revenueSyncService.js';

const session = (over = {}) => ({
  payment_status: 'paid', livemode: true, currency: 'eur', amount_subtotal: 5000, amount_total: 5000,
  total_details: { amount_discount: 0 }, metadata: {}, ...over,
});

test('un pago sin descuentos: lista, cobrado y descuentos coherentes', () => {
  assert.deepEqual(mapCheckoutSession(session()), {
    status: 'paid', paid_cents: 5000, list_cents: 5000, plus_discount_cents: 0, promo_discount_cents: 0, refunded_cents: 0, currency: 'EUR',
  });
});

test('el descuento Plus ya viene aplicado en el precio: se reconstruye el precio de lista desde su porcentaje', () => {
  const mapped = mapCheckoutSession(session({ amount_subtotal: 4500, amount_total: 4500, metadata: { subscriptionDiscountPercent: '10' } }));
  assert.equal(mapped.list_cents, 5000);
  assert.equal(mapped.plus_discount_cents, 500);
  assert.equal(mapped.paid_cents, 4500);
});

test('el 50% del primer EasyPass cuenta como promoción y no como Plus', () => {
  const mapped = mapCheckoutSession(session({ amount_subtotal: 300, amount_total: 300, metadata: { subscriptionDiscountPercent: '0', firstPackDiscount: '1', firstPackDiscountPercent: '50' } }));
  assert.equal(mapped.list_cents, 600);
  assert.equal(mapped.promo_discount_cents, 300);
  assert.equal(mapped.plus_discount_cents, 0);
});

test('el código promocional se lee de total_details y el cobrado es lo que pagó de verdad', () => {
  const mapped = mapCheckoutSession(session({ amount_subtotal: 8000, amount_total: 7200, total_details: { amount_discount: 800 } }));
  assert.equal(mapped.promo_discount_cents, 800);
  assert.equal(mapped.paid_cents, 7200);
  assert.equal(mapped.list_cents, 8000);
});

test('los metadatos con un porcentaje absurdo no rompen el cálculo', () => {
  for (const percent of ['0', '100', '250', 'abc', '-5']) {
    const mapped = mapCheckoutSession(session({ metadata: { subscriptionDiscountPercent: percent } }));
    assert.equal(mapped.list_cents, 5000, `porcentaje ${percent}`);
    assert.equal(mapped.plus_discount_cents, 0, `porcentaje ${percent}`);
  }
});

test('el reembolso sale del cargo expandido y nunca supera lo cobrado', () => {
  assert.equal(mapCheckoutSession(session({ payment_intent: { latest_charge: { amount_refunded: 2000 } } })).refunded_cents, 2000);
  assert.equal(mapCheckoutSession(session({ payment_intent: { latest_charge: { amount_refunded: 99999 } } })).refunded_cents, 5000);
  // si Stripe no expande el cargo (viene como texto), no se inventa un reembolso
  assert.equal(mapCheckoutSession(session({ payment_intent: 'pi_123' })).refunded_cents, 0);
});

test('solo cuenta como ingreso lo pagado y en modo real', () => {
  assert.equal(mapCheckoutSession(session({ payment_status: 'unpaid' })).status, 'unavailable');
  assert.equal(mapCheckoutSession(session({ livemode: false })).status, 'test');
});

test('una respuesta incompleta da ceros, nunca NaN', () => {
  const mapped = mapCheckoutSession({});
  assert.equal(mapped.paid_cents, 0);
  assert.equal(mapped.list_cents, 0);
  assert.equal(mapped.status, 'unavailable');
  assert.equal(mapped.currency, 'EUR');
});

test('factura de suscripción: descuentos sumados y fecha de pago convertida', () => {
  const mapped = mapInvoice({
    amount_paid: 450, subtotal: 500, total_discount_amounts: [{ amount: 30 }, { amount: 20 }], livemode: true, currency: 'eur',
    status_transitions: { paid_at: 1788249600 }, created: 1788000000,
  });
  assert.equal(mapped.paid_cents, 450);
  assert.equal(mapped.list_cents, 500);
  assert.equal(mapped.promo_discount_cents, 50);
  assert.equal(mapped.paid_at.toISOString(), '2026-09-01T08:00:00.000Z');
  assert.equal(mapped.status, 'paid');
});

test('una factura de prueba gratuita no tiene fecha de pago aprovechable', () => {
  assert.equal(mapInvoice({ amount_paid: 0 }).paid_at, null);
  assert.equal(mapInvoice({ amount_paid: 500, livemode: false, created: 1788000000 }).status, 'test');
});

test('refrescar reembolsos actualiza solo los que han cambiado en Stripe', async () => {
  const updates = [];
  const db = {
    async query(sql, params) {
      if (sql.startsWith('SELECT')) {
        return [[
          { id: 1, stripe_ref: 'cs_a', paid_cents: 5000, refunded_cents: 0 },
          { id: 2, stripe_ref: 'cs_b', paid_cents: 3000, refunded_cents: 0 },
          { id: 3, stripe_ref: 'cs_c', paid_cents: 2000, refunded_cents: 500 },
          { id: 4, stripe_ref: 'cs_d', paid_cents: 1000, refunded_cents: 0 },
        ]];
      }
      updates.push(params);
      return [{ affectedRows: 1 }];
    },
  };
  const charges = { cs_a: 5000, cs_b: 0, cs_c: 500 };
  const stripe = {
    checkout: {
      sessions: {
        async retrieve(ref) {
          if (ref === 'cs_d') throw new Error('timeout');
          return session({ amount_total: 5000, payment_intent: { latest_charge: { amount_refunded: charges[ref] } } });
        },
      },
    },
  };
  const result = await refreshRecentRefunds({ db, stripe, log: { error() {} } });
  assert.deepEqual(result, { checked: 4, updated: 1, failed: 1 });
  assert.deepEqual(updates, [[5000, 1]]);
});
