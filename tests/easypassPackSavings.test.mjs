import test from 'node:test';
import assert from 'node:assert/strict';
import { getPackSavings } from '../src/utils/easypassPackSavings.js';

const single = { credits: 1, price_cents: 600, location_id: 1 };
const pack = { credits: 5, price_cents: 2500, location_id: 1 };
test('calculates savings and unit cost in cents', () => {
  assert.deepEqual(getPackSavings(pack, [single, pack]), {
    unitPriceCents: 500, separatePriceCents: 3000, savingsCents: 500,
  });
});
test('compares discounted prices, not the original Plus price', () => {
  assert.equal(getPackSavings({ ...pack, price_cents: 2250, original_price_cents: 2500 },
    [{ ...single, price_cents: 540 }]).savingsCents, 450);
});
test('does not invent savings for missing singles or another city', () => {
  assert.equal(getPackSavings(pack, []).savingsCents, 0);
  assert.equal(getPackSavings(pack, [{ ...single, location_id: 2 }]).separatePriceCents, null);
});
test('does not advertise savings for a single, equal price or higher price', () => {
  assert.equal(getPackSavings(single, [single]).savingsCents, 0);
  assert.equal(getPackSavings({ ...pack, price_cents: 3000 }, [single]).savingsCents, 0);
  assert.equal(getPackSavings({ ...pack, price_cents: 3500 }, [single]).savingsCents, 0);
});
test('supports API aliases and rejects invalid amounts', () => {
  assert.equal(getPackSavings({ easyPassAmount: 3, priceCents: 1500 },
    [{ easyPassAmount: 1, priceCents: 600 }]).savingsCents, 300);
  assert.equal(getPackSavings({ ...pack, credits: 0 }, [single]), null);
  assert.equal(getPackSavings({ ...pack, price_cents: NaN }, [single]), null);
});
