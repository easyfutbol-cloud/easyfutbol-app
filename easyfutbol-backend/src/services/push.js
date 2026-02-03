// src/services/push.js
// Envío a la API HTTP de Expo sin SDK
import { pool } from '../config/db.js';

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

// Pequeña utilidad para trocear arrays (límite recomendado por Expo ~100)
function chunk(arr, size = 99) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Valida formato ExponentPushToken[xxxxx]
function isExpoPushToken(token) {
  return typeof token === 'string' && /^ExponentPushToken\[[A-Za-z0-9\-_=:.]+\]$/.test(token);
}

/** Envía un lote de notificaciones a tokens Expo */
export async function sendExpoPush(tokens, title, body, data = {}) {
  const valid = tokens.filter(isExpoPushToken);
  if (!valid.length) return { sent: 0 };

  const messages = valid.map(t => ({
    to: t,
    sound: 'default',
    title,
    body,
    data
  }));

  let sent = 0;
  for (const batch of chunk(messages)) {
    const res = await fetch(EXPO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch)
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('Expo push error:', txt);
      continue;
    }
    sent += batch.length;
  }
  return { sent };
}

/** Tokens de los inscritos confirmados en un partido */
export async function getMatchPushTokens(matchId) {
  const [rows] = await pool.query(
    `SELECT u.push_token
     FROM inscriptions i
     JOIN users u ON u.id = i.user_id
     WHERE i.match_id=? AND i.status='confirmed' AND u.push_token IS NOT NULL`,
    [matchId]
  );
  return rows.map(r => r.push_token).filter(Boolean);
}

/** Token de un usuario */
export async function getUserPushToken(userId) {
  const [[row]] = await pool.query(
    `SELECT push_token FROM users WHERE id=? AND push_token IS NOT NULL LIMIT 1`,
    [userId]
  );
  return row?.push_token || null;
}
