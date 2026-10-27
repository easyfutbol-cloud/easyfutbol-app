import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHALLENGES,
  computeStreak,
  equippedCosmetics,
  evaluateChallenge,
  monthKey,
  periodEndsOn,
  reachedStreakMilestones,
  shiftWeek,
  weekKey,
} from '../src/services/engagementRules.js';

const challenge = (code) => CHALLENGES.find((c) => c.code === code);

test('weekKey usa el lunes de la semana en hora de Madrid', () => {
  assert.equal(weekKey('2026-10-28T19:00:00Z'), '2026-10-26'); // miércoles
  assert.equal(weekKey('2026-11-01T22:30:00Z'), '2026-10-26'); // domingo 23:30 en Madrid
  // Domingo 23:30 UTC ya es lunes 00:30 en Madrid (horario de invierno).
  assert.equal(weekKey('2026-11-01T23:30:00Z'), '2026-11-02');
  assert.equal(monthKey('2026-10-31T23:30:00Z'), '2026-11');
  assert.equal(shiftWeek('2026-01-05', -1), '2025-12-29');
});

test('periodEndsOn da el domingo o el último día del mes', () => {
  assert.equal(periodEndsOn('week', '2026-10-26'), '2026-11-01');
  assert.equal(periodEndsOn('month', '2026-02'), '2026-02-28');
});

test('la racha no se rompe hasta que acaba la semana sin jugar', () => {
  const played = ['2026-10-05', '2026-10-12', '2026-10-19'];
  const pending = computeStreak(played, '2026-10-26');
  assert.equal(pending.current, 3);
  assert.equal(pending.at_risk, true);
  assert.equal(pending.started_week, '2026-10-05');

  const kept = computeStreak([...played, '2026-10-26'], '2026-10-26');
  assert.equal(kept.current, 4);
  assert.equal(kept.at_risk, false);
  assert.equal(kept.next_milestone, 8);

  const broken = computeStreak(played, '2026-11-02');
  assert.equal(broken.current, 0);
  assert.equal(broken.best, 3);
});

test('los hitos de racha dependen de cuándo empezó la racha', () => {
  const weeks = Array.from({ length: 8 }, (_, i) => shiftWeek('2026-09-07', i));
  const streak = computeStreak(weeks, weeks[7]);
  const milestones = reachedStreakMilestones(streak);
  assert.deepEqual(milestones.map((m) => [m.weeks, m.reward]), [[4, 50], [8, 100]]);
  assert.equal(milestones[0].source_key, 'streak:2026-09-07:4');
});

test('los retos miran solo los partidos del periodo', () => {
  const matches = [
    { starts_at: '2026-10-27T19:00:00Z', assists: 1, saves: 3, is_mvp: 0 },
    { starts_at: '2026-10-29T19:00:00Z', assists: 2, saves: 0, is_mvp: 1 },
    { starts_at: '2026-10-20T19:00:00Z', assists: 4, saves: 0, is_mvp: 1 },
  ];
  const assists = evaluateChallenge(challenge('ASSISTS_2_MATCH'), matches, '2026-10-26');
  assert.deepEqual([assists.progress, assists.completed], [2, true]);
  assert.equal(assists.source_key, 'challenge:ASSISTS_2_MATCH:2026-10-26');
  // 1 + 2 asistencias repartidas no cuentan como "2 en un solo partido".
  const split = evaluateChallenge(challenge('ASSISTS_2_MATCH'), [matches[0], { ...matches[0], starts_at: '2026-10-28T19:00:00Z' }], '2026-10-26');
  assert.equal(split.completed, false);
  assert.equal(evaluateChallenge(challenge('SAVES_2_MATCH'), matches, '2026-10-26').completed, true);
  assert.equal(evaluateChallenge(challenge('MVP_1'), matches, '2026-10-26').progress, 1);
  const play = evaluateChallenge(challenge('PLAY_3'), matches, '2026-10');
  assert.deepEqual([play.progress, play.completed], [3, true]);
});

test('equippedCosmetics ignora códigos desconocidos o del tipo equivocado', () => {
  assert.deepEqual(equippedCosmetics('FRAME_FUEGO', 'TITLE_MURO'), {
    frame: { code: 'FRAME_FUEGO', name: 'Fuego', colors: ['#ff8a00', '#ff2d55'] },
    title: { code: 'TITLE_MURO', label: 'El Muro' },
  });
  assert.deepEqual(equippedCosmetics('TITLE_MURO', 'NOPE'), { frame: null, title: null });
});
