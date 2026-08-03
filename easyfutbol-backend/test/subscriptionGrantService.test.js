import assert from 'node:assert/strict';
import test from 'node:test';

import { grantSubscriptionEasyPass } from '../src/services/subscriptionGrantService.js';

function createFakeDb({ grantAffectedRows = 1 } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('INSERT IGNORE INTO subscription_monthly_grants')) {
        return [{ affectedRows: grantAffectedRows }];
      }
      return [{ affectedRows: 1 }];
    },
  };
}

test('Pro concede cuatro EasyPass y registra el movimiento una sola vez', async () => {
  const db = createFakeDb();
  const granted = await grantSubscriptionEasyPass(db, {
    userId: 42,
    planCode: 'pro',
    amount: 4,
    reference: 'subscription_invoice:in_123',
  });

  assert.equal(granted, true);
  assert.equal(db.calls.length, 3);
  assert.deepEqual(db.calls[1].params, [4, 42]);
  assert.match(db.calls[2].params[2], /Pro/);
});

test('un webhook repetido no vuelve a incrementar el saldo', async () => {
  const db = createFakeDb({ grantAffectedRows: 0 });
  const granted = await grantSubscriptionEasyPass(db, {
    userId: 42,
    planCode: 'plus',
    amount: 1,
    reference: 'subscription_invoice:in_repeated',
  });

  assert.equal(granted, false);
  assert.equal(db.calls.length, 1);
});

test('rechaza concesiones mal formadas antes de tocar la base de datos', async () => {
  const db = createFakeDb();
  await assert.rejects(
    grantSubscriptionEasyPass(db, {
      userId: 42,
      planCode: 'unknown',
      amount: 4,
      reference: 'invalid',
    }),
    /Datos inválidos/
  );
  assert.equal(db.calls.length, 0);
});

