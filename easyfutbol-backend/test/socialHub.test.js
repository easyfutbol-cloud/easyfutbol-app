import test from 'node:test';
import assert from 'node:assert/strict';
import { TOP_CATEGORIES, rankCategory } from '../src/services/socialHubService.js';

const rows = [
  { id: 1, name: 'Ana', goals: 5, matches: 4 },
  { id: 2, name: 'Bea', goals: 5, matches: 3 },
  { id: 3, name: 'Carla', goals: 5, matches: 3 },
  { id: 4, name: 'Dani', goals: 2, matches: 1 },
  { id: 5, name: 'Eva', goals: 0, matches: 6 },
];

test('top: más alto primero, desempata quien lo hizo en menos partidos', () => {
  const { items } = rankCategory(rows, 'goals', 1);
  assert.deepEqual(items.map((i) => [i.id, i.rank]), [[2, 1], [3, 1], [1, 3], [4, 4]]);
});

test('top: fuera los ceros, mi puesto aunque no entre en el límite', () => {
  const { items, me } = rankCategory(rows, 'goals', 4, 2);
  assert.equal(items.length, 2);
  assert.deepEqual(me, { rank: 4, value: 2 });
  assert.equal(rankCategory(rows, 'goals', 5).me, null, 'con 0 no sale');
});

test('top: categorías con clave única', () => {
  assert.equal(new Set(TOP_CATEGORIES.map((c) => c.key)).size, TOP_CATEGORIES.length);
});
