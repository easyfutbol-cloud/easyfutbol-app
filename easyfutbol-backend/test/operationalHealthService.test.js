import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getSchedulerHealth,
  markSchedulerFailure,
  markSchedulerSuccess,
  registerScheduler,
} from '../src/services/operationalHealthService.js';

test('un programador recién iniciado se considera en arranque', () => {
  registerScheduler('test-starting', { maxAgeSeconds: 60 });
  const state = getSchedulerHealth().find((item) => item.name === 'test-starting');
  assert.equal(state.status, 'starting');
});

test('registra éxito y error sin exponer objetos completos', () => {
  registerScheduler('test-result', { maxAgeSeconds: 60 });
  markSchedulerSuccess('test-result');
  assert.equal(getSchedulerHealth().find((item) => item.name === 'test-result').status, 'up');

  markSchedulerFailure('test-result', new Error('fallo controlado'));
  const failed = getSchedulerHealth().find((item) => item.name === 'test-result');
  assert.equal(failed.status, 'down');
  assert.equal(failed.lastError, 'fallo controlado');
});

test('marca como detenido un programador que supera su intervalo máximo', () => {
  registerScheduler('test-stale', { maxAgeSeconds: 30 });
  markSchedulerSuccess('test-stale');
  const future = new Date(Date.now() + 31 * 1000);
  const stale = getSchedulerHealth(future).find((item) => item.name === 'test-stale');
  assert.equal(stale.status, 'down');
});
