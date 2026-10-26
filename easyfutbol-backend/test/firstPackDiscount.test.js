import test from 'node:test';
import assert from 'node:assert/strict';
import { getFirstPackDiscount, getPackPricing } from '../src/services/easypassCampaignService.js';

const now = new Date('2026-10-26T12:00:00.000Z');
const single = { easyPassAmount: 1, price_cents: 600 };
const pack5 = { easyPassAmount: 5, price_cents: 2500 };

test('aplica el 50% al pack individual si el usuario no lo ha usado', () => {
  const pricing = getPackPricing(single, {}, now, {});
  assert.equal(pricing.priceCents, 300);
  assert.equal(pricing.regularPriceCents, 600);
  assert.equal(pricing.firstPackDiscountApplied, true);
});

test('no aplica a packs de más de un EasyPass', () => {
  const pricing = getPackPricing(pack5, {}, now, {});
  assert.equal(pricing.priceCents, 2500);
  assert.equal(pricing.firstPackDiscountApplied, false);
});

test('no aplica si el usuario ya lo usó', () => {
  const pricing = getPackPricing(single, { firstPackDiscountUsed: true }, now, {});
  assert.equal(pricing.priceCents, 600);
  assert.equal(pricing.firstPackDiscountApplied, false);
});

test('no se acumula con Plus: el 50% sustituye al descuento de suscripción', () => {
  const pricing = getPackPricing(single, { subscriptionPercent: 10 }, now, {});
  assert.equal(pricing.priceCents, 300);
  assert.equal(pricing.regularPriceCents, 540);
  assert.equal(pricing.subscriptionDiscountApplied, false);
});

test('Plus sigue aplicando cuando ya se gastó el descuento', () => {
  const pricing = getPackPricing(single, { subscriptionPercent: 10, firstPackDiscountUsed: true }, now, {});
  assert.equal(pricing.priceCents, 540);
  assert.equal(pricing.subscriptionDiscountApplied, true);
});

test('se puede apagar por entorno y respeta la fecha de fin (hora de Madrid)', () => {
  assert.equal(getFirstPackDiscount(single, {}, now, { FIRST_PACK_DISCOUNT_ENABLED: 'false' }).active, false);
  assert.equal(getFirstPackDiscount(single, {}, now, { FIRST_PACK_DISCOUNT_END_DATE: '2026-10-25' }).active, false);
  assert.equal(getFirstPackDiscount(single, {}, now, { FIRST_PACK_DISCOUNT_END_DATE: '2026-10-26' }).active, true);
});
