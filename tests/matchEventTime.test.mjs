import test from 'node:test';
import assert from 'node:assert/strict';
import { eventTimeLabel, formatClockTime, minuteSinceStart, withClockTime } from '../src/utils/matchEventTime.js';

test('formatClockTime da la hora con dos dígitos y null si no hay fecha', () => {
  assert.equal(formatClockTime(new Date(2026, 10, 2, 9, 5, 30)), '09:05');
  assert.equal(formatClockTime(null), null);
  assert.equal(formatClockTime('fecha rota'), null);
});

test('eventTimeLabel junta hora y minuto y respeta el minuto manual de los eventos antiguos', () => {
  assert.equal(eventTimeLabel({ occurred_at: new Date(2026, 10, 2, 21, 37).toISOString(), minute: 12 }), "21:37 · 12'");
  assert.equal(eventTimeLabel({ occurred_at: null, minute: 12 }), "12'");
});

test('minuteSinceStart calcula el minuto dentro del rango y sin inicio devuelve null', () => {
  const start = '2026-11-02T20:00:00Z';
  assert.equal(minuteSinceStart('2026-11-02T20:37:59Z', start), 37);
  assert.equal(minuteSinceStart('2026-11-02T19:50:00Z', start), 0);
  assert.equal(minuteSinceStart('2026-11-03T20:00:00Z', start), 200);
  assert.equal(minuteSinceStart('2026-11-02T20:37:59Z', null), null);
});

test('withClockTime cambia la hora y conserva el día', () => {
  const result = withClockTime(new Date(2026, 10, 2, 21, 37, 45), '21:40');
  assert.equal(result.getDate(), 2);
  assert.equal(result.getHours(), 21);
  assert.equal(result.getMinutes(), 40);
  assert.equal(result.getSeconds(), 0);
});

test('withClockTime rechaza horas mal escritas', () => {
  const base = new Date(2026, 10, 2, 21, 37);
  for (const text of ['', '2137', '24:00', '21:60', 'abc']) {
    assert.equal(withClockTime(base, text), null);
  }
});
