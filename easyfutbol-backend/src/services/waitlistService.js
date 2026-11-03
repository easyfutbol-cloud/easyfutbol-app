import crypto from 'crypto';
import { pool } from '../config/db.js';
import { sendPushNotification } from './pushService.js';
import {
  chooseWaitlistTicketColor,
  EXTRA_MATCH_PLUS_HEADSTART_MINUTES,
  getWaitlistOffersToCreate,
  isPastWaitlistCutoff,
  splitEasyPassCharge,
  WAITLIST_AUTO_ENTRY_CUTOFF_HOURS,
  WAITLIST_OFFER_MINUTES,
} from './waitlistPolicyService.js';
import { markSchedulerFailure, markSchedulerSuccess, registerScheduler } from './operationalHealthService.js';

const OFFER_MINUTES = WAITLIST_OFFER_MINUTES;
const MATCH_LOCATION_SQL = `COALESCE(location_id, CASE WHEN LOWER(city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END)`;

export class WaitlistError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export async function chargeEasyPass(conn, { userId, locationId, amount, description, eventId }) {
  const [[balanceRow]] = await conn.query(
    'SELECT balance FROM user_easypass_balances WHERE user_id = ? AND location_id = ? FOR UPDATE',
    [userId, locationId]
  );
  const [[globalRow]] = await conn.query(
    `SELECT u.easypass_balance AS global_balance,
            COALESCE((SELECT SUM(balance) FROM user_easypass_balances WHERE user_id = u.id), 0) AS located_balance
     FROM users u WHERE u.id = ? LIMIT 1 FOR UPDATE`,
    [userId]
  );
  const split = splitEasyPassCharge({
    locationBalance: balanceRow?.balance,
    globalBalance: globalRow?.global_balance,
    locatedBalance: globalRow?.located_balance,
    amount,
  });
  if (!split.enough) return { ok: false, available: split.available };

  if (split.fromLocation > 0) {
    await conn.query(
      'UPDATE user_easypass_balances SET balance = balance - ? WHERE user_id = ? AND location_id = ?',
      [split.fromLocation, userId, locationId]
    );
  }
  await conn.query(
    'UPDATE users SET easypass_balance = GREATEST(COALESCE(easypass_balance, 0) - ?, 0) WHERE id = ?',
    [amount, userId]
  );
  await conn.query(
    `INSERT INTO easypass_transactions (user_id, type, amount, description, event_id, payment_reference, created_at)
     VALUES (?, 'spend', ?, ?, ?, ?, NOW())`,
    [userId, -amount, description, eventId, `waitlist_${eventId}_${userId}_${Date.now()}`]
  );
  return { ok: true, fromLocation: split.fromLocation };
}

// Devuelve lo retenido al mismo saldo del que salió (sede o universal).
async function refundHold(conn, entry, description) {
  const amount = Number(entry.held_easypass) || 0;
  if (amount <= 0) return 0;
  const fromLocation = Math.min(Number(entry.held_from_location) || 0, amount);
  if (fromLocation > 0) {
    await conn.query(
      `INSERT INTO user_easypass_balances (user_id, location_id, balance) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)`,
      [entry.user_id, entry.held_location_id, fromLocation]
    );
  }
  await conn.query(
    'UPDATE users SET easypass_balance = COALESCE(easypass_balance, 0) + ? WHERE id = ?',
    [amount, entry.user_id]
  );
  await conn.query(
    `INSERT INTO easypass_transactions (user_id, type, amount, description, event_id, created_at)
     VALUES (?, 'refund', ?, ?, ?, NOW())`,
    [entry.user_id, amount, description, entry.match_id]
  );
  return amount;
}

async function insertConfirmedInscription(conn, { userId, matchId, ticketType }) {
  const [result] = await conn.query(
    `INSERT INTO inscriptions (user_id, match_id, status, ticket_type, claim_token)
     VALUES (?, ?, 'confirmed', ?, ?)`,
    [userId, matchId, ticketType, crypto.randomBytes(16).toString('hex')]
  );
  await conn.query('UPDATE matches SET spots_taken = spots_taken + 1 WHERE id = ?', [matchId]);
  return result.insertId;
}

async function getColorRemaining(conn, match) {
  const [rows] = await conn.query(
    `SELECT ticket_type, COUNT(*) AS count FROM inscriptions
     WHERE match_id = ? AND status IN ('pending','confirmed') GROUP BY ticket_type`,
    [match.id]
  );
  const taken = Object.fromEntries(rows.map((row) => [row.ticket_type, Number(row.count)]));
  const perColor = Math.floor(Number(match.capacity || 0) / 2);
  return {
    white: Math.max(perColor - (taken.white || 0), 0),
    black: Math.max(perColor - (taken.black || 0), 0),
  };
}

async function pushToUser(userId, payload) {
  const [tokenRows] = await pool.query(
    'SELECT expo_push_token FROM push_tokens WHERE user_id = ? AND is_active = 1',
    [userId]
  );
  const tokens = tokenRows.map((row) => row.expo_push_token).filter(Boolean);
  if (tokens.length) await sendPushNotification(tokens, payload);
}

export async function sendWaitlistPushes(pushes) {
  for (const { userId, payload } of pushes) {
    await pushToUser(userId, payload).catch((error) => {
      console.error('[WAITLIST] No se pudo enviar el aviso:', error?.message || error);
    });
  }
}

const RELEASE_COPY = {
  cutoff: (title, amount) => ({
    title: 'No se ha liberado plaza',
    body: `No ha salido sitio en ${title}. Te hemos devuelto ${amount} EasyPass.`,
    description: `Lista de espera sin plaza en ${title}: devolución de ${amount} EasyPass`,
  }),
  cancelled: (title, amount) => ({
    title: 'Partido cancelado',
    body: `${title} se ha cancelado. Te hemos devuelto ${amount} EasyPass de la lista de espera.`,
    description: `Partido cancelado ${title}: devolución de ${amount} EasyPass de la lista de espera`,
  }),
};

// Debe ejecutarse con el partido bloqueado. Devuelve los avisos a enviar tras el commit.
export async function releaseWaitlistHolds(conn, match, reason = 'cutoff') {
  const [entries] = await conn.query(
    `SELECT * FROM match_waitlist
     WHERE match_id = ? AND status = 'waiting' AND held_easypass > 0 FOR UPDATE`,
    [match.id]
  );
  const pushes = [];
  for (const entry of entries) {
    const copy = RELEASE_COPY[reason](match.title, Number(entry.held_easypass));
    await refundHold(conn, entry, copy.description);
    await conn.query(
      `UPDATE match_waitlist SET status = 'expired', held_easypass = 0, held_from_location = 0 WHERE id = ?`,
      [entry.id]
    );
    pushes.push({
      userId: entry.user_id,
      payload: {
        title: copy.title,
        body: copy.body,
        data: { type: 'waitlist_released', screen: 'Match', matchId: Number(match.id) },
      },
    });
  }
  return pushes;
}

export async function processWaitlistForMatch(matchId) {
  const conn = await pool.getConnection();
  const pushes = [];
  let entered = 0;
  let offered = 0;

  try {
    await conn.beginTransaction();

    const [[match]] = await conn.query(
      `SELECT id, title, starts_at, capacity, spots_taken, status
       FROM matches WHERE id = ? FOR UPDATE`,
      [matchId]
    );
    if (!match) {
      await conn.rollback();
      return { entered: 0, offered: 0 };
    }

    const closed = !['scheduled', 'open', 'full'].includes(match.status);
    if (closed || isPastWaitlistCutoff(match.starts_at)) {
      pushes.push(...await releaseWaitlistHolds(conn, match, closed ? 'cancelled' : 'cutoff'));
    }

    if (!['scheduled', 'open'].includes(match.status) || new Date(match.starts_at).getTime() <= Date.now()) {
      await conn.commit();
      await sendWaitlistPushes(pushes);
      return { entered: 0, offered: 0 };
    }

    await conn.query(
      `UPDATE match_waitlist
       SET status = 'expired', updated_at = NOW()
       WHERE match_id = ? AND status = 'offered' AND offer_expires_at <= NOW()`,
      [matchId]
    );

    const [[offerCountRow]] = await conn.query(
      `SELECT COUNT(*) AS count FROM match_waitlist
       WHERE match_id = ? AND status = 'offered' AND offer_expires_at > NOW()`,
      [matchId]
    );
    let freeSpots = getWaitlistOffersToCreate({
      capacity: match.capacity,
      spotsTaken: match.spots_taken,
      activeOffers: offerCountRow?.count,
    });

    if (!freeSpots) {
      await conn.commit();
      await sendWaitlistPushes(pushes);
      return { entered: 0, offered: 0 };
    }

    const [candidates] = await conn.query(
      `SELECT mw.*
       FROM match_waitlist mw
       WHERE mw.match_id = ? AND mw.status = 'waiting'
       ORDER BY mw.is_plus_snapshot DESC, mw.created_at ASC, mw.id ASC
       FOR UPDATE`,
      [matchId]
    );
    const remaining = await getColorRemaining(conn, match);

    for (const candidate of candidates) {
      if (freeSpots <= 0) break;

      // Filas anteriores a la retención: siguen con la oferta de 30 minutos.
      if (Number(candidate.held_easypass) <= 0) {
        await conn.query(
          `UPDATE match_waitlist
           SET status = 'offered', notified_at = NOW(), offer_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
           WHERE id = ?`,
          [OFFER_MINUTES, candidate.id]
        );
        pushes.push({
          userId: candidate.user_id,
          payload: {
            title: '¡Hay una plaza para ti!',
            body: `Se ha liberado una plaza en ${match.title}. Tienes 30 minutos para reservarla.`,
            data: { type: 'waitlist_offer', screen: 'Match', matchId: Number(match.id), expiresInMinutes: OFFER_MINUTES },
          },
        });
        freeSpots -= 1;
        offered += 1;
        continue;
      }

      // Si ya juega con una entrada regalada no se le cobra otra.
      const [[alreadyPlaying]] = await conn.query(
        `SELECT id FROM inscriptions
         WHERE match_id = ? AND (user_id = ? OR assigned_user_id = ?) AND status IN ('pending','confirmed') LIMIT 1`,
        [matchId, candidate.user_id, candidate.user_id]
      );
      if (alreadyPlaying) {
        await refundHold(conn, candidate, `Ya tienes plaza en ${match.title}: devolución de la lista de espera`);
        await conn.query(
          `UPDATE match_waitlist SET status = 'cancelled', held_easypass = 0, held_from_location = 0 WHERE id = ?`,
          [candidate.id]
        );
        continue;
      }

      const ticketType = chooseWaitlistTicketColor({
        preferred: candidate.preferred_ticket_type,
        whiteRemaining: remaining.white,
        blackRemaining: remaining.black,
      });
      if (!ticketType) break;

      await insertConfirmedInscription(conn, { userId: candidate.user_id, matchId, ticketType });
      await conn.query(
        `UPDATE match_waitlist
         SET status = 'claimed', held_easypass = 0, held_from_location = 0, notified_at = NOW(), offer_expires_at = NULL
         WHERE id = ?`,
        [candidate.id]
      );
      remaining[ticketType] -= 1;
      freeSpots -= 1;
      entered += 1;
      pushes.push({
        userId: candidate.user_id,
        payload: {
          title: '¡Estás dentro!',
          body: `Se ha liberado una plaza en ${match.title} y ya es tuya, con camiseta ${ticketType === 'white' ? 'blanca' : 'negra'}. Usamos tu EasyPass retenido.`,
          data: { type: 'waitlist_entered', screen: 'Match', matchId: Number(match.id) },
        },
      });
    }

    await conn.commit();
    await sendWaitlistPushes(pushes);

    return { entered, offered };
  } catch (error) {
    await conn.rollback();
    console.error('[WAITLIST] No se pudo procesar la cola:', error);
    throw error;
  } finally {
    conn.release();
  }
}

export async function joinWaitlist({ matchId, userId, preferredTicketType, isPlus }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[match]] = await conn.query(
      `SELECT id, title, starts_at, capacity, spots_taken, status, is_private,
              COALESCE(easypass_cost, 1) AS easypass_cost, ${MATCH_LOCATION_SQL} AS resolved_location_id
       FROM matches WHERE id = ? FOR UPDATE`,
      [matchId]
    );
    if (
      !match
      || match.is_private
      || !['scheduled', 'open', 'full'].includes(match.status)
      || isPastWaitlistCutoff(match.starts_at)
    ) {
      throw new WaitlistError(400, 'WAITLIST_CLOSED', 'Este partido ya no admite lista de espera');
    }

    const [[activeOffers]] = await conn.query(
      `SELECT COUNT(*) AS count FROM match_waitlist
       WHERE match_id = ? AND status='offered' AND offer_expires_at > NOW()`,
      [matchId]
    );
    const effectiveFreeSpots = Number(match.capacity || 0) - Number(match.spots_taken || 0) - Number(activeOffers?.count || 0);
    if (effectiveFreeSpots > 0) {
      throw new WaitlistError(409, 'SPOT_AVAILABLE', 'Ahora mismo hay una plaza disponible; puedes reservarla directamente');
    }

    const [[inscription]] = await conn.query(
      `SELECT id FROM inscriptions WHERE match_id = ? AND user_id = ? AND status IN ('pending','confirmed') LIMIT 1`,
      [matchId, userId]
    );
    if (inscription) throw new WaitlistError(409, 'ALREADY_REGISTERED', 'Ya tienes una entrada para este partido');

    const [[existing]] = await conn.query(
      'SELECT id, status FROM match_waitlist WHERE match_id = ? AND user_id = ? LIMIT 1 FOR UPDATE',
      [matchId, userId]
    );
    if (existing && ['waiting', 'offered'].includes(existing.status)) {
      throw new WaitlistError(409, 'ALREADY_IN_WAITLIST', 'Ya estás en la lista de espera');
    }

    const cost = Math.max(1, Number(match.easypass_cost || 1));
    const locationId = Number(match.resolved_location_id);
    const charge = await chargeEasyPass(conn, {
      userId,
      locationId,
      amount: cost,
      description: `Retenido en lista de espera de ${match.title}`,
      eventId: matchId,
    });
    if (!charge.ok) {
      throw new WaitlistError(400, 'NO_EASYPASS', `Necesitas ${cost} EasyPass para entrar en la lista de espera de este partido.`, {
        requiredEasyPass: cost,
        currentEasyPass: charge.available,
      });
    }

    // Quien sale y vuelve a entrar pasa al final: created_at se reinicia.
    await conn.query(
      `INSERT INTO match_waitlist
         (match_id, user_id, status, is_plus_snapshot, notifications_consent_at, notified_at, offer_expires_at,
          held_easypass, held_from_location, held_location_id, preferred_ticket_type)
       VALUES (?, ?, 'waiting', ?, NOW(), NULL, NULL, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status='waiting', is_plus_snapshot=VALUES(is_plus_snapshot),
         notifications_consent_at=NOW(), notified_at=NULL, offer_expires_at=NULL, created_at=NOW(),
         held_easypass=VALUES(held_easypass), held_from_location=VALUES(held_from_location),
         held_location_id=VALUES(held_location_id), preferred_ticket_type=VALUES(preferred_ticket_type)`,
      [matchId, userId, isPlus ? 1 : 0, cost, charge.fromLocation, locationId, preferredTicketType]
    );

    await conn.commit();
    return { heldEasyPass: cost };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function leaveWaitlist({ matchId, userId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[match]] = await conn.query('SELECT id, title FROM matches WHERE id = ? FOR UPDATE', [matchId]);
    const [[entry]] = await conn.query(
      `SELECT * FROM match_waitlist
       WHERE match_id = ? AND user_id = ? AND status IN ('waiting','offered') LIMIT 1 FOR UPDATE`,
      [matchId, userId]
    );
    let refunded = 0;
    if (entry) {
      refunded = await refundHold(conn, entry, `Saliste de la lista de espera de ${match?.title || `#${matchId}`}: devolución de EasyPass`);
      await conn.query(
        `UPDATE match_waitlist SET status='cancelled', offer_expires_at=NULL, held_easypass=0, held_from_location=0 WHERE id = ?`,
        [entry.id]
      );
    }
    await conn.commit();
    return { left: Boolean(entry), refunded };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function getWaitlistBookingBlock(db, match, userId) {
  if (Number(match?.is_private) === 1) {
    return { status: 403, code: 'PRIVATE_MATCH', msg: 'Este partido es solo por invitación' };
  }
  const [[hold]] = await db.query(
    `SELECT id FROM match_waitlist
     WHERE match_id = ? AND user_id = ? AND status = 'waiting' AND held_easypass > 0 LIMIT 1`,
    [match.id, userId]
  );
  if (hold) {
    return {
      status: 409,
      code: 'WAITLIST_HOLD_ACTIVE',
      msg: 'Ya tienes un EasyPass retenido en la lista de espera. Entrarás automáticamente cuando te toque.',
    };
  }
  return null;
}

export async function canViewPrivateMatch(db, matchId, user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const [[row]] = await db.query(
    `SELECT 1 AS allowed FROM inscriptions
     WHERE match_id = ? AND (user_id = ? OR assigned_user_id = ?) AND status IN ('pending','confirmed')
     UNION
     SELECT 1 FROM match_extra_invitations
     WHERE extra_match_id = ? AND user_id = ? AND status <> 'declined' AND available_from <= NOW()
     LIMIT 1`,
    [matchId, user.id, user.id, matchId, user.id]
  );
  return Boolean(row);
}

export async function getActiveExtraInvitation(db, { sourceMatchId, userId }) {
  const [[invitation]] = await db.query(
    `SELECT inv.id, inv.extra_match_id, m.title, m.starts_at, m.duration_min, f.name AS field_name,
            GREATEST(m.capacity - m.spots_taken, 0) AS spots_remaining, COALESCE(m.easypass_cost, 1) AS easypass_cost
     FROM match_extra_invitations inv
     JOIN matches m ON m.id = inv.extra_match_id
     LEFT JOIN fields f ON f.id = m.field_id
     WHERE inv.source_match_id = ? AND inv.user_id = ? AND inv.status = 'invited'
       AND inv.available_from <= NOW() AND m.starts_at > NOW() AND m.status IN ('scheduled','open')
     ORDER BY m.starts_at ASC LIMIT 1`,
    [sourceMatchId, userId]
  );
  return invitation || null;
}

// Envía las invitaciones cuya hora ya ha llegado (Plus al crear, resto tras la ventaja).
export async function dispatchExtraInvitations() {
  const [rows] = await pool.query(
    `SELECT inv.id, inv.user_id, inv.source_match_id, inv.is_plus_snapshot, m.title, m.starts_at
     FROM match_extra_invitations inv
     JOIN matches m ON m.id = inv.extra_match_id
     JOIN match_waitlist mw ON mw.match_id = inv.source_match_id AND mw.user_id = inv.user_id
     WHERE inv.status = 'invited' AND inv.notified_at IS NULL AND inv.available_from <= NOW()
       AND mw.status = 'waiting' AND m.starts_at > NOW() AND m.status IN ('scheduled','open')
       AND m.spots_taken < m.capacity`
  );
  for (const row of rows) {
    const [claimed] = await pool.query(
      'UPDATE match_extra_invitations SET notified_at = NOW() WHERE id = ? AND notified_at IS NULL',
      [row.id]
    );
    if (!claimed.affectedRows) continue;
    await sendWaitlistPushes([{
      userId: row.user_id,
      payload: {
        title: row.is_plus_snapshot ? 'Partido extra: tienes prioridad Plus' : 'Partido extra para ti',
        body: 'Por la demanda en la lista de espera sale un partido más, solo por invitación. Entra para aceptarlo con tu EasyPass retenido.',
        data: { type: 'waitlist_extra_match', screen: 'Match', matchId: Number(row.source_match_id) },
      },
    }]);
  }
  return rows.length;
}

export async function createExtraMatchFromWaitlist({ sourceMatchId, startsAt }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[source]] = await conn.query('SELECT * FROM matches WHERE id = ? FOR UPDATE', [sourceMatchId]);
    if (!source) throw new WaitlistError(404, 'NOT_FOUND', 'Partido no encontrado');
    if (source.status === 'cancelled') throw new WaitlistError(400, 'MATCH_CANCELLED', 'El partido está cancelado');
    if (startsAt.getTime() <= Date.now()) throw new WaitlistError(400, 'INVALID_DATE', 'La fecha debe ser futura');

    const [entries] = await conn.query(
      `SELECT user_id, is_plus_snapshot FROM match_waitlist
       WHERE match_id = ? AND status = 'waiting' AND held_easypass > 0`,
      [sourceMatchId]
    );
    if (!entries.length) throw new WaitlistError(409, 'EMPTY_WAITLIST', 'No hay nadie con EasyPass retenido en la lista');

    const [result] = await conn.query(
      `INSERT INTO matches
         (title, field_id, city, location_id, starts_at, duration_min, price_eur, easypass_cost, capacity, spots_taken,
          status, has_aftergame, organizer_id, is_private, waitlist_source_match_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'scheduled', ?, ?, 1, ?)`,
      [
        `${source.title} · Extra`, source.field_id, source.city, source.location_id, startsAt, source.duration_min,
        source.price_eur, source.easypass_cost, source.capacity, source.has_aftergame || 0, source.organizer_id || null,
        sourceMatchId,
      ]
    );

    for (const entry of entries) {
      await conn.query(
        `INSERT INTO match_extra_invitations
           (extra_match_id, source_match_id, user_id, is_plus_snapshot, available_from)
         VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
        [result.insertId, sourceMatchId, entry.user_id, entry.is_plus_snapshot ? 1 : 0, entry.is_plus_snapshot ? 0 : EXTRA_MATCH_PLUS_HEADSTART_MINUTES]
      );
    }
    await conn.commit();

    await dispatchExtraInvitations().catch((error) => {
      console.error('[WAITLIST] Error enviando invitaciones del partido extra:', error);
    });

    return {
      id: result.insertId,
      invited: entries.length,
      invitedPlus: entries.filter((entry) => entry.is_plus_snapshot).length,
      plusHeadstartMinutes: EXTRA_MATCH_PLUS_HEADSTART_MINUTES,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function acceptExtraInvitation({ invitationId, userId, preferredTicketType }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[invitation]] = await conn.query(
      `SELECT * FROM match_extra_invitations
       WHERE id = ? AND user_id = ? AND status = 'invited' AND available_from <= NOW() FOR UPDATE`,
      [invitationId, userId]
    );
    if (!invitation) throw new WaitlistError(404, 'INVITATION_NOT_FOUND', 'Esta invitación ya no está disponible');

    const [[extra]] = await conn.query(
      `SELECT id, title, capacity, spots_taken, status, starts_at,
              COALESCE(easypass_cost, 1) AS easypass_cost, ${MATCH_LOCATION_SQL} AS resolved_location_id
       FROM matches WHERE id = ? FOR UPDATE`,
      [invitation.extra_match_id]
    );
    if (!extra || !['scheduled', 'open'].includes(extra.status) || new Date(extra.starts_at).getTime() <= Date.now()) {
      throw new WaitlistError(410, 'EXTRA_CLOSED', 'Este partido extra ya no está disponible');
    }
    if (Number(extra.spots_taken) >= Number(extra.capacity)) {
      throw new WaitlistError(409, 'EXTRA_FULL', 'El partido extra se ha completado. Sigues en la lista de espera con tu EasyPass retenido.');
    }

    const [[entry]] = await conn.query(
      `SELECT * FROM match_waitlist
       WHERE match_id = ? AND user_id = ? AND status = 'waiting' AND held_easypass > 0 LIMIT 1 FOR UPDATE`,
      [invitation.source_match_id, userId]
    );
    if (!entry) throw new WaitlistError(409, 'NOT_WAITING', 'Ya no estás en la lista de espera de este partido');

    const remaining = await getColorRemaining(conn, extra);
    const ticketType = chooseWaitlistTicketColor({
      preferred: preferredTicketType || entry.preferred_ticket_type,
      whiteRemaining: remaining.white,
      blackRemaining: remaining.black,
    });
    if (!ticketType) throw new WaitlistError(409, 'EXTRA_FULL', 'El partido extra se ha completado. Sigues en la lista de espera con tu EasyPass retenido.');

    // Asiento limpio: lo retenido sale del partido original y se gasta en el extra.
    await refundHold(conn, entry, `Pasas al partido extra ${extra.title}: se libera lo retenido en lista de espera`);
    const cost = Math.max(1, Number(extra.easypass_cost || 1));
    const charge = await chargeEasyPass(conn, {
      userId,
      locationId: Number(extra.resolved_location_id),
      amount: cost,
      description: `Inscripción partido ${extra.title}`,
      eventId: extra.id,
    });
    if (!charge.ok) throw new WaitlistError(400, 'NO_EASYPASS', `Necesitas ${cost} EasyPass para este partido extra.`);

    const inscriptionId = await insertConfirmedInscription(conn, { userId, matchId: extra.id, ticketType });
    await conn.query(
      `UPDATE match_waitlist SET status='claimed', held_easypass=0, held_from_location=0 WHERE id = ?`,
      [entry.id]
    );
    await conn.query(
      `UPDATE match_extra_invitations SET status='accepted', responded_at=NOW() WHERE id = ?`,
      [invitation.id]
    );
    await conn.commit();
    return { matchId: Number(extra.id), inscriptionId, ticketType };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function declineExtraInvitation({ invitationId, userId }) {
  const [result] = await pool.query(
    `UPDATE match_extra_invitations SET status='declined', responded_at=NOW()
     WHERE id = ? AND user_id = ? AND status = 'invited'`,
    [invitationId, userId]
  );
  return result.affectedRows > 0;
}

let schedulerRunning = false;
let processing = false;

export async function runWaitlistSweep() {
  const [rows] = await pool.query(
    `SELECT DISTINCT mw.match_id
     FROM match_waitlist mw
     JOIN matches m ON m.id = mw.match_id
     WHERE (m.starts_at > NOW()
         AND m.status IN ('scheduled', 'open')
         AND (mw.status = 'waiting' OR (mw.status = 'offered' AND mw.offer_expires_at <= NOW())))
        OR (mw.status = 'waiting' AND mw.held_easypass > 0
         AND (m.starts_at <= DATE_ADD(NOW(), INTERVAL ? HOUR) OR m.status NOT IN ('scheduled', 'open', 'full')))`,
    [WAITLIST_AUTO_ENTRY_CUTOFF_HOURS]
  );
  for (const row of rows) await processWaitlistForMatch(Number(row.match_id));
  await dispatchExtraInvitations();
}

export function startWaitlistScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  registerScheduler('waitlist', { maxAgeSeconds: 3 * 60 });

  const run = async () => {
    if (processing) return;
    processing = true;
    try {
      await runWaitlistSweep();
      markSchedulerSuccess('waitlist');
    } catch (error) {
      markSchedulerFailure('waitlist', error);
      console.error('[WAITLIST] Error del programador:', error);
    } finally {
      processing = false;
    }
  };

  run();
  const timer = setInterval(run, 60 * 1000);
  timer.unref?.();
}
