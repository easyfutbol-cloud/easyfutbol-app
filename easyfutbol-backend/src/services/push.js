// src/services/push.js
// Envío a la API HTTP de Expo sin SDK
import { pool } from '../config/db.js';
import { sendPushNotification } from './pushService.js';

// Valida formato ExponentPushToken[xxxxx]
function isExpoPushToken(token) {
  return typeof token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9\-_=:.]+\]$/.test(token);
}

const uniqueTokens = (rows = []) => [...new Set(rows.map((row) => row.push_token).filter(Boolean))];

async function hasAssignedUserIdColumn() {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'inscriptions'
       AND COLUMN_NAME = 'assigned_user_id'`
  );
  return Number(row?.count || 0) > 0;
}

/** Envía un lote de notificaciones a tokens Expo */
export async function sendExpoPush(tokens, title, body, data = {}) {
  const valid = tokens.filter(isExpoPushToken);
  if (!valid.length) return { sent: 0 };
  const tickets=await sendPushNotification(valid,{title,body,data});
  return { sent:tickets.filter(ticket=>ticket?.status==='ok').length,failed:tickets.filter(ticket=>ticket?.status==='error').length };
}

/** Tokens de los inscritos confirmados en un partido */
export async function getMatchPushTokens(matchId) {
  const hasAssignedUser = await hasAssignedUserIdColumn();
  const [rows] = await pool.query(
    `SELECT DISTINCT token_data.push_token
     FROM inscriptions i
     JOIN (
       SELECT id AS user_id,
              CONVERT(push_token USING utf8mb4) COLLATE utf8mb4_unicode_ci AS push_token
       FROM users
       WHERE push_token IS NOT NULL AND push_token <> ''
       UNION
       SELECT user_id,
              CONVERT(expo_push_token USING utf8mb4) COLLATE utf8mb4_unicode_ci AS push_token
       FROM push_tokens
       WHERE is_active = 1 AND expo_push_token IS NOT NULL AND expo_push_token <> ''
     ) token_data ON token_data.user_id = ${hasAssignedUser ? 'COALESCE(i.assigned_user_id, i.user_id)' : 'i.user_id'}
     WHERE i.match_id=? AND i.status IN ('confirmed', 'paid', 'active')`,
    [matchId]
  );
  return uniqueTokens(rows);
}

/** Tokens de jugadores cuya sede preferida coincide con la ciudad/sede indicada. */
export async function getCityPushTokens(locationSlug) {
  const [rows] = await pool.query(
    `SELECT DISTINCT token_data.push_token
     FROM users u
     JOIN (
       SELECT id AS user_id,
              CONVERT(push_token USING utf8mb4) COLLATE utf8mb4_unicode_ci AS push_token
       FROM users
       WHERE push_token IS NOT NULL AND push_token <> ''
       UNION
       SELECT user_id,
              CONVERT(expo_push_token USING utf8mb4) COLLATE utf8mb4_unicode_ci AS push_token
       FROM push_tokens
       WHERE is_active = 1 AND expo_push_token IS NOT NULL AND expo_push_token <> ''
     ) token_data ON token_data.user_id = u.id
     WHERE LOWER(TRIM(u.preferred_location)) = LOWER(TRIM(?))`,
    [locationSlug]
  );
  return uniqueTokens(rows);
}

/** Token de un usuario */
export async function getUserPushToken(userId) {
  const [[row]] = await pool.query(
    `SELECT push_token FROM users WHERE id=? AND push_token IS NOT NULL LIMIT 1`,
    [userId]
  );
  return row?.push_token || null;
}
