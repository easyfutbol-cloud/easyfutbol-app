import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeMatchEconomics, computePassBuyers, computeRepeatFunnel, computeStageCurve, monthsSince, toCsv,
} from '../src/services/investorPackMetrics.js';

const now = new Date('2026-11-16T12:00:00Z');
const p = (player, match, at, loc = 1) => ({ player_id: player, match_id: match, starts_at: at, location_id: loc });

test('embudo de repetición: todos y solo jugadores con 60+ días', () => {
  const parts = [
    p(1, 1, '2026-06-10T18:00:00Z'), p(1, 2, '2026-07-10T18:00:00Z'), p(1, 3, '2026-08-10T18:00:00Z'),
    p(2, 1, '2026-06-10T18:00:00Z'), p(2, 2, '2026-07-10T18:00:00Z'),
    p(2, 2, '2026-07-10T18:00:00Z'), // misma entrada repetida: un solo partido
    p(3, 1, '2026-06-10T18:00:00Z'),
    p(4, 9, '2026-11-05T18:00:00Z', 2), // reciente: fuera de la base madura
  ];
  const f = computeRepeatFunnel(parts, { now });
  assert.equal(f.lifetime.players, 4);
  assert.equal(f.mature.players, 3);
  assert.deepEqual(f.mature.steps.slice(0, 2).map((s) => [s.match_n, s.players, s.rate]), [[2, 2, 0.6667], [3, 1, 0.3333]]);
  assert.equal(f.distribution['1'], 2);
  assert.equal(f.distribution['2'], 1);
  assert.equal(f.distribution['3-4'], 1);
  assert.equal(computeRepeatFunnel(parts, { now, locationId: 2 }).lifetime.players, 1);
});

test('curva por etapa: cada sede empieza en su mes 1', () => {
  const matches = [
    { match_id: 8, starts_at: '2026-10-05T18:00:00Z', capacity: 10, taken: 1, location_id: 2 },
    { match_id: 9, starts_at: '2026-11-05T18:00:00Z', capacity: 10, taken: 2, location_id: 2 },
    { match_id: 1, starts_at: '2026-06-10T18:00:00Z', capacity: 10, taken: 4, location_id: 1 },
  ];
  const parts = [p(6, 8, '2026-10-05T18:00:00Z', 2), p(6, 9, '2026-11-05T18:00:00Z', 2), p(7, 9, '2026-11-05T18:00:00Z', 2)];
  const c = computeStageCurve({ participations: parts, matches, locationId: 2 });
  assert.equal(c.first_match_month, '2026-10');
  assert.deepEqual(c.rows.map((r) => [r.stage_month, r.active_players, r.new_players, r.cumulative_players, r.fill_rate]), [[1, 1, 1, 1, 0.1], [2, 2, 1, 2, 0.2]]);
  assert.deepEqual(computeStageCurve({ participations: [], matches: [], locationId: 3 }).rows, []);
});

test('compradores de EasyPass: sin compras manuales ni gastos', () => {
  const txs = [
    { user_id: 1, type: 'purchase', amount: 5, payment_reference: 'cs_a', location_id: 1 },
    { user_id: 1, type: 'purchase', amount: 5, payment_reference: 'cs_b', location_id: 1 },
    { user_id: 2, type: 'purchase', amount: 3, payment_reference: 'cs_c', location_id: 2 },
    { user_id: 3, type: 'purchase', amount: 5, payment_reference: 'manual_x', location_id: 1 },
    { user_id: 2, type: 'spend', amount: 1, location_id: 2 },
  ];
  const b = computePassBuyers(txs);
  assert.deepEqual([b.buyers, b.orders, b.passes, b.orders_per_buyer, b.passes_per_buyer, b.repeat_buyer_rate], [2, 3, 13, 1.5, 6.5, 0.5]);
  assert.equal(computePassBuyers(txs, { locationId: 2 }).buyers, 1);
});

test('economía por partido: sin coste de campo no inventa margen', () => {
  const fillRate = { last_90d: { avg_players_per_match: 12, fill_rate: 0.857 } };
  const noCost = computeMatchEconomics({ fillRate, effectivePassCents: 550, listPricePerSeatEur: 6 });
  assert.equal(noCost.revenue_per_match_eur, 66);
  assert.equal(noCost.margin_per_match_eur, null);
  const withCost = computeMatchEconomics({ fillRate, effectivePassCents: null, listPricePerSeatEur: 6, fieldCostEur: 40 });
  assert.equal(withCost.revenue_per_match_eur, 72);
  assert.equal(withCost.margin_per_match_eur, 32);
  assert.match(withCost.revenue_per_seat_source, /lista/);
});

test('meses de serie y CSV para Excel en español', () => {
  assert.equal(monthsSince('2025-06-15T10:00:00Z', now), 18);
  assert.equal(monthsSince(null, now), 1);
  assert.equal(toCsv([{ a: 1.5, b: 'x;y' }], [['a', 'A'], ['b', 'B']]), 'A;B\n1,5;"x;y"\n');
});
