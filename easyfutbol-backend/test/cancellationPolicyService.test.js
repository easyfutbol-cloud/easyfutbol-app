import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getCancellationPolicy,
  hasMatchStarted,
} from '../src/services/cancellationPolicyService.js';

const NOW = new Date('2026-08-04T10:00:00.000Z');

test('un jugador estándar recibe devolución con más de 8 horas', () => {
  const result = getCancellationPolicy('2026-08-04T18:00:01.000Z', false, NOW);
  assert.equal(result.refundable, true);
  assert.equal(result.earnsSubscriberWarning, false);
});

test('el límite exacto de 8 horas no genera devolución', () => {
  assert.equal(
    getCancellationPolicy('2026-08-04T18:00:00.000Z', false, NOW).refundable,
    false
  );
});

test('Plus y Pro tienen devolución con más de 4 horas', () => {
  const result = getCancellationPolicy('2026-08-04T14:00:01.000Z', true, NOW);
  assert.equal(result.refundable, true);
  assert.equal(result.freeCancellationHours, 4);
  assert.equal(result.earnsSubscriberWarning, false);
});

test('una cancelación tardía de suscriptor genera aviso y no devolución', () => {
  const result = getCancellationPolicy('2026-08-04T13:00:00.000Z', true, NOW);
  assert.equal(result.refundable, false);
  assert.equal(result.earnsSubscriberWarning, true);
});

test('rechaza como iniciado un partido pasado o con fecha inválida', () => {
  assert.equal(hasMatchStarted('2026-08-04T09:59:59.000Z', NOW), true);
  assert.equal(hasMatchStarted('fecha-invalida', NOW), true);
});

