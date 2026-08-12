import { sendPushNotification } from './pushService.js';

export const positiveId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export async function areFriends(db, firstUserId, secondUserId) {
  const [[row]] = await db.query(
    `SELECT id FROM friendships
     WHERE user_low_id=LEAST(?,?) AND user_high_id=GREATEST(?,?) AND status='accepted'
     LIMIT 1`,
    [firstUserId, secondUserId, firstUserId, secondUserId]
  );
  return Boolean(row);
}

export async function getFriendshipStatus(db, viewerId, otherUserId) {
  const [[row]] = await db.query(
    `SELECT id,requester_id,addressee_id,status,created_at,updated_at
     FROM friendships WHERE user_low_id=LEAST(?,?) AND user_high_id=GREATEST(?,?) LIMIT 1`,
    [viewerId, otherUserId, viewerId, otherUserId]
  );
  if (!row || ['rejected','cancelled'].includes(row.status)) return { status:'none', friendship_id:row?.id || null };
  if (row.status === 'accepted') return { status:'friends', friendship_id:row.id };
  return {
    status:Number(row.requester_id) === Number(viewerId) ? 'sent' : 'received',
    friendship_id:row.id,
  };
}

export async function createSocialNotification(db, {
  userId, actorId=null, type, entityType, entityId, title, body, data={}, dedupeKey,
}) {
  const [result] = await db.query(
    `INSERT IGNORE INTO social_notifications
       (user_id,actor_id,type,entity_type,entity_id,title,body,data,dedupe_key)
     VALUES (?,?,?,?,?,?,?,CAST(? AS JSON),?)`,
    [userId,actorId,type,entityType,entityId,title,body,JSON.stringify(data),dedupeKey || null]
  );
  if (!result.affectedRows) return false;
  const [tokenRows] = await db.query(
    `SELECT CONVERT(expo_push_token USING utf8mb4) COLLATE utf8mb4_unicode_ci AS token
       FROM push_tokens WHERE user_id=? AND is_active=1
     UNION
     SELECT CONVERT(push_token USING utf8mb4) COLLATE utf8mb4_unicode_ci AS token
       FROM users WHERE id=? AND push_token IS NOT NULL`,
    [userId,userId]
  );
  const tokens=[...new Set(tokenRows.map((row)=>row.token).filter(Boolean))];
  if (tokens.length) sendPushNotification(tokens,{ title,body,data }).catch((error)=>console.error('[SOCIAL PUSH]',error?.message || error));
  return true;
}

export async function expireMatchInvitations(db, receiverId=null) {
  const params=[];
  const receiverClause=receiverId ? ' AND mi.receiver_id=?' : '';
  if (receiverId) params.push(receiverId);
  await db.query(
    `UPDATE match_invitations mi JOIN matches m ON m.id=mi.match_id
     SET mi.status='expired'
     WHERE mi.status IN ('pending','viewed')
       AND (m.starts_at<=NOW() OR m.status='cancelled' OR m.spots_taken>=m.capacity)
       ${receiverClause}`,
    params
  );
}
