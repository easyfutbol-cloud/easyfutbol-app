import test from 'node:test';
import assert from 'node:assert/strict';
import { pickShowcaseAchievements } from '../src/services/profileShowcaseService.js';

const progress = { matches: 12, goals: 26, assists: 3, mvps: 5, best_goals_in_match: 3, best_assists_in_match: 1, complete_player: 1 };

test('la vitrina enseña solo el logro más alto de cada tipo', () => {
  const codes = pickShowcaseAchievements(progress).map((a) => a.code);
  assert.ok(codes.includes('GOALS_25'));
  assert.ok(!codes.includes('GOALS_10') && !codes.includes('FIRST_GOAL'));
  assert.ok(codes.includes('MATCHES_10') && !codes.includes('MATCHES_5'));
  assert.ok(codes.includes('HAT_TRICK') && !codes.includes('DOUBLE'));
  assert.ok(codes.includes('MVP_5'));
  assert.ok(!codes.includes('ASSISTS_10'));
  assert.equal(new Set(codes).size, codes.length);
});

test('si el jugador oculta una estadística, sus logros tampoco salen', () => {
  const codes = pickShowcaseAchievements(progress, ['matches_played', 'mvp_count']).map((a) => a.code);
  assert.deepEqual(codes.sort(), ['MATCHES_10', 'MVP_5']);
  // "Jugador completo" delata goles y asistencias: hacen falta las dos.
  assert.ok(!pickShowcaseAchievements(progress, ['goals']).some((a) => a.code === 'COMPLETE_PLAYER'));
  assert.ok(pickShowcaseAchievements(progress, ['goals', 'assists']).some((a) => a.code === 'COMPLETE_PLAYER'));
  assert.deepEqual(pickShowcaseAchievements(progress, []), []);
});
