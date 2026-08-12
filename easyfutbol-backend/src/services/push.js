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

const segmentConditions={
  active_30d:`EXISTS(SELECT 1 FROM inscriptions i JOIN matches m ON m.id=i.match_id WHERE i.user_id=u.id AND i.status IN ('confirmed','paid','active') AND m.starts_at BETWEEN DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) AND UTC_TIMESTAMP())`,
  inactive_60d:`u.created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 60 DAY) AND NOT EXISTS(SELECT 1 FROM inscriptions i JOIN matches m ON m.id=i.match_id WHERE i.user_id=u.id AND i.status IN ('confirmed','paid','active') AND m.starts_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 60 DAY))`,
  plus:`EXISTS(SELECT 1 FROM user_subscriptions us JOIN subscription_plans sp ON sp.id=us.plan_id WHERE us.user_id=u.id AND sp.code='plus' AND us.status IN ('active','trialing') AND (us.current_period_end IS NULL OR us.current_period_end>UTC_TIMESTAMP()))`,
  pro:`EXISTS(SELECT 1 FROM user_subscriptions us JOIN subscription_plans sp ON sp.id=us.plan_id WHERE us.user_id=u.id AND sp.code='pro' AND us.status IN ('active','trialing') AND (us.current_period_end IS NULL OR us.current_period_end>UTC_TIMESTAMP()))`,
  no_upcoming:`NOT EXISTS(SELECT 1 FROM inscriptions i JOIN matches m ON m.id=i.match_id WHERE i.user_id=u.id AND i.status IN ('confirmed','paid','active') AND m.starts_at>UTC_TIMESTAMP() AND m.status<>'cancelled')`,
  new_30d:`u.created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)`,
};
export const notificationSegments=[
  {id:'active_30d',name:'Jugadores activos',description:'Han jugado durante los últimos 30 días'},
  {id:'inactive_60d',name:'Jugadores inactivos',description:'Llevan 60 días sin jugar'},
  {id:'plus',name:'Suscriptores Plus',description:'Plan Plus activo o en prueba'},
  {id:'pro',name:'Suscriptores Pro',description:'Plan Pro activo o en prueba'},
  {id:'no_upcoming',name:'Sin próximo partido',description:'No tienen ninguna inscripción futura'},
  {id:'new_30d',name:'Usuarios nuevos',description:'Registrados durante los últimos 30 días'},
];
export async function getSegmentPushAudience(segmentId){
  const condition=segmentConditions[segmentId];if(!condition)throw new Error('Segmento no válido');
  const[rows]=await pool.query(`SELECT u.id user_id,token_data.push_token FROM users u JOIN (SELECT id user_id,CONVERT(push_token USING utf8mb4) COLLATE utf8mb4_unicode_ci push_token FROM users WHERE push_token IS NOT NULL AND push_token<>'' UNION SELECT user_id,CONVERT(expo_push_token USING utf8mb4) COLLATE utf8mb4_unicode_ci push_token FROM push_tokens WHERE is_active=1 AND expo_push_token IS NOT NULL AND expo_push_token<>'') token_data ON token_data.user_id=u.id LEFT JOIN user_notification_preferences np ON np.user_id=u.id WHERE (${condition}) AND COALESCE(np.news_enabled,1)=1`);
  return{users:new Set(rows.map(row=>Number(row.user_id))).size,tokens:[...new Set(rows.map(row=>row.push_token).filter(Boolean))]};
}

/** Token de un usuario */
export async function getUserPushToken(userId) {
  const [[row]] = await pool.query(
    `SELECT push_token FROM users WHERE id=? AND push_token IS NOT NULL LIMIT 1`,
    [userId]
  );
  return row?.push_token || null;
}
