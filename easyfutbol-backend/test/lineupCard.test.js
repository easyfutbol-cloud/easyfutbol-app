import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLineupCard, computePlayerCard } from '../src/services/playerCardService.js';

const stats = { matches_played: 12, goals: 9, assists: 4, saves: 0, mvp_count: 2, win_rate: 60 };

test('keeps the same overall and tier as the player profile card', () => {
  const profile = computePlayerCard(stats, 'forward');
  const lineup = computeLineupCard(stats, 'forward', 'defensa');
  assert.equal(lineup.overall, profile.overall);
  assert.equal(lineup.tier, profile.tier);
});

test('shows the position the player won, not their usual one', () => {
  assert.equal(computeLineupCard(stats, 'forward', 'portero').position, 'goalkeeper');
  assert.equal(computeLineupCard(stats, 'forward', 'defensa').position, 'defender');
  assert.equal(computeLineupCard(stats, 'forward', 'centrocampista').position, 'midfielder');
  assert.equal(computeLineupCard(stats, 'defender', 'delantero').position, 'forward');
});

test('never exposes the attributes that reveal goals and assists', () => {
  assert.equal('attributes' in computeLineupCard(stats, 'forward', 'delantero'), false);
});

test('marks players with too few matches as provisional', () => {
  assert.equal(computeLineupCard({ matches_played: 2 }, null, 'portero').provisional, true);
});
