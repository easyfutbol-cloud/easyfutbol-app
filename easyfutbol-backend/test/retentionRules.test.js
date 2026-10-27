import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIdleBalanceMessage,
  buildReactivationMessage,
  buildRepeatSuffix,
  buildSlotAlertMessage,
  daysSince,
  favoriteSlot,
  formatMatchWhen,
  isSameSlot,
  isSendingHour,
  madridSlot,
  reactivationStage,
} from '../src/services/retentionRules.js';

// 2026-10-29 es jueves. En octubre-noviembre Madrid está en UTC+1 desde el 25/10.
const THURSDAY_21 = '2026-10-29T20:00:00Z';

test('madridSlot da el día (0 = lunes) y el minuto en hora de Madrid', () => {
  assert.deepEqual(madridSlot(THURSDAY_21), { weekday: 3, minutes: 21 * 60 });
  // Domingo 23:30 UTC ya es lunes 00:30 en Madrid.
  assert.deepEqual(madridSlot('2026-11-01T23:30:00Z'), { weekday: 0, minutes: 30 });
});

test('isSameSlot acepta el mismo día con menos de una hora de diferencia', () => {
  assert.equal(isSameSlot(THURSDAY_21, '2026-11-05T20:30:00Z'), true); // jueves 21:30
  assert.equal(isSameSlot(THURSDAY_21, '2026-11-05T21:30:00Z'), false); // jueves 22:30
  assert.equal(isSameSlot(THURSDAY_21, '2026-11-06T20:00:00Z'), false); // viernes
  // Cambio de hora: 21:00 en verano (UTC+2) y en invierno (UTC+1) es el mismo hueco.
  assert.equal(isSameSlot('2026-10-22T19:00:00Z', THURSDAY_21), true);
});

test('favoriteSlot elige el hueco más repetido y desempata por el más reciente', () => {
  const tuesday = '2026-10-20T19:00:00Z';
  assert.equal(favoriteSlot([THURSDAY_21, tuesday, '2026-10-22T19:00:00Z']), THURSDAY_21);
  assert.equal(favoriteSlot([tuesday, THURSDAY_21]), THURSDAY_21);
  assert.equal(favoriteSlot([]), null);
});

test('reactivationStage solo dispara dentro de la ventana de cada etapa', () => {
  assert.equal(reactivationStage(13), null);
  assert.equal(reactivationStage(14), 14);
  assert.equal(reactivationStage(16), 14);
  assert.equal(reactivationStage(17), null);
  assert.equal(reactivationStage(21), 21);
  assert.equal(reactivationStage(32), 30);
  assert.equal(reactivationStage(60), null);
  assert.equal(reactivationStage(null), null);
  assert.equal(daysSince('2026-10-01T10:00:00Z', '2026-10-15T09:00:00Z'), 13);
});

test('isSendingHour respeta el horario de 10:00 a 22:00 en Madrid', () => {
  assert.equal(isSendingHour(new Date('2026-10-29T08:59:00Z')), false); // 09:59
  assert.equal(isSendingHour(new Date('2026-10-29T09:00:00Z')), true); // 10:00
  assert.equal(isSendingHour(new Date('2026-10-29T20:59:00Z')), true); // 21:59
  assert.equal(isSendingHour(new Date('2026-10-29T21:00:00Z')), false); // 22:00
});

test('formatMatchWhen dice hoy, mañana o el día de la semana', () => {
  const now = new Date('2026-10-29T10:00:00Z');
  assert.equal(formatMatchWhen(THURSDAY_21, now), 'hoy a las 21:00');
  assert.equal(formatMatchWhen('2026-10-30T19:30:00Z', now), 'mañana a las 20:30');
  assert.equal(formatMatchWhen('2026-11-05T20:00:00Z', now), 'el jueves a las 21:00');
});

test('los textos incluyen plazas, campo y saldo cuando los hay', () => {
  const now = new Date('2026-10-29T10:00:00Z');
  const match = { starts_at: '2026-11-05T20:00:00Z', field_name: 'Ribera de Castilla', spots_left: 5 };
  assert.equal(buildRepeatSuffix(match, now), '¿Repites el jueves? Quedan 5 plazas.');
  assert.equal(buildRepeatSuffix({ ...match, starts_at: '2026-10-30T20:00:00Z', spots_left: 1 }, now), '¿Repites mañana? Queda 1 plaza.');
  assert.equal(
    buildSlotAlertMessage(match, now).body,
    'Hay partido el jueves a las 21:00 en Ribera de Castilla, tu hueco de siempre. Quedan 5 plazas.'
  );
  assert.equal(
    buildReactivationMessage(21, match, { balance: 2, now }).body,
    'Tu equipo te echa de menos. Hay partido el jueves a las 21:00 en Ribera de Castilla. Quedan 5 plazas. Tienes 2 EasyPass esperando.'
  );
  assert.equal(buildReactivationMessage(30, { ...match, field_name: null, spots_left: 0 }, { now }).body,
    'Hace un mes que no te vemos por aquí. Hay partido el jueves a las 21:00.');
  assert.equal(buildIdleBalanceMessage(1, null).title, 'Tienes 1 EasyPass sin usar');
  assert.match(buildIdleBalanceMessage(3, match, now).body, /El próximo partido es el jueves a las 21:00 en Ribera de Castilla\.$/);
});
