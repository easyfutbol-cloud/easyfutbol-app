import assert from 'node:assert/strict';
import test from 'node:test';

import { getPlusFairPlayStatus } from '../src/services/plusFairPlayService.js';

function fakeDb({ active = true, warnings = 0 } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('FROM (')) return [[active ? { active: 1 } : undefined]];
      return [[{ total: warnings }]];
    },
  };
}

test('comprueba tanto la suscripción heredada como Plus/Pro de la plataforma nueva', async () => {
  const db = fakeDb();
  const result = await getPlusFairPlayStatus(db, 77);

  assert.equal(result.eligible, true);
  assert.deepEqual(db.calls[0].params, [77, 77]);
  assert.match(db.calls[0].sql, /user_plus_subscriptions/);
  assert.match(db.calls[0].sql, /user_subscriptions/);
  assert.match(db.calls[0].sql, /sp\.code IN \('plus','pro'\)/);
});

test('tres avisos suspenden los beneficios durante el mes', async () => {
  const result = await getPlusFairPlayStatus(fakeDb({ warnings: 3 }), 77);
  assert.equal(result.suspended, true);
  assert.equal(result.eligible, false);
  assert.equal(result.warningsRemaining, 0);
});

