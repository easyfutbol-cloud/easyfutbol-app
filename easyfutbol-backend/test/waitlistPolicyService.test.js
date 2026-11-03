import test from 'node:test';
import assert from 'node:assert/strict';

import {
  chooseWaitlistTicketColor,
  getWaitlistOffersToCreate,
  isPastWaitlistCutoff,
  splitEasyPassCharge,
  WAITLIST_OFFER_MINUTES,
} from '../src/services/waitlistPolicyService.js';

test('crea una oferta por cada plaza libre sin oferta activa', () => {
  assert.equal(getWaitlistOffersToCreate({ capacity: 16, spotsTaken: 14, activeOffers: 0 }), 2);
});

test('tiene en cuenta las ofertas activas', () => {
  assert.equal(getWaitlistOffersToCreate({ capacity: 16, spotsTaken: 14, activeOffers: 1 }), 1);
});

test('no crea ofertas si el partido está lleno', () => {
  assert.equal(getWaitlistOffersToCreate({ capacity: 16, spotsTaken: 16, activeOffers: 2 }), 0);
  assert.equal(getWaitlistOffersToCreate({ capacity: 16, spotsTaken: 18, activeOffers: 0 }), 0);
});

test('la oferta antigua dura 30 minutos', () => {
  assert.equal(WAITLIST_OFFER_MINUTES, 30);
});

test('la entrada automática se corta 2 horas antes del partido', () => {
  const now = new Date('2026-11-10T18:00:00Z');
  assert.equal(isPastWaitlistCutoff('2026-11-10T20:30:00Z', now), false);
  assert.equal(isPastWaitlistCutoff('2026-11-10T20:00:00Z', now), true);
  assert.equal(isPastWaitlistCutoff('2026-11-10T17:00:00Z', now), true);
  assert.equal(isPastWaitlistCutoff('fecha-rota', now), true);
});

test('respeta la camiseta preferida si queda hueco', () => {
  assert.equal(chooseWaitlistTicketColor({ preferred: 'black', whiteRemaining: 3, blackRemaining: 1 }), 'black');
});

test('asigna la otra camiseta si la preferida está llena', () => {
  assert.equal(chooseWaitlistTicketColor({ preferred: 'black', whiteRemaining: 1, blackRemaining: 0 }), 'white');
  assert.equal(chooseWaitlistTicketColor({ preferred: 'white', whiteRemaining: 0, blackRemaining: 2 }), 'black');
});

test('sin preferencia va a la camiseta con más hueco y null si no hay ninguno', () => {
  assert.equal(chooseWaitlistTicketColor({ preferred: null, whiteRemaining: 1, blackRemaining: 2 }), 'black');
  assert.equal(chooseWaitlistTicketColor({ preferred: 'white', whiteRemaining: 0, blackRemaining: 0 }), null);
});

test('retiene primero de la sede y luego del saldo universal', () => {
  assert.deepEqual(
    splitEasyPassCharge({ locationBalance: 1, globalBalance: 3, locatedBalance: 1, amount: 2 }),
    { available: 3, enough: true, fromLocation: 1 }
  );
});

test('no retiene si no llega el saldo y no cuenta saldo de otra sede', () => {
  const split = splitEasyPassCharge({ locationBalance: 0, globalBalance: 4, locatedBalance: 4, amount: 1 });
  assert.equal(split.enough, false);
  assert.equal(split.available, 0);
});
