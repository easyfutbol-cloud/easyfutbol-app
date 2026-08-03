import assert from 'node:assert/strict';
import test from 'node:test';

import { getFirstDayBillingConfig, getRenewalAlignmentUpdate } from '../src/services/subscriptionBillingService.js';

test('cobra inmediatamente si en Madrid ya es día 1', () => {
  assert.deepEqual(
    getFirstDayBillingConfig(new Date('2026-08-31T22:30:00.000Z')),
    { renewalAnchor: null }
  );
});

test('cobra al contratar y programa la siguiente renovación para el día 1 en verano', () => {
  const config = getFirstDayBillingConfig(new Date('2026-08-15T10:00:00.000Z'));

  assert.equal(
    new Date(config.renewalAnchor * 1000).toISOString(),
    '2026-08-31T22:05:00.000Z'
  );
});

test('respeta el cambio al horario de invierno', () => {
  const config = getFirstDayBillingConfig(new Date('2026-12-15T10:00:00.000Z'));

  assert.equal(
    new Date(config.renewalAnchor * 1000).toISOString(),
    '2026-12-31T23:05:00.000Z'
  );
});

test('después del cobro completo mueve la renovación al día 1 sin ajustes', () => {
  const update = getRenewalAlignmentUpdate({
    metadata: { renewalAnchor: '1788213900' },
  }, new Date('2026-08-15T10:00:00.000Z'));

  assert.deepEqual(update, {
    trial_end: 1788213900,
    proration_behavior: 'none',
    metadata: { renewalAligned: 'true' },
  });
});

test('no vuelve a alinear un webhook repetido', () => {
  assert.equal(getRenewalAlignmentUpdate({
    metadata: { renewalAnchor: '1788213900', renewalAligned: 'true' },
  }, new Date('2026-08-15T10:00:00.000Z')), null);
});
