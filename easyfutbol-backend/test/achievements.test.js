import test from 'node:test';
import assert from 'node:assert/strict';
import { getReachedAchievementCodes } from '../src/services/achievementsService.js';

const progress = (over = {}) => ({
  matches: 0, goals: 0, assists: 0, mvps: 0,
  best_goals_in_match: 0, best_assists_in_match: 0, complete_player: 0,
  ...over,
});

test('sin partidos no hay logros', () => {
  assert.deepEqual(getReachedAchievementCodes(progress()), []);
});

test('alcanzar el objetivo exacto desbloquea, quedarse a uno no', () => {
  const codes = getReachedAchievementCodes(progress({ matches: 5, goals: 9 }));
  assert.ok(codes.includes('DEBUTANTE'));
  assert.ok(codes.includes('MATCHES_5'));
  assert.ok(!codes.includes('MATCHES_10'));
  assert.ok(codes.includes('FIRST_GOAL'));
  assert.ok(!codes.includes('GOALS_10'));
});

test('los logros de un solo partido usan el mejor partido', () => {
  const codes = getReachedAchievementCodes(progress({ matches: 1, goals: 3, best_goals_in_match: 3, assists: 1, complete_player: 1 }));
  assert.deepEqual(
    ['DEBUTANTE', 'FIRST_GOAL', 'FIRST_ASSIST', 'DOUBLE', 'HAT_TRICK', 'COMPLETE_PLAYER'].filter((code) => !codes.includes(code)),
    []
  );
  assert.ok(!codes.includes('ASSISTS_3_MATCH'));
});

test('progreso ausente o raro no rompe nada', () => {
  assert.deepEqual(getReachedAchievementCodes(undefined), []);
  assert.deepEqual(getReachedAchievementCodes({ matches: 'x' }), []);
});
