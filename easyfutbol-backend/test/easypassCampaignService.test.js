import test from 'node:test';
import assert from 'node:assert/strict';
import { getValladolidPackCampaign } from '../src/services/easypassCampaignService.js';

const env = {
  EASYPASS_PROMOTION_START_DATE: '2026-09-04',
  EASYPASS_PROMOTION_PERCENT: '10',
};

test('activa el código promocional para Valladolid desde el 4 de septiembre en hora de Madrid', () => {
  const campaign = getValladolidPackCampaign(
    { locationSlug: 'valladolid' },
    new Date('2026-09-03T22:00:00.000Z'),
    env
  );

  assert.equal(campaign.active, true);
  assert.equal(campaign.percent, 10);
});

test('no activa el descuento antes de la fecha de inicio', () => {
  const campaign = getValladolidPackCampaign(
    { locationSlug: 'valladolid' },
    new Date('2026-09-03T21:59:59.000Z'),
    env
  );

  assert.equal(campaign.active, false);
});

test('no activa el código promocional en Asturias', () => {
  const campaign = getValladolidPackCampaign(
    { locationSlug: 'asturias' },
    new Date('2026-09-04T10:00:00.000Z'),
    env
  );

  assert.equal(campaign.active, false);
});

test('la disponibilidad depende de la sede y la fecha, no del ID del cupón', () => {
  const campaign = getValladolidPackCampaign(
    { locationSlug: 'valladolid' },
    new Date('2026-09-04T10:00:00.000Z'),
    env
  );

  assert.equal(campaign.active, true);
});
