import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addMonths,
  computeAcquisition,
  computeActivation,
  computeFillRate,
  computeMonetization,
  computeTraction,
  lastMonthKeys,
  madridDayKey,
  madridMonthKey,
  median,
  priceStats,
} from '../src/services/kpiMetrics.js';

const NOW = new Date('2026-10-10T12:00:00Z'); // sábado 10 de octubre de 2026
const at = (iso) => new Date(iso);
const part = (player, match, iso, location = 1) => ({ player_id: player, match_id: match, starts_at: at(iso), location_id: location });

test('los meses se cortan en hora de Madrid, no en UTC', () => {
  // 30/9 22:30 UTC ya es 1/10 00:30 en Madrid (verano, UTC+2)
  assert.equal(madridMonthKey('2026-09-30T22:30:00Z'), '2026-10');
  assert.equal(madridMonthKey('2026-09-30T21:59:00Z'), '2026-09');
  // invierno (UTC+1): 31/12 23:30 UTC ya es 2027
  assert.equal(madridMonthKey('2026-12-31T23:30:00Z'), '2027-01');
  assert.equal(madridDayKey('2026-03-28T23:30:00Z'), '2026-03-29');
  assert.equal(madridMonthKey('no es una fecha'), null);
});

test('aritmética de meses cruza el cambio de año', () => {
  assert.equal(addMonths('2026-11', 3), '2027-02');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.deepEqual(lastMonthKeys(NOW, 3), ['2026-08', '2026-09', '2026-10']);
});

test('la mediana usa el valor central o la media de los dos centrales', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

// Escenario: 4 jugadores.
//  A: 1/8 (match 1), 5/9 (match 4), 6/10 (match 6)
//  B: 1/8 (match 1), 6/10 (match 6)
//  C: 5/9 (match 4)
//  D: 6/10 (match 6), y dos entradas del mismo partido (cuenta una)
const scenario = [
  part(1, 1, '2026-08-01T18:00:00Z'), part(2, 1, '2026-08-01T18:00:00Z'),
  part(1, 4, '2026-09-05T18:00:00Z'), part(3, 4, '2026-09-05T18:00:00Z'),
  part(1, 6, '2026-10-06T18:00:00Z'), part(2, 6, '2026-10-06T18:00:00Z'),
  part(4, 6, '2026-10-06T18:00:00Z'), part(4, 6, '2026-10-06T18:00:00Z'),
];

test('jugadores activos, nuevos y retención mes a mes', () => {
  const traction = computeTraction({ participations: scenario, now: NOW, months: 3 });
  const [aug, sep, oct] = traction.monthly;

  assert.equal(aug.active_players, 2);
  assert.equal(aug.new_players, 2);
  assert.equal(aug.mom_retention, null); // no hay julio

  assert.equal(sep.active_players, 2);
  assert.equal(sep.new_players, 1); // C
  assert.equal(sep.returning_players, 1); // A
  assert.equal(sep.retained_from_previous, 1); // de {A,B} solo A sigue
  assert.equal(sep.churned_from_previous, 1);
  assert.equal(sep.mom_retention, 0.5);

  assert.equal(oct.partial, true);
  assert.equal(oct.active_players, 3); // A, B, D
  assert.equal(oct.new_players, 1); // D
  assert.equal(oct.participations, 3); // D con dos entradas cuenta una vez
  assert.equal(oct.tickets, 4); // pero las plazas son 4
  assert.equal(oct.retained_from_previous, 1); // de {A,C} solo A
  assert.equal(oct.mom_retention, 0.5);
});

test('retención por cohorte: el mes en curso se marca parcial y no entra en la curva media', () => {
  const { retention } = computeTraction({ participations: scenario, now: NOW, months: 3 });
  const aug = retention.cohorts.find((c) => c.cohort_month === '2026-08');
  assert.equal(aug.size, 2);
  assert.deepEqual(aug.retained.slice(0, 4), [2, 1, 2, null]); // ago:2, sep:1 (A), oct:2 (A,B), nov: aún no existe
  assert.equal(aug.partial_offset, 2);

  // offset 1: la cohorte de agosto (1 de 2 sigue en septiembre). La de septiembre a +1 cae en
  // octubre, que es el mes parcial, así que se excluye en vez de contar como "no volvió".
  assert.equal(retention.average_curve[1], 0.5);
  // offset 2 de ago es el mes parcial, se excluye; sep+2 no existe todavía
  assert.equal(retention.average_curve[2], null);
});

test('retención a 30 días descarta a quien aún no ha cumplido el plazo (no cuenta como "no volvió")', () => {
  const { retention } = computeTraction({ participations: scenario, now: NOW, months: 3 });
  const d30 = retention.windows.d30;
  // elegibles: A (1/8), B (1/8), C (5/9, hace 35 días). D (6/10) aún no.
  assert.equal(d30.eligible_players, 3);
  // A volvió el 5/9 (35 días después, fuera de 30). B no volvió dentro de 30 días. C no volvió.
  assert.equal(d30.returned_players, 0);
  // A los 60 días: elegibles A y B (llevan 70 días). C lleva 35 y D 4, aún no cuentan.
  // A volvió a los 35 días → sí. B volvió a los 66 días → fuera de plazo.
  assert.equal(retention.windows.d60.eligible_players, 2);
  assert.equal(retention.windows.d60.returned_players, 1);
  assert.equal(retention.windows.d60.rate, 0.5);
  // A los 90 días nadie lleva aún 90 días: no hay dato, no un 0 %.
  assert.equal(retention.windows.d90.eligible_players, 0);
  assert.equal(retention.windows.d90.rate, null);
});

test('frecuencia: distribución del último mes completo y días entre partidos', () => {
  const { frequency } = computeTraction({ participations: scenario, now: NOW, months: 3 });
  assert.equal(frequency.last_full_month, '2026-09');
  assert.deepEqual(frequency.last_full_month_distribution, { one: 2, two: 0, three_four: 0, five_plus: 0 });
  // jul: 0 · ago: 2 partidos / 2 jugadores · sep: 2 partidos / 2 jugadores → 4 / 4
  assert.equal(frequency.avg_matches_per_active_player_last_3_full_months, 1);
});

test('el filtro por sede deja fuera a quien solo juega en otra', () => {
  const rows = [part(1, 1, '2026-09-05T18:00:00Z', 1), part(2, 2, '2026-09-06T18:00:00Z', 2)];
  const sede1 = computeTraction({ participations: rows, now: NOW, months: 2, locationId: 1 });
  assert.equal(sede1.monthly.at(-2).active_players, 1);
  assert.equal(sede1.current.players_ever, 1);
  assert.equal(computeTraction({ participations: rows, now: NOW, months: 2 }).current.players_ever, 2);
});

test('MAU de 30 días y WAU de 7 días miran la ventana exacta', () => {
  const rows = [
    part(1, 1, '2026-10-08T18:00:00Z'), // hace 2 días
    part(2, 2, '2026-09-25T18:00:00Z'), // hace 15 días
    part(3, 3, '2026-09-01T18:00:00Z'), // hace 39 días
  ];
  const { current } = computeTraction({ participations: rows, now: NOW, months: 2 });
  assert.equal(current.wau_last_7d, 1);
  assert.equal(current.mau_last_30d, 2);
  assert.equal(current.stickiness_wau_mau, 0.5);
});

test('activación: solo cuentan los registros que ya han cumplido el plazo y se ignoran admins', () => {
  const users = [
    { id: 1, created_at: at('2026-08-01T10:00:00Z'), role: 'player' },
    { id: 2, created_at: at('2026-08-02T10:00:00Z'), role: 'player' },
    { id: 3, created_at: at('2026-10-08T10:00:00Z'), role: 'player' }, // hace 2 días: ni 7 ni 30
    { id: 4, created_at: at('2026-08-03T10:00:00Z'), role: 'admin' },
  ];
  const participations = [part(1, 1, '2026-08-05T18:00:00Z'), part(2, 9, '2026-09-20T18:00:00Z')];
  const activation = computeActivation({ users, participations, now: NOW, months: 3 });
  const aug = activation.monthly.find((m) => m.month === '2026-08');
  assert.equal(aug.registrations, 2); // el admin no cuenta
  assert.equal(aug.played_within_7d, 1);
  assert.equal(aug.rate_7d, 0.5);
  assert.equal(aug.played_within_30d, 1);
  assert.equal(aug.never_played_after_30d, 0);
  const oct = activation.monthly.find((m) => m.month === '2026-10');
  assert.equal(oct.registrations, 1);
  assert.equal(oct.eligible_7d, 0);
  assert.equal(oct.rate_7d, null);
});

test('ocupación de partidos: plazas ocupadas entre aforo, sin pasarse del aforo', () => {
  const matches = [
    { match_id: 1, starts_at: at('2026-09-05T18:00:00Z'), capacity: 14, taken: 14, location_id: 1 },
    { match_id: 2, starts_at: at('2026-09-12T18:00:00Z'), capacity: 14, taken: 7, location_id: 1 },
    { match_id: 3, starts_at: at('2026-09-12T18:00:00Z'), capacity: 14, taken: 99, location_id: 2 },
  ];
  const all = computeFillRate({ matches, now: NOW, months: 2 });
  const sep = all.monthly.find((m) => m.month === '2026-09');
  assert.equal(sep.matches, 3);
  assert.equal(sep.taken, 14 + 7 + 14); // el 99 se recorta al aforo
  assert.equal(sep.full_matches, 2);
  const sede1 = computeFillRate({ matches, now: NOW, months: 2, locationId: 1 });
  assert.equal(sede1.monthly.find((m) => m.month === '2026-09').fill_rate, 0.75);
});

// ---------- monetización ----------

const pack = (over = {}) => ({
  stripe_ref: 'cs_1', kind: 'easypass_pack', status: 'paid', user_id: 1, location_id: 1, pack_id: 10,
  credits: 10, list_cents: 5000, plus_discount_cents: 0, promo_discount_cents: 0, paid_cents: 5000, refunded_cents: 0,
  paid_at: at('2026-09-10T10:00:00Z'), created_at: at('2026-10-01T10:00:00Z'), ...over,
});

test('precio efectivo por EasyPass = dinero cobrado entre EasyPass comprados', () => {
  const stats = priceStats([
    pack({ credits: 10, list_cents: 5000, paid_cents: 5000 }),
    pack({ stripe_ref: 'cs_2', credits: 10, list_cents: 5000, plus_discount_cents: 500, paid_cents: 4500 }),
    pack({ stripe_ref: 'cs_3', credits: 20, list_cents: 8000, promo_discount_cents: 800, paid_cents: 7200 }),
  ]);
  assert.equal(stats.orders, 3);
  assert.equal(stats.passes_sold, 40);
  assert.equal(stats.revenue_cents, 16700);
  assert.equal(stats.paid_per_pass_cents, 418); // 16700 / 40 = 417,5 → 418
  assert.equal(stats.list_per_pass_cents, 450); // 18000 / 40
  assert.equal(stats.discount_rate, round4(1 - 16700 / 18000));
  assert.equal(stats.orders_with_discount, 2);
});

test('un reembolso resta del ingreso neto pero no cambia el precio cobrado', () => {
  const stats = priceStats([pack({ credits: 10, paid_cents: 5000, refunded_cents: 5000 })]);
  assert.equal(stats.paid_per_pass_cents, 500);
  assert.equal(stats.net_per_pass_cents, 0);
  assert.equal(stats.net_revenue_cents, 0);
});

test('sin compras no se inventa ningún precio', () => {
  const stats = priceStats([]);
  assert.equal(stats.paid_per_pass_cents, null);
  assert.equal(stats.discount_rate, null);
});

const tx = (over) => ({ id: 1, user_id: 1, type: 'purchase', amount: 10, pack_id: 10, payment_reference: 'cs_1', created_at: at('2026-09-10T10:00:00Z'), location_id: 1, ...over });

test('monetización: ingresos mensuales, emisión gratuita, canje neto y compras manuales excluidas', () => {
  const result = computeMonetization({
    revenueEvents: [
      pack(),
      pack({ stripe_ref: 'cs_t', status: 'test', paid_cents: 999999 }),
      { stripe_ref: 'in_1', kind: 'subscription', status: 'paid', user_id: 2, location_id: null, plan_code: 'plus', credits: null, paid_cents: 500, refunded_cents: 0, paid_at: at('2026-09-15T10:00:00Z'), created_at: at('2026-10-01T10:00:00Z') },
    ],
    passTransactions: [
      tx(),
      tx({ id: 2, payment_reference: 'manual_123', amount: 50 }), // compra de prueba: fuera
      tx({ id: 3, type: 'plus_grant', amount: 1, pack_id: null, payment_reference: 'x', location_id: null }),
      tx({ id: 4, type: 'gift_received', amount: 3, pack_id: null, payment_reference: null, location_id: null }), // regalo entre usuarios: no es emisión
      tx({ id: 5, type: 'spend', amount: -4, pack_id: null, payment_reference: null }),
      tx({ id: 6, type: 'refund', amount: 1, pack_id: null, payment_reference: null }),
    ],
    packs: [{ id: 10, name: 'Pack 10', credits: 10, price_cents: 5000, location_id: 1 }],
    balances: [{ location_id: 1, passes: 20, holders: 5 }],
    subscriptions: [{ plan_code: 'plus', status: 'active', count: 3, price_cents: 500 }],
    now: NOW,
    months: 2,
  });
  const sep = result.monthly.find((m) => m.month === '2026-09');
  assert.equal(sep.pack_revenue_cents, 5000); // el pago en modo prueba no suma
  assert.equal(sep.subscription_revenue_cents, 500);
  assert.equal(sep.revenue_cents, 5500);
  assert.equal(sep.paying_users, 2);
  assert.equal(sep.arppu_cents, 2750);
  assert.equal(sep.passes_issued_paid, 10); // la compra manual de 50 no cuenta
  assert.equal(sep.passes_issued_free, 1); // el regalo entre usuarios tampoco
  assert.equal(sep.passes_redeemed, 3); // 4 gastados − 1 devuelto
  assert.equal(sep.blended_price_per_issued_pass_cents, 455); // 5000 / 11
  assert.equal(result.data_quality.manual_test_purchases_excluded, 1);
  assert.equal(result.data_quality.purchases_test_mode, 1);
  assert.equal(result.subscribers.active, 3);
  assert.equal(result.subscribers.mrr_list_cents, 1500);
  assert.equal(result.liability.outstanding_passes, 20);
  assert.equal(result.liability.estimated_value_cents, 10000); // 20 × 500
});

test('en una sede solo entran los packs de esa sede y no las suscripciones', () => {
  const events = [
    pack({ location_id: 1 }),
    pack({ stripe_ref: 'cs_2', location_id: 2, paid_cents: 3000, credits: 10, list_cents: 3000 }),
    { stripe_ref: 'in_1', kind: 'subscription', status: 'paid', user_id: 2, paid_cents: 500, refunded_cents: 0, paid_at: at('2026-09-15T10:00:00Z'), created_at: at('2026-10-01T10:00:00Z') },
  ];
  const sede2 = computeMonetization({ revenueEvents: events, passTransactions: [], now: NOW, months: 2, locationId: 2 });
  const sep = sede2.monthly.find((m) => m.month === '2026-09');
  assert.equal(sep.pack_revenue_cents, 3000);
  assert.equal(sep.subscription_revenue_cents, 0);
  assert.equal(sede2.subscribers.scope, 'no_disponible_por_sede');
});

test('cobertura del dato: avisa de las compras que Stripe aún no ha sincronizado', () => {
  const result = computeMonetization({
    revenueEvents: [pack({ stripe_ref: 'cs_1' })],
    passTransactions: [tx({ payment_reference: 'cs_1' }), tx({ id: 2, payment_reference: 'cs_2' })],
    now: NOW,
    months: 2,
  });
  assert.equal(result.data_quality.purchases_total, 2);
  assert.equal(result.data_quality.purchases_in_ledger, 1);
  assert.equal(result.data_quality.coverage_rate, 0.5);
});

test('las compras sin referencia de Stripe no se pueden leer: no cuentan en contra de la cobertura', () => {
  const result = computeMonetization({
    revenueEvents: [pack({ stripe_ref: 'cs_1' })],
    passTransactions: [
      tx({ payment_reference: 'cs_1' }),
      tx({ id: 2, payment_reference: null }), // compra antigua sin referencia
      tx({ id: 3, payment_reference: 'pi_old' }), // referencia que no es una sesión de Checkout
    ],
    now: NOW,
    months: 2,
  });
  assert.equal(result.data_quality.purchases_total, 3);
  assert.equal(result.data_quality.purchases_with_stripe_ref, 1);
  assert.equal(result.data_quality.purchases_without_stripe_ref, 2);
  assert.equal(result.data_quality.coverage_rate, 1); // todo lo legible está sincronizado
});

test('recompra: censura por plazo y se calcula con el libro de EasyPass', () => {
  const result = computeMonetization({
    revenueEvents: [],
    passTransactions: [
      tx({ id: 1, user_id: 1, payment_reference: 'cs_a', created_at: at('2026-07-01T10:00:00Z') }),
      tx({ id: 2, user_id: 1, payment_reference: 'cs_b', created_at: at('2026-07-20T10:00:00Z') }), // 19 días después
      tx({ id: 3, user_id: 2, payment_reference: 'cs_c', created_at: at('2026-07-01T10:00:00Z') }),
      tx({ id: 4, user_id: 3, payment_reference: 'cs_d', created_at: at('2026-10-05T10:00:00Z') }), // muy reciente
    ],
    now: NOW,
    months: 2,
  });
  assert.equal(result.repurchase.payers, 3);
  assert.equal(result.repurchase.repeat_payers, 1);
  assert.equal(result.repurchase.windows.d30.eligible_payers, 2); // el 3 aún no cumple 30 días
  assert.equal(result.repurchase.windows.d30.repurchased, 1);
  assert.equal(result.repurchase.windows.d30.rate, 0.5);
});

// ---------- CAC ----------

test('CAC: gasto entre nuevos clientes, y sin gasto registrado no se inventa', () => {
  const users = [
    { id: 1, created_at: at('2026-08-05T10:00:00Z'), role: 'player', preferred_location: 'valladolid' },
    { id: 2, created_at: at('2026-08-06T10:00:00Z'), role: 'player', preferred_location: 'valladolid' },
    { id: 3, created_at: at('2026-08-07T10:00:00Z'), role: 'player', preferred_location: 'asturias' },
    { id: 4, created_at: at('2026-08-08T10:00:00Z'), role: 'admin', preferred_location: 'valladolid' },
  ];
  const participations = [part(1, 1, '2026-08-10T18:00:00Z', 1), part(3, 2, '2026-08-11T18:00:00Z', 2)];
  const purchaseTransactions = [
    tx({ user_id: 1, payment_reference: 'cs_1', created_at: at('2026-08-09T10:00:00Z') }),
    tx({ id: 2, user_id: 1, payment_reference: 'cs_2', created_at: at('2026-09-09T10:00:00Z') }), // recompra: no es cliente nuevo
  ];
  const result = computeAcquisition({
    users, participations, purchaseTransactions,
    referrals: [{ referred_user_id: 2 }],
    spendRows: [{ month: '2026-08-01', channel: 'instagram', location_id: 0, amount_cents: 30000 }],
    now: NOW, months: 3,
  });
  const aug = result.monthly.find((m) => m.month === '2026-08');
  assert.equal(aug.spend_cents, 30000);
  assert.equal(aug.registrations, 3); // el admin no cuenta
  assert.equal(aug.referred_registrations, 1);
  assert.equal(aug.new_players, 2);
  assert.equal(aug.new_payers, 1);
  assert.equal(aug.cac_per_registration_cents, 10000);
  assert.equal(aug.cac_per_new_player_cents, 15000);
  assert.equal(aug.cac_per_new_payer_cents, 30000);
  // septiembre no tiene gasto registrado → ni cero ni inventado
  assert.equal(result.monthly.find((m) => m.month === '2026-09').cac_per_new_payer_cents, null);
  assert.equal(result.totals.last_12_months.months_with_spend, 1);
  assert.equal(result.totals.last_12_months.cac_per_new_payer_cents, 30000);
  assert.deepEqual(result.spend_by_channel_last_12m, [{ channel: 'instagram', spend_cents: 30000 }]);
});

test('CAC por sede: el gasto general queda sin asignar y los clientes se reparten por sede', () => {
  const users = [{ id: 1, created_at: at('2026-08-05T10:00:00Z'), role: 'player', preferred_location: 'valladolid' }];
  const result = computeAcquisition({
    users,
    participations: [],
    purchaseTransactions: [tx({ user_id: 1, payment_reference: 'cs_1', created_at: at('2026-08-09T10:00:00Z'), location_id: 1 })],
    spendRows: [
      { month: '2026-08-01', channel: 'instagram', location_id: 1, amount_cents: 10000 },
      { month: '2026-08-01', channel: 'radio', location_id: 0, amount_cents: 40000 },
    ],
    now: NOW, months: 3, locationId: 1,
  });
  assert.equal(result.monthly.find((m) => m.month === '2026-08').spend_cents, 10000);
  assert.equal(result.unallocated_spend_cents, 40000);
  assert.equal(result.monthly.find((m) => m.month === '2026-08').cac_per_new_payer_cents, 10000);
});

test('recuperación: ingreso a 90 días por comprador frente al CAC', () => {
  const users = [{ id: 1, created_at: at('2026-06-01T10:00:00Z'), role: 'player', preferred_location: 'valladolid' }];
  const result = computeAcquisition({
    users,
    participations: [],
    purchaseTransactions: [tx({ user_id: 1, payment_reference: 'cs_1', created_at: at('2026-06-10T10:00:00Z') })],
    revenueEvents: [
      pack({ stripe_ref: 'cs_1', user_id: 1, paid_cents: 5000, paid_at: at('2026-06-10T10:00:00Z') }),
      pack({ stripe_ref: 'cs_2', user_id: 1, paid_cents: 4000, paid_at: at('2026-07-10T10:00:00Z') }), // dentro de 90 días
      pack({ stripe_ref: 'cs_3', user_id: 1, paid_cents: 9000, paid_at: at('2026-09-30T10:00:00Z') }), // fuera
    ],
    spendRows: [{ month: '2026-06-01', channel: 'general', location_id: 0, amount_cents: 3000 }],
    now: NOW, months: 6,
  });
  assert.equal(result.payback.payers_observed_90d, 1);
  assert.equal(result.payback.revenue_per_payer_90d_cents, 9000);
  assert.equal(result.payback.cac_per_new_payer_cents, 3000);
  assert.equal(result.payback.revenue_to_cac_ratio, 3);
});

function round4(value) { return Math.round(value * 10000) / 10000; }

test('los ingresos de cada sede salen por separado aunque no haya filtro de sede', () => {
  const events = [
    pack({ location_id: 1, user_id: 1, paid_cents: 5000 }),
    pack({ stripe_ref: 'cs_2', location_id: 2, user_id: 2, paid_cents: 3000, refunded_cents: 1000, credits: 10, list_cents: 3000 }),
    pack({ stripe_ref: 'cs_3', location_id: 2, user_id: 3, paid_cents: 2000, credits: 5, list_cents: 2000, paid_at: at('2026-10-02T10:00:00Z') }),
  ];
  const result = computeMonetization({ revenueEvents: events, passTransactions: [], now: NOW, months: 2 });
  const [vall, ast] = [result.effective_price.by_location[1], result.effective_price.by_location[2]];
  assert.equal(vall.all_time.revenue_cents, 5000);
  assert.equal(ast.all_time.revenue_cents, 5000);
  assert.equal(ast.all_time.refunded_cents, 1000);
  assert.equal(ast.paying_users, 2);
  assert.equal(ast.current_month.revenue_cents, 2000);
  assert.equal(ast.last_full_month.month, '2026-09');
  assert.equal(ast.last_full_month.revenue_cents, 3000);
  const sep = result.monthly.find((m) => m.month === '2026-09');
  assert.deepEqual(sep.pack_revenue_by_location, { 1: 5000, 2: 3000 });
});
