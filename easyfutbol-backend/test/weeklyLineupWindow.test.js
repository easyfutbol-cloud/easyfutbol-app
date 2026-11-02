import test from 'node:test';
import assert from 'node:assert/strict';
import { computeVotingWindow } from '../src/services/weeklyLineupService.js';

test('the week of 26/10 is voted from Monday 2/11 to Wednesday 4/11 at 19:00 Madrid', () => {
  const { opensAt, closesAt } = computeVotingWindow('2026-10-26');
  assert.equal(opensAt.toISOString(), '2026-11-02T18:00:00.000Z');
  assert.equal(closesAt.toISOString(), '2026-11-04T18:00:00.000Z');
});

test('uses summer time when the voting window falls in it', () => {
  const { closesAt } = computeVotingWindow('2026-06-01');
  assert.equal(closesAt.toISOString(), '2026-06-10T17:00:00.000Z');
});

test('crosses a clock change using the Madrid time of the closing day', () => {
  const { opensAt, closesAt } = computeVotingWindow('2026-10-19');
  assert.equal(opensAt.toISOString(), '2026-10-26T18:00:00.000Z');
  assert.equal(closesAt.toISOString(), '2026-10-28T18:00:00.000Z');
});
