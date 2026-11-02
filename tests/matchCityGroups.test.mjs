import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCityOptions,
  canonicalCity,
  isAsturiasCity,
  pickAsturiasCity,
} from '../src/utils/matchCityGroups.js';

test('shows Valladolid and Asturias with Avilés and Oviedo when there are no matches', () => {
  assert.deepEqual(buildCityOptions([]), {
    regions: ['Valladolid', 'Asturias'],
    asturiasCities: ['Avilés', 'Oviedo'],
  });
});

test('Asturias cities go to the switcher, never to the first level', () => {
  const { regions, asturiasCities } = buildCityOptions([
    { city: 'Aviles' },
    { city: ' Gijón ' },
    { city: 'Luanco', location_slug: 'asturias' },
    { city: 'León', location_slug: 'valladolid' },
  ]);
  assert.deepEqual(regions, ['Valladolid', 'Asturias', 'León']);
  assert.deepEqual(asturiasCities, ['Avilés', 'Gijón', 'Luanco', 'Oviedo']);
});

test('a saved Asturias city stays in the switcher without matches', () => {
  assert.ok(buildCityOptions([], 'Gijón').asturiasCities.includes('Gijón'));
});

test('unifies accent and case variants', () => {
  assert.equal(canonicalCity(' AVILES '), 'Avilés');
  assert.equal(canonicalCity('Valladolid'), 'Valladolid');
  assert.equal(isAsturiasCity('oviedo'), true);
  assert.equal(isAsturiasCity('Valladolid'), false);
});

test('opens the first Asturias city that has matches', () => {
  const cities = ['Avilés', 'Oviedo'];
  assert.equal(pickAsturiasCity(cities, [{ city: 'Oviedo' }]), 'Oviedo');
  assert.equal(pickAsturiasCity(cities, [{ city: 'Aviles' }, { city: 'Oviedo' }]), 'Avilés');
  assert.equal(pickAsturiasCity(cities, [{ city: 'Valladolid' }]), 'Avilés');
});
