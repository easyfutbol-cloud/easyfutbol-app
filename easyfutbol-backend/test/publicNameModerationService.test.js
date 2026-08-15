import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePublicName } from '../src/services/publicNameModerationService.js';

test('acepta nombres normales, incluidos acentos y espacios', () => {
  assert.deepEqual(validatePublicName('  María del Mar  '), { ok: true, name: 'María del Mar' });
  assert.equal(validatePublicName('Computador10').ok, true);
  assert.equal(validatePublicName('Ignacio').ok, true);
});

test('rechaza insultos y expresiones ofensivas directas', () => {
  assert.equal(validatePublicName('PUTO').code, 'OFFENSIVE_PUBLIC_NAME');
  assert.equal(validatePublicName('hijodeputa').code, 'OFFENSIVE_PUBLIC_NAME');
  assert.equal(validatePublicName('COÑO').code, 'OFFENSIVE_PUBLIC_NAME');
});

test('normaliza acentos, separadores y sustituciones por números', () => {
  assert.equal(validatePublicName('c-a-b-r-0-n').code, 'OFFENSIVE_PUBLIC_NAME');
  assert.equal(validatePublicName('g1l1p0ll4s').code, 'OFFENSIVE_PUBLIC_NAME');
  assert.equal(validatePublicName('h.i.j.o.d.e.p.u.t.a').code, 'OFFENSIVE_PUBLIC_NAME');
});

test('bloquea contenido sexual y ofensivo en varios idiomas', () => {
  assert.equal(validatePublicName('tight pussy').code, 'OFFENSIVE_PUBLIC_NAME');
  assert.equal(validatePublicName('tightpussy69').code, 'OFFENSIVE_PUBLIC_NAME');
  assert.equal(validatePublicName('pussу').code, 'OFFENSIVE_PUBLIC_NAME');
  assert.equal(validatePublicName('puttana').code, 'OFFENSIVE_PUBLIC_NAME');
  assert.equal(validatePublicName('caralho').code, 'OFFENSIVE_PUBLIC_NAME');
  assert.equal(validatePublicName('arschloch').code, 'OFFENSIVE_PUBLIC_NAME');
});

test('limita la longitud de los nombres públicos', () => {
  assert.equal(validatePublicName('a').code, 'INVALID_PUBLIC_NAME');
  assert.equal(validatePublicName('a'.repeat(41)).code, 'INVALID_PUBLIC_NAME');
});
