import assert from 'node:assert/strict';
import test from 'node:test';

import { investorReportToCsv, parseMarketingSpend } from '../src/services/kpiService.js';

const NOW = new Date('2026-10-10T12:00:00Z');

test('gasto de marketing: se normaliza la coma decimal, el canal y la sede por defecto', () => {
  const { value, error } = parseMarketingSpend({ month: '2026-08', channel: '  instagram  ', amount_eur: '300,50' }, NOW);
  assert.equal(error, undefined);
  assert.deepEqual(value, { month: '2026-08', channel: 'instagram', location_id: 0, amount_cents: 30050, notes: null });
});

test('gasto de marketing: acepta importe en céntimos y recorta las notas', () => {
  const { value } = parseMarketingSpend({ month: '2026-10', amount_cents: 1234, location_id: 2, notes: ` ${'x'.repeat(400)} ` }, NOW);
  assert.equal(value.amount_cents, 1234);
  assert.equal(value.location_id, 2);
  assert.equal(value.channel, 'general');
  assert.equal(value.notes.length, 255);
});

test('gasto de marketing: rechaza lo que no tiene sentido', () => {
  const rejected = [
    [{ month: '2026-11', amount_eur: 10 }, /futuro/],
    [{ month: '2027-01', amount_eur: 10 }, /futuro/],
    [{ month: '2026-13', amount_eur: 10 }, /Mes/],
    [{ month: 'agosto', amount_eur: 10 }, /Mes/],
    [{ month: '2026-08', amount_eur: 0 }, /Importe/],
    [{ month: '2026-08', amount_eur: -3 }, /Importe/],
    [{ month: '2026-08', amount_eur: 'mucho' }, /Importe/],
    [{ month: '2026-08', amount_eur: 2_000_000 }, /Importe/],
    [{ month: '2026-08' }, /importe/],
    [{ month: '2026-08', amount_eur: 5, location_id: 3 }, /Sede/],
    [null, /Mes/],
  ];
  for (const [body, pattern] of rejected) {
    const { error, value } = parseMarketingSpend(body, NOW);
    assert.equal(value, undefined, JSON.stringify(body));
    assert.match(error, pattern, JSON.stringify(body));
  }
});

test('el mes en curso sí se puede registrar (se mide en hora de Madrid)', () => {
  // 30/9 a las 23:30 UTC ya es 1/10 en Madrid
  assert.ok(parseMarketingSpend({ month: '2026-10', amount_eur: 5 }, new Date('2026-09-30T23:30:00Z')).value);
  assert.ok(parseMarketingSpend({ month: '2026-10', amount_eur: 5 }, new Date('2026-09-30T21:00:00Z')).error);
});

test('CSV para Excel en español: punto y coma, coma decimal y celdas con comillas bien escapadas', () => {
  const csv = investorReportToCsv({
    columns: [{ key: 'month', label: 'Mes' }, { key: 'note', label: 'Nota; con punto y coma' }, { key: 'value', label: 'Valor' }],
    rows: [{ month: '2026-08', note: 'dijo "hola"', value: 4.34 }, { month: '2026-09', note: null, value: undefined }],
  });
  assert.equal(csv, 'Mes;"Nota; con punto y coma";Valor\n2026-08;"dijo ""hola""";4,34\n2026-09;;');
});
