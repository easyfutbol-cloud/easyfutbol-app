import assert from 'node:assert/strict';
import test from 'node:test';

import { getFirstDayBillingConfig } from '../src/services/subscriptionBillingService.js';

test('cobra inmediatamente si en Madrid ya es día 1', () => {
  assert.deepEqual(
    getFirstDayBillingConfig(new Date('2026-08-31T22:30:00.000Z')),
    {}
  );
});

test('ancla una compra de verano al primer día del mes siguiente en Madrid', () => {
  const config = getFirstDayBillingConfig(new Date('2026-08-15T10:00:00.000Z'));

  assert.equal(config.proration_behavior, 'none');
  assert.equal(
    new Date(config.billing_cycle_anchor * 1000).toISOString(),
    '2026-08-31T22:05:00.000Z'
  );
});

test('respeta el cambio al horario de invierno', () => {
  const config = getFirstDayBillingConfig(new Date('2026-12-15T10:00:00.000Z'));

  assert.equal(
    new Date(config.billing_cycle_anchor * 1000).toISOString(),
    '2026-12-31T23:05:00.000Z'
  );
});
