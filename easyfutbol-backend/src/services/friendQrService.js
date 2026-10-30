// QR para añadir amigos en persona. El QR lleva el enlace público del perfil
// más un token firmado que caduca a los 15 minutos: quien lo escanea con la
// app queda como amigo al momento (estar delante y enseñar el QR ya es el
// "sí"), y una foto del QR deja de valer enseguida. Sin tabla: el token se
// comprueba con HMAC, como un JWT de un solo campo.
import crypto from 'crypto';

export const FRIEND_QR_TTL_MS = 15 * 60 * 1000;

const secret = () => process.env.FRIEND_QR_SECRET || process.env.JWT_SECRET || '';

function signature(userId, exp) {
  return crypto.createHmac('sha256', secret()).update(`friend-qr:${userId}:${exp}`).digest('base64url').slice(0, 22);
}

export function createFriendQrToken(userId, now = Date.now()) {
  if (!secret()) throw new Error('Falta JWT_SECRET para firmar el QR');
  const exp = now + FRIEND_QR_TTL_MS;
  return { token: `${exp.toString(36)}.${signature(userId, exp)}`, expires_at: new Date(exp).toISOString() };
}

/** 'ok' | 'expired' | 'invalid' */
export function verifyFriendQrToken(userId, token, now = Date.now()) {
  const match = /^([0-9a-z]{1,12})\.([A-Za-z0-9_-]{22})$/.exec(String(token || ''));
  if (!match || !secret()) return 'invalid';
  const exp = parseInt(match[1], 36);
  const expected = Buffer.from(signature(userId, exp));
  const given = Buffer.from(match[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return 'invalid';
  return exp < now ? 'expired' : 'ok';
}
