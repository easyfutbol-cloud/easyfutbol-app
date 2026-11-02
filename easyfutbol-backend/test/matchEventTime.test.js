import test from 'node:test';
import assert from 'node:assert/strict';
import { capOccurredAt, minuteFromOccurredAt, parseOccurredAt } from '../src/utils/matchEventTime.js';

const START = new Date('2026-11-02T20:00:00Z');

test('parseOccurredAt acepta ISO con segundos o milisegundos y rechaza lo demás', () => {
  assert.equal(parseOccurredAt('2026-11-02T20:37:12Z').toISOString(), '2026-11-02T20:37:12.000Z');
  assert.equal(parseOccurredAt('2026-11-02T20:37:12.500Z').toISOString(), '2026-11-02T20:37:12.500Z');
  assert.equal(parseOccurredAt('no es una fecha'), null);
  assert.equal(parseOccurredAt(''), null);
  assert.equal(parseOccurredAt(undefined), null);
  assert.equal(parseOccurredAt(1234), null);
});

test('capOccurredAt no deja eventos en el futuro y respeta los pasados', () => {
  const now = new Date('2026-11-02T21:00:00Z');
  assert.equal(capOccurredAt(new Date('2026-11-02T21:05:00Z'), now).toISOString(), now.toISOString());
  assert.equal(capOccurredAt(new Date('2026-11-02T20:30:00Z'), now).toISOString(), '2026-11-02T20:30:00.000Z');
});

test('minuteFromOccurredAt calcula el minuto desde el inicio del partido', () => {
  assert.equal(minuteFromOccurredAt(new Date('2026-11-02T20:37:59Z'), START), 37);
  assert.equal(minuteFromOccurredAt(new Date('2026-11-02T20:00:00Z'), START), 0);
});

test('minuteFromOccurredAt se mantiene dentro del rango de la tabla', () => {
  assert.equal(minuteFromOccurredAt(new Date('2026-11-02T19:50:00Z'), START), 0);
  assert.equal(minuteFromOccurredAt(new Date('2026-11-03T20:00:00Z'), START), 200);
  assert.equal(minuteFromOccurredAt(new Date('2026-11-02T20:10:00Z'), 'fecha rota'), 0);
});
