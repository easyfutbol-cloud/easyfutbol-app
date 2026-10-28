import test from 'node:test';
import assert from 'node:assert/strict';
import { qualifyReferralFromPurchase } from '../src/services/referralService.js';

// Conexión falsa: responde según el SQL y guarda cada consulta.
function fakeConn({ qualifiedTotal }) {
  const queries = [];
  return {
    queries,
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('FROM user_referrals') && sql.includes('FOR UPDATE')) return [[{ id: 9, referrer_user_id: 1501 }]];
      if (sql.includes('UPDATE user_referrals')) return [{ affectedRows: 1 }];
      if (sql.includes('COUNT(*)')) return [[{ total: qualifiedTotal }]];
      if (sql.includes('INSERT IGNORE INTO referral_rewards')) return [{ affectedRows: 1 }];
      return [{ affectedRows: 1 }];
    },
  };
}

test('al llegar a 5 referidos abona la recompensa en la sede de la compra', async () => {
  const conn = fakeConn({ qualifiedTotal: 5 });
  const result = await qualifyReferralFromPurchase(conn, { referredUserId: 1527, paymentReference: 'cs_x', locationId: 1 });
  assert.equal(result.rewarded, true);
  const balance = conn.queries.find((q) => q.sql.includes('user_easypass_balances'));
  assert.deepEqual(balance.params, [1501, 1]);
  assert.ok(conn.queries.some((q) => q.sql.includes("'referral_reward'")));
});

test('sin hito no toca saldos', async () => {
  const conn = fakeConn({ qualifiedTotal: 4 });
  const result = await qualifyReferralFromPurchase(conn, { referredUserId: 1526, paymentReference: 'cs_y', locationId: 1 });
  assert.equal(result.rewarded, false);
  assert.ok(!conn.queries.some((q) => q.sql.includes('user_easypass_balances')));
});
