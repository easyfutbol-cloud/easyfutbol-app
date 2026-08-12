import test from 'node:test';
import assert from 'node:assert/strict';

import { formatMadridAdminDateTime, madridWallTimeToUtc } from '../src/utils/madridDateTime.js';

test('convierte una hora de verano de Madrid a UTC y la recupera sin desfase', () => {
  const utc = madridWallTimeToUtc('2026-08-12', '19:50');
  assert.equal(utc.toISOString(), '2026-08-12T17:50:00.000Z');
  assert.deepEqual(formatMadridAdminDateTime(utc, 60), {
    match_date: '2026-08-12',
    start_time: '19:50:00',
    end_time: '20:50:00',
  });
});

test('aplica automáticamente el horario de invierno de Madrid', () => {
  const utc = madridWallTimeToUtc('2026-12-12', '19:50');
  assert.equal(utc.toISOString(), '2026-12-12T18:50:00.000Z');
  assert.equal(formatMadridAdminDateTime(utc, 60).start_time, '19:50:00');
});
