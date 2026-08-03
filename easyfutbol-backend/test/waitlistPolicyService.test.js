import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getWaitlistOffersToCreate,
  WAITLIST_OFFER_MINUTES,
} from '../src/services/waitlistPolicyService.js';

test('reserva una oferta por cada plaza libre', () => {
  assert.equal(getWaitlistOffersToCreate({ capacity: 16, spotsTaken: 14, activeOffers: 0 }), 2);
});

test('las ofertas activas reservan temporalmente la plaza', () => {
  assert.equal(getWaitlistOffersToCreate({ capacity: 16, spotsTaken: 14, activeOffers: 1 }), 1);
});

test('nunca crea ofertas negativas o por encima de la capacidad', () => {
  assert.equal(getWaitlistOffersToCreate({ capacity: 16, spotsTaken: 16, activeOffers: 2 }), 0);
  assert.equal(getWaitlistOffersToCreate({ capacity: 16, spotsTaken: 18, activeOffers: 0 }), 0);
});

test('la oferta mantiene el plazo acordado de media hora', () => {
  assert.equal(WAITLIST_OFFER_MINUTES, 30);
});

