import test from 'node:test';
import assert from 'node:assert/strict';
import { getAsturiasPackCampaign } from '../src/services/easypassCampaignService.js';

const env = {
  ASTURIAS_DISCOUNT_START_DATE: '2026-08-23',
  ASTURIAS_DISCOUNT_PERCENT: '10',
};

test('activa el descuento para Asturias desde el 23 de agosto en hora de Madrid', () => {
  const campaign = getAsturiasPackCampaign(
    { locationSlug: 'asturias' },
    new Date('2026-08-22T22:00:00.000Z'),
    env
  );

  assert.equal(campaign.active, true);
  assert.equal(campaign.percent, 10);
});

test('no activa el descuento antes de la fecha de inicio', () => {
  const campaign = getAsturiasPackCampaign(
    { locationSlug: 'asturias' },
    new Date('2026-08-22T21:59:59.000Z'),
    env
  );

  assert.equal(campaign.active, false);
});

test('no activa el descuento en otras sedes', () => {
  const campaign = getAsturiasPackCampaign(
    { locationSlug: 'valladolid' },
    new Date('2026-08-23T10:00:00.000Z'),
    env
  );

  assert.equal(campaign.active, false);
});

test('la disponibilidad depende de la sede y la fecha, no del ID del cupón', () => {
  const campaign = getAsturiasPackCampaign(
    { locationSlug: 'asturias' },
    new Date('2026-08-23T10:00:00.000Z'),
    env
  );

  assert.equal(campaign.active, true);
});
