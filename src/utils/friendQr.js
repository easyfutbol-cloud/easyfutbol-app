// QR de "añadir amigo": es el enlace público del perfil (…/jugador/<slug>)
// con ?qr=<token>. Sin token (un enlace de perfil normal) solo abre el perfil.
import { api } from '../api/client';

const SLUG = /\/jugador\/([A-Za-z0-9]{6,16})(?:[/?#]|$)/;
const TOKEN = /[?&]qr=([0-9a-z]{1,12}\.[A-Za-z0-9_-]{22})(?:&|#|$)/;

/** { slug, token } o null si el texto no es un enlace de perfil de EasyFutbol. */
export function parseFriendQr(data) {
  const text = String(data || '').trim();
  if (!/^(https?:\/\/[^/]*easyfutbol|easyfutbol:\/\/)/i.test(text) && !/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.)/.test(text)) return null;
  const slug = SLUG.exec(text.replace(/^easyfutbol:\/\//i, 'easyfutbol:///'))?.[1];
  if (!slug) return null;
  return { slug, token: TOKEN.exec(text)?.[1] || null };
}

/** Añade al dueño del QR como amigo. Devuelve { user_id, name, already }. */
export async function connectByFriendQr(slug, token) {
  const res = await api.post('/social/qr/connect', { slug, token });
  return res.data;
}
