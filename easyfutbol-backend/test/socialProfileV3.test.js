import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROFILE_SECTIONS, cardTier, computePlayerCard, lastMonthKeys, normalizeProfileCustomization, parseProfileSections,
} from '../src/services/playerCardService.js';
import { FRIEND_QR_TTL_MS, createFriendQrToken, verifyFriendQrToken } from '../src/services/friendQrService.js';
import { containsOffensiveText } from '../src/services/publicNameModerationService.js';

test('secciones: null da el orden por defecto, sin carta ni evolución', () => {
  assert.deepEqual(parseProfileSections(null), DEFAULT_PROFILE_SECTIONS);
  assert.ok(!DEFAULT_PROFILE_SECTIONS.includes('card') && !DEFAULT_PROFILE_SECTIONS.includes('evolution'));
  assert.deepEqual(parseProfileSections(''), []);
  assert.deepEqual(parseProfileSections('card,photos,card,hack,form'), ['card', 'photos', 'form']);
});

test('personalización: valida y solo toca los campos enviados', () => {
  assert.deepEqual(normalizeProfileCustomization({ shirt_number: '10' }), { ok: true, values: { shirt_number: 10 } });
  assert.equal(normalizeProfileCustomization({ shirt_number: 0 }).ok, false);
  assert.equal(normalizeProfileCustomization({ shirt_number: 100 }).ok, false);
  assert.deepEqual(normalizeProfileCustomization({ nickname: '  El   Mago ' }).values, { nickname: 'El Mago' });
  assert.deepEqual(normalizeProfileCustomization({ nickname: '', bio: '  ' }).values, { nickname: null, bio: null });
  assert.equal(normalizeProfileCustomization({ nickname: 'hijodeputa' }).ok, false);
  assert.equal(normalizeProfileCustomization({ bio: 'x'.repeat(161) }).ok, false);
  assert.equal(normalizeProfileCustomization({ profile_accent: 'neon' }).ok, false);
  assert.deepEqual(normalizeProfileCustomization({ profile_sections: ['card', 'x', 'comments'] }).values, { profile_sections: 'card,comments' });
  assert.equal(normalizeProfileCustomization({ profile_sections: 'card' }).ok, false);
});

test('la bio no confunde palabras de frases distintas con insultos', () => {
  assert.equal(containsOffensiveText('Del Sporting de toda la vida. A por todas'), false);
  assert.equal(containsOffensiveText('Juego de mediocentro, me gusta tocarla'), false);
  assert.equal(containsOffensiveText('soy un hijo de puta'), true);
  assert.equal(containsOffensiveText('h.i.j.o.d.e.p.u.t.a jaja'), true);
});

test('carta: sin partidos es provisional y todo a 45', () => {
  const card = computePlayerCard({ matches_played: 0 }, null);
  assert.equal(card.provisional, true);
  assert.equal(card.overall, 45);
  assert.ok(card.attributes.every((a) => a.value === 45));
});

test('carta: atributos en 45-99 y la media depende de la posición', () => {
  const stats = { matches_played: 20, goals: 30, assists: 4, saves: 0, mvp_count: 6, win_rate: 60 };
  const forward = computePlayerCard(stats, 'forward');
  const keeper = computePlayerCard(stats, 'goalkeeper');
  assert.equal(forward.provisional, false);
  assert.ok(forward.attributes.every((a) => a.value >= 45 && a.value <= 99));
  assert.ok(forward.overall > keeper.overall, 'un goleador sin paradas es mejor delantero que portero');
  const capped = computePlayerCard({ matches_played: 500, goals: 5000, assists: 5000, saves: 5000, mvp_count: 500, win_rate: 100 }, 'midfielder');
  assert.equal(capped.overall, 99);
  assert.equal(capped.tier, 'elite');
});

test('carta: niveles', () => {
  assert.equal(cardTier(59), 'bronze');
  assert.equal(cardTier(60), 'silver');
  assert.equal(cardTier(72), 'gold');
  assert.equal(cardTier(84), 'elite');
});

test('evolución: últimos meses en orden, cruzando el año', () => {
  assert.deepEqual(lastMonthKeys(3, new Date('2027-01-15T12:00:00Z')), ['2026-11', '2026-12', '2027-01']);
});

test('QR: el token vale para su dueño y caduca a los 15 minutos', () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
  const now = Date.parse('2026-11-01T10:00:00Z');
  const { token } = createFriendQrToken(42, now);
  assert.equal(verifyFriendQrToken(42, token, now + 60_000), 'ok');
  assert.equal(verifyFriendQrToken(43, token, now), 'invalid');
  assert.equal(verifyFriendQrToken(42, token, now + FRIEND_QR_TTL_MS + 1), 'expired');
  const [exp, sig] = token.split('.');
  const later = (parseInt(exp, 36) + 3_600_000).toString(36);
  assert.equal(verifyFriendQrToken(42, `${later}.${sig}`, now), 'invalid', 'no se puede alargar la caducidad');
  assert.equal(verifyFriendQrToken(42, 'basura', now), 'invalid');
});
