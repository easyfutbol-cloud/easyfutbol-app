import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import Stripe from 'stripe';
import { sendPushNotification } from '../services/pushService.js';
import { processWaitlistForMatch } from '../services/waitlistService.js';
import { addPlusFairPlayWarning, getPlusFairPlayStatus } from '../services/plusFairPlayService.js';
import {
  getCancellationPolicy,
  hasMatchStarted,
  hoursUntilMatch,
} from '../services/cancellationPolicyService.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// --- Helper política de reembolso ---
function refundPercent(startsAtISO, isPlus = false) {
  return getCancellationPolicy(startsAtISO, isPlus).refundable ? 100 : 0;
}

function hoursUntil(startsAtISO) {
  return hoursUntilMatch(startsAtISO);
}

function formatMatchDateTime(startsAtISO) {
  const date = new Date(startsAtISO);
  const day = date.toLocaleDateString('es-ES', { weekday: 'long' });
  const dayNumber = date.toLocaleDateString('es-ES', { day: 'numeric' });
  const month = date.toLocaleDateString('es-ES', { month: 'long' });
  const time = date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return `${day} ${dayNumber} de ${month} a las ${time}`;
}

function getFallbackLocationFromCity(city = '') {
  const normalized = String(city || '').trim().toLowerCase();
  if (['avilés', 'aviles', 'oviedo', 'gijón', 'gijon', 'asturias'].includes(normalized)) {
    return { id: 2, name: 'Asturias', slug: 'asturias' };
  }
  return { id: 1, name: 'Valladolid', slug: 'valladolid' };
}

async function getLocationName(conn, locationId, fallbackName) {
  const [[locationRow]] = await conn.query(
    `SELECT name FROM locations WHERE id = ? LIMIT 1`,
    [locationId]
  );
  return locationRow?.name || fallbackName;
}


// --- Mis inscripciones (para la app) ---
router.get('/me/inscriptions', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      `SELECT i.id AS inscription_id,
              i.status,
              i.stripe_session_id,
              i.ticket_type,
              i.payment_type,
              1 AS quantity,
              1 AS total_entries,
              1 AS entradas_count,
              m.id AS match_id,
              m.title,
              m.city,
              m.starts_at,
              m.duration_min,
              f.name AS field_name,
              COALESCE(own_stats.goals, i.goals, 0) AS goals,
              COALESCE(own_stats.assists, i.assists, 0) AS assists,
              COALESCE(own_stats.is_mvp, i.is_mvp, 0) AS is_mvp,
              own_stats.result,
              mvp_user.name AS mvp_name,
              EXISTS(
                SELECT 1 FROM user_plus_subscriptions ups
                WHERE ups.user_id = i.user_id
                  AND ups.status IN ('active', 'trialing')
                  AND (ups.current_period_end IS NULL OR ups.current_period_end > NOW())
              ) AS is_plus
       FROM inscriptions i
       JOIN matches m ON m.id = i.match_id
       JOIN fields  f ON f.id = m.field_id
       LEFT JOIN match_player_stats own_stats
         ON own_stats.match_id = m.id
        AND own_stats.user_id = i.user_id
       LEFT JOIN match_player_stats mvp_stats
         ON mvp_stats.match_id = m.id
        AND mvp_stats.is_mvp = 1
       LEFT JOIN users mvp_user ON mvp_user.id = mvp_stats.user_id
       WHERE i.user_id = ?
       ORDER BY m.starts_at DESC, i.id ASC
       LIMIT 300`,
      [userId]
    );

    const normalizedRows = rows.map((row) => ({
      ...row,
      quantity: 1,
      total_entries: 1,
      entradas_count: 1,
    }));

    console.log('GET /me/inscriptions', {
      userId,
      count: normalizedRows.length,
    });

    res.json({ ok: true, data: normalizedRows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: 'Error listando inscripciones' });
  }
});

// Ficha posterior al partido para cualquier jugador que haya participado.
router.get('/matches/:id/post-match', requireAuth, async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    if (!Number.isInteger(matchId) || matchId <= 0) {
      return res.status(400).json({ ok: false, msg: 'Partido inválido' });
    }

    const [[access]] = await pool.query(
      `SELECT 1
       FROM inscriptions i
       WHERE i.match_id=? AND i.user_id=? AND i.status IN ('confirmed','paid','active')
       UNION
       SELECT 1 FROM match_player_stats WHERE match_id=? AND user_id=? LIMIT 1`,
      [matchId, req.user.id, matchId, req.user.id]
    );
    if (!access) return res.status(403).json({ ok: false, msg: 'No participaste en este partido' });

    const [[match]] = await pool.query(
      `SELECT m.id,m.title,m.city,m.starts_at,m.duration_min,f.name field_name
       FROM matches m LEFT JOIN fields f ON f.id=m.field_id WHERE m.id=? LIMIT 1`,
      [matchId]
    );
    if (!match) return res.status(404).json({ ok: false, msg: 'Partido no encontrado' });

    const [players] = await pool.query(
      `SELECT mps.user_id,u.name,u.avatar_url,mps.goals,mps.assists,mps.is_mvp,mps.result,
              COALESCE((SELECT i.ticket_type FROM inscriptions i
                        WHERE i.match_id=mps.match_id AND i.user_id=mps.user_id
                          AND i.status IN ('confirmed','paid','active')
                        ORDER BY i.id LIMIT 1),'pending') team
       FROM match_player_stats mps JOIN users u ON u.id=mps.user_id
       WHERE mps.match_id=?
       ORDER BY FIELD(team,'white','black','pending'),mps.is_mvp DESC,mps.goals DESC,u.name`,
      [matchId]
    );

    const normalized = players.map((player) => ({
      ...player,
      goals: Number(player.goals || 0),
      assists: Number(player.assists || 0),
      is_mvp: Boolean(Number(player.is_mvp || 0)),
    }));
    const white = normalized.filter((player) => player.team === 'white');
    const black = normalized.filter((player) => player.team === 'black');
    const pending = normalized.filter((player) => !['white', 'black'].includes(player.team));
    const score = {
      white: white.reduce((total, player) => total + player.goals, 0),
      black: black.reduce((total, player) => total + player.goals, 0),
    };
    const personal = normalized.find((player) => Number(player.user_id) === Number(req.user.id)) || null;
    const mvp = normalized.find((player) => player.is_mvp) || null;

    return res.json({ ok: true, data: { match, score, mvp, personal, teams: { white, black, pending } } });
  } catch (error) {
    console.error('[POST MATCH SUMMARY]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudo cargar el resumen' });
  }
});

// --- Apuntarse usando EasyPass ---
router.post('/matches/:id/join-with-easypass', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const userId = req.user.id;
    const matchId = Number(req.params.id);

    const quantity = Math.max(1, Number.parseInt(req.body?.quantity, 10) || 1);
    const shirtColorInput = req.body?.ticketType ?? req.body?.ticket_type ?? req.body?.shirtColor ?? 'white';
    const shirtColorRaw = String(shirtColorInput).trim().toLowerCase();
    console.log('POST /matches/:id/join-with-easypass ticket color', { userId, matchId, quantity, ticketType: req.body?.ticketType, ticket_type: req.body?.ticket_type, shirtColor: req.body?.shirtColor, normalized: shirtColorRaw });
    const shirtColor = shirtColorRaw === 'black' ? 'black' : 'white';

    await conn.beginTransaction();

    // bloquear usuario para comprobar saldo EasyPass
    const [[user]] = await conn.query(
      'SELECT easypass_balance AS easyPassBalance FROM users WHERE id=? FOR UPDATE',
      [userId]
    );

    if (!user || Number(user.easyPassBalance || 0) < quantity) {
      await conn.rollback();
      return res.status(400).json({ ok:false, msg:`No tienes EasyPass suficientes para ${quantity} plaza(s)` });
    }

    // comprobar plazas
    const [[match]] = await conn.query(
      'SELECT * FROM matches WHERE id=? FOR UPDATE',
      [matchId]
    );

    if (!match) {
      await conn.rollback();
      return res.status(404).json({ ok:false, msg:'Partido no encontrado' });
    }

    const totalSpots = Number(
      match.spots_total
      ?? match.capacity
      ?? match.max_players
      ?? match.total_spots
      ?? match.plazas
      ?? match.plazas_totales
      ?? 0
    );

    if (totalSpots <= 0) {
      await conn.rollback();
      return res.status(500).json({ ok:false, msg:'No se pudo determinar la capacidad del partido' });
    }

    const [[takenRow]] = await conn.query(
      `SELECT COUNT(*) AS taken
       FROM inscriptions
       WHERE match_id = ? AND status = 'confirmed'`,
      [matchId]
    );

    const currentTaken = Number(takenRow?.taken || 0);
    if ((currentTaken + quantity) > totalSpots) {
      await conn.rollback();
      return res.status(400).json({ ok:false, msg:`No hay ${quantity} plaza(s) disponibles` });
    }

    const maxPerColor = 8;
    const [[colorTakenRow]] = await conn.query(
      `SELECT COUNT(*) AS taken
       FROM inscriptions
       WHERE match_id = ?
         AND status = 'confirmed'
         AND ticket_type = ?`,
      [matchId, shirtColor]
    );

    const currentColorTaken = Number(colorTakenRow?.taken || 0);
    if ((currentColorTaken + quantity) > maxPerColor) {
      await conn.rollback();
      return res.status(400).json({
        ok: false,
        msg: `No quedan ${shirtColor === 'white' ? 'camisetas blancas' : 'camisetas negras'} suficientes para ${quantity} plaza(s)`
      });
    }

    // descontar EasyPass
    await conn.query(
      'UPDATE users SET easypass_balance = easypass_balance - ? WHERE id=?',
      [quantity, userId]
    );

    // crear inscripción confirmada
    const inscriptionValues = Array.from({ length: quantity }, () => [matchId, userId, 'confirmed', shirtColor, 'easypass']);
    const [ins] = await conn.query(
      `INSERT INTO inscriptions (match_id, user_id, status, ticket_type, payment_type)
       VALUES ?`,
      [inscriptionValues]
    );

    // aumentar plazas ocupadas
    await conn.query(
      'UPDATE matches SET spots_taken = spots_taken + ? WHERE id=?',
      [quantity, matchId]
    );

    // registrar movimiento de EasyPass
    await conn.query(
      `INSERT INTO easypass_transactions (user_id, type, amount, description, event_id, created_at)
       VALUES (?, 'spend', ?, ?, ?, NOW())`,
      [userId, -quantity, `Compra de ${quantity} plaza(s) con EasyPass`, matchId]
    );

    const [[updatedUser]] = await conn.query(
      'SELECT easypass_balance AS easyPassBalance FROM users WHERE id=? LIMIT 1',
      [userId]
    );

    const [[matchDetails]] = await conn.query(
      `SELECT m.id, m.title, m.starts_at, f.name AS field_name
       FROM matches m
       LEFT JOIN fields f ON f.id = m.field_id
       WHERE m.id = ?
       LIMIT 1`,
      [matchId]
    );

    await conn.commit();

    try {
      const [tokenRows] = await pool.query(
        `SELECT expo_push_token
         FROM push_tokens
         WHERE user_id = ? AND is_active = 1`,
        [userId]
      );

      const tokens = (tokenRows || []).map(r => r.expo_push_token).filter(Boolean);

      if (tokens.length) {
        const formattedDate = formatMatchDateTime(matchDetails?.starts_at || match?.starts_at);
        const fieldName = matchDetails?.field_name || 'el campo indicado en la app';
        const title = quantity > 1 ? 'Entradas confirmadas' : 'Ya estás apuntado';
        const body = quantity > 1
          ? `Has comprado ${quantity} entradas para el partido del ${formattedDate} en ${fieldName}.`
          : `Has comprado 1 entrada para el partido del ${formattedDate} en ${fieldName}.`;

        await sendPushNotification(tokens, {
          title,
          body,
          data: {
            type: 'match_confirmed',
            screen: 'EventDetails',
            matchId,
            quantity,
          },
        });
      }
    } catch (pushError) {
      console.error('Error enviando push de inscripción confirmada:', pushError);
    }

    return res.json({
      ok:true,
      msg:`${quantity} plaza(s) confirmada(s) con EasyPass`,
      inscription_id: ins.insertId,
      quantity,
      created_rows: Number(ins.affectedRows || 0),
      easyPassBalance: Number(updatedUser?.easyPassBalance || 0),
    });

  } catch (e) {
    await conn.rollback();
    console.error(e);
    return res.status(500).json({ ok:false, msg:'Error al usar EasyPass' });
  } finally {
    conn.release();
  }
});

// --- Cancelar una entrada individual por inscription_id ---
router.patch('/inscriptions/:id/cancel', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const userId = req.user.id;
    const inscriptionId = Number(req.params.id);

    if (!inscriptionId) {
      return res.status(400).json({ ok: false, msg: 'Entrada no válida' });
    }

    const [[row]] = await conn.query(
      `SELECT i.id AS inscription_id,
              i.status,
              i.stripe_session_id,
              i.ticket_type,
              i.payment_type,
              m.starts_at,
              m.id AS match_id,
              m.title,
              m.city,
              COALESCE(m.location_id, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END) AS location_id,
              COALESCE(m.easypass_cost, 1) AS easypass_cost
              ,EXISTS(
                SELECT 1 FROM user_plus_subscriptions ups
                WHERE ups.user_id = i.user_id
                  AND ups.status IN ('active', 'trialing')
                  AND (ups.current_period_end IS NULL OR ups.current_period_end > NOW())
              ) AS is_plus
       FROM inscriptions i
       JOIN matches m ON m.id = i.match_id
       WHERE i.id = ?
         AND i.user_id = ?
       LIMIT 1`,
      [inscriptionId, userId]
    );

    if (!row) {
      return res.status(404).json({ ok: false, msg: 'Entrada no encontrada' });
    }

    if (['cancelled', 'canceled'].includes(String(row.status || '').toLowerCase())) {
      return res.status(400).json({ ok: false, msg: 'Esta entrada ya estaba cancelada' });
    }

    if (row.status === 'pending') {
      await conn.beginTransaction();
      await conn.query(
        'DELETE FROM inscriptions WHERE id = ? AND user_id = ? AND status = "pending"',
        [inscriptionId, userId]
      );
      await conn.commit();

      return res.json({ ok: true, msg: 'Entrada cancelada (pendiente, sin pago)' });
    }

    if (row.status !== 'confirmed') {
      return res.status(400).json({ ok: false, msg: 'Esta entrada no se puede cancelar' });
    }

    if (hasMatchStarted(row.starts_at)) {
      return res.status(400).json({ ok: false, msg: 'No se puede cancelar una entrada después de comenzar el partido' });
    }

    const fairPlay = await getPlusFairPlayStatus(conn, userId);
    row.is_plus = fairPlay.eligible;
    const earnsLateWarning = fairPlay.eligible && hoursUntil(row.starts_at) <= 4;
    const pct = refundPercent(row.starts_at, fairPlay.eligible);

    const isEasyPassInscription = !row.stripe_session_id && (
      row.payment_type === 'easypass' ||
      row.ticket_type === 'credit' ||
      row.ticket_type === 'easypass' ||
      row.ticket_type === 'white' ||
      row.ticket_type === 'black'
    );

    if (isEasyPassInscription) {
      await conn.beginTransaction();

      const fallbackLocation = getFallbackLocationFromCity(row.city);
      const locationId = Number(row.location_id || fallbackLocation.id);
      const locationName = await getLocationName(conn, locationId, fallbackLocation.name);
      const refundAmount = Math.max(1, Number(row.easypass_cost || 1));

      if (pct > 0) {
        await conn.query(
          `INSERT INTO user_easypass_balances (user_id, location_id, balance)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)`,
          [userId, locationId, refundAmount]
        );

        await conn.query(
          'UPDATE users SET easypass_balance = COALESCE(easypass_balance, 0) + ? WHERE id=?',
          [refundAmount, userId]
        );

        await conn.query(
          `INSERT INTO easypass_transactions (user_id, type, amount, description, event_id, created_at)
           VALUES (?, 'refund', ?, ?, ?, NOW())`,
          [userId, refundAmount, `Cancelación de 1 entrada con devolución de ${refundAmount} EasyPass de ${locationName}`, row.match_id]
        );
      }

      await conn.query(
        'UPDATE inscriptions SET status="cancelled" WHERE id=? AND user_id=? AND status="confirmed"',
        [inscriptionId, userId]
      );

      await conn.query(
        'UPDATE matches SET spots_taken = GREATEST(spots_taken - 1, 0) WHERE id=?',
        [row.match_id]
      );

      const warningStatus = earnsLateWarning
        ? await addPlusFairPlayWarning(conn, { userId, inscriptionId, matchId: row.match_id, reason: 'late_cancellation' })
        : fairPlay;

      const [[updatedUser]] = await conn.query(
        'SELECT easypass_balance AS easyPassBalance FROM users WHERE id=? LIMIT 1',
        [userId]
      );

      await conn.commit();

      await processWaitlistForMatch(row.match_id).catch((error) => {
        console.error('[WAITLIST] Error tras cancelar entrada:', error);
      });

      return res.json({
        ok: true,
        msg: pct > 0
          ? `Entrada cancelada y ${refundAmount} EasyPass de ${locationName} devuelto`
          : `Entrada cancelada sin devolución.${earnsLateWarning ? ` Aviso Plus ${warningStatus.warningCount}/3.` : ''}`,
        pct,
        refundedEasyPass: pct > 0 ? refundAmount : 0,
        location_id: locationId,
        locationId,
        locationName,
        easyPassBalance: Number(updatedUser?.easyPassBalance || 0),
        plusWarningCount: warningStatus.warningCount,
        plusBenefitsSuspended: warningStatus.suspended,
      });
    }

    if (!row.stripe_session_id) {
      return res.status(400).json({ ok: false, msg: 'No se encontró el pago en Stripe ni se pudo detectar como EasyPass' });
    }

    if (pct === 0) {
      await conn.beginTransaction();
      await conn.query(
        'UPDATE inscriptions SET status="cancelled" WHERE id=? AND user_id=? AND status="confirmed"',
        [inscriptionId, userId]
      );
      await conn.query('UPDATE matches SET spots_taken = GREATEST(spots_taken - 1, 0) WHERE id=?', [row.match_id]);
      const warningStatus = earnsLateWarning
        ? await addPlusFairPlayWarning(conn, { userId, inscriptionId, matchId: row.match_id, reason: 'late_cancellation' })
        : fairPlay;
      await conn.commit();
      await processWaitlistForMatch(row.match_id).catch((error) => {
        console.error('[WAITLIST] Error tras cancelar entrada Stripe:', error);
      });
      return res.json({
        ok: true,
        msg: `Entrada cancelada sin reembolso.${earnsLateWarning ? ` Aviso Plus ${warningStatus.warningCount}/3.` : ''}`,
        pct: 0,
        refundedAmount: 0,
        plusWarningCount: warningStatus.warningCount,
        plusBenefitsSuspended: warningStatus.suspended,
      });
    }

    const session = await stripe.checkout.sessions.retrieve(row.stripe_session_id, {
      expand: ['payment_intent.latest_charge'],
    });

    const charge = session?.payment_intent?.latest_charge;
    if (!charge) {
      return res.status(400).json({ ok: false, msg: 'Pago no localizable' });
    }

    await conn.beginTransaction();

    const refund = await stripe.refunds.create({ charge: charge.id });

    await conn.query(
      'UPDATE inscriptions SET status="cancelled" WHERE id=? AND user_id=? AND status="confirmed"',
      [inscriptionId, userId]
    );

    await conn.query(
      'UPDATE matches SET spots_taken = GREATEST(spots_taken - 1, 0) WHERE id=?',
      [row.match_id]
    );

    await conn.commit();

    await processWaitlistForMatch(row.match_id).catch((error) => {
      console.error('[WAITLIST] Error tras cancelar entrada Stripe:', error);
    });

    return res.json({ ok: true, msg: 'Entrada cancelada con reembolso', pct, refund_id: refund.id });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Error al cancelar la entrada' });
  } finally {
    conn.release();
  }
});

router.post('/inscriptions/:id/cancel', requireAuth, async (req, res) => {
  req.url = `/inscriptions/${req.params.id}/cancel`;
  req.method = 'PATCH';
  return router.handle(req, res);
});

// --- Cancelar (con posible reembolso) ---
router.post('/matches/:id/cancel', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const userId = req.user.id;
    const matchId = Number(req.params.id);

    // Traer inscripción + datos de partido
    const [[row]] = await conn.query(
      `SELECT COUNT(*) AS inscription_count,
              MIN(i.id) AS inscription_id,
              MAX(i.status) AS status,
              MAX(i.stripe_session_id) AS stripe_session_id,
              MAX(i.ticket_type) AS ticket_type,
              MAX(i.payment_type) AS payment_type,
              m.starts_at,
              m.id AS match_id,
              m.title,
              m.city,
              COALESCE(m.location_id, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END) AS location_id,
              COALESCE(m.easypass_cost, 1) AS easypass_cost
              ,EXISTS(
                SELECT 1 FROM user_plus_subscriptions ups
                WHERE ups.user_id = i.user_id
                  AND ups.status IN ('active', 'trialing')
                  AND (ups.current_period_end IS NULL OR ups.current_period_end > NOW())
              ) AS is_plus
       FROM inscriptions i
       JOIN matches m ON m.id = i.match_id
       WHERE i.user_id=?
         AND i.match_id=?
         AND i.status NOT IN ('cancelled','canceled')`,
      [userId, matchId]
    );

    if (!row) return res.status(404).json({ ok:false, msg:'No estabas inscrito' });

    const inscriptionCount = Number(row.inscription_count || 0);
    if (inscriptionCount <= 0) return res.status(404).json({ ok:false, msg:'No estabas inscrito' });

    if (hasMatchStarted(row.starts_at)) {
      return res.status(400).json({ ok:false, msg:'No se puede cancelar después de comenzar el partido' });
    }

    // Si está pending (no pagado), borrar y liberar plaza si se había sumado (no debería)
    if (row.status === 'pending') {
      await conn.beginTransaction();
      await conn.query('DELETE FROM inscriptions WHERE user_id=? AND match_id=? AND status="pending"', [userId, matchId]);
      // por seguridad, no tocamos spots_taken aquí (pending no suma)
      await conn.commit();
      return res.json({ ok:true, msg:'Inscripción cancelada (pendiente, sin pago)' });
    }

    // Si estaba confirmado, calcular política
    if (row.status === 'confirmed') {

      const fairPlay = await getPlusFairPlayStatus(conn, userId);
      row.is_plus = fairPlay.eligible;
      const earnsLateWarning = fairPlay.eligible && hoursUntil(row.starts_at) <= 4;

      const isEasyPassInscription = !row.stripe_session_id && (
        row.payment_type === 'easypass' ||
        row.ticket_type === 'credit' ||
        row.ticket_type === 'easypass' ||
        row.ticket_type === 'white' ||
        row.ticket_type === 'black'
      );

      if (isEasyPassInscription) {
        const pct = refundPercent(row.starts_at, Boolean(row.is_plus));
        await conn.beginTransaction();

        const fallbackLocation = getFallbackLocationFromCity(row.city);
        const locationId = Number(row.location_id || fallbackLocation.id);
        const locationName = await getLocationName(conn, locationId, fallbackLocation.name);
        const easyPassCost = Math.max(1, Number(row.easypass_cost || 1));
        const refundAmount = easyPassCost * inscriptionCount;

        // devolver EasyPass a la localización correcta del partido
        if (pct > 0) {
          await conn.query(
            `INSERT INTO user_easypass_balances (user_id, location_id, balance)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)`,
            [userId, locationId, refundAmount]
          );

          // mantener saldo global antiguo sincronizado como total visible/compatibilidad
          await conn.query(
            'UPDATE users SET easypass_balance = COALESCE(easypass_balance, 0) + ? WHERE id=?',
            [refundAmount, userId]
          );

          await conn.query(
            `INSERT INTO easypass_transactions (user_id, type, amount, description, event_id, created_at)
             VALUES (?, 'refund', ?, ?, ?, NOW())`,
            [userId, refundAmount, `Cancelación con devolución de ${refundAmount} EasyPass de ${locationName}`, matchId]
          );
        }

        // cancelar inscripción
        await conn.query(
          'UPDATE inscriptions SET status="cancelled" WHERE user_id=? AND match_id=? AND status NOT IN ("cancelled","canceled")',
          [userId, matchId]
        );

        // liberar plaza del partido
        await conn.query(
          'UPDATE matches SET spots_taken = GREATEST(spots_taken - ?, 0) WHERE id=?',
          [inscriptionCount, matchId]
        );

        const warningStatus = earnsLateWarning
          ? await addPlusFairPlayWarning(conn, { userId, inscriptionId: row.inscription_id, matchId, reason: 'late_cancellation' })
          : fairPlay;

        const [[updatedUser]] = await conn.query(
          'SELECT easypass_balance AS easyPassBalance FROM users WHERE id=? LIMIT 1',
          [userId]
        );

        await conn.commit();

        await processWaitlistForMatch(matchId).catch((error) => {
          console.error('[WAITLIST] Error tras cancelar entradas:', error);
        });

        return res.json({
          ok:true,
          msg: pct > 0
            ? `Cancelada y ${refundAmount} EasyPass de ${locationName} devuelto(s)`
            : `Entradas canceladas sin devolución.${earnsLateWarning ? ` Aviso Plus ${warningStatus.warningCount}/3.` : ''}`,
          pct,
          refundedEasyPass: pct > 0 ? refundAmount : 0,
          location_id: locationId,
          locationId,
          locationName,
          easyPassBalance: Number(updatedUser?.easyPassBalance || 0),
          plusWarningCount: warningStatus.warningCount,
          plusBenefitsSuspended: warningStatus.suspended,
        });
      }

      const pct = refundPercent(row.starts_at, Boolean(row.is_plus));
      if (!row.stripe_session_id) {
        console.warn('Cancelación sin stripe_session_id y no detectada como EasyPass', {
          userId,
          matchId,
          status: row.status,
          payment_type: row.payment_type,
          ticket_type: row.ticket_type,
          inscriptionCount,
        });
        return res.status(400).json({ ok:false, msg:'No se encontró el pago en Stripe ni se pudo detectar como EasyPass' });
      }
      if (pct === 0) {
        await conn.beginTransaction();
        await conn.query('UPDATE inscriptions SET status="cancelled" WHERE user_id=? AND match_id=? AND status NOT IN ("cancelled","canceled")', [userId, matchId]);
        await conn.query('UPDATE matches SET spots_taken = GREATEST(spots_taken - ?, 0) WHERE id=?', [inscriptionCount, matchId]);
        const warningStatus = earnsLateWarning
          ? await addPlusFairPlayWarning(conn, { userId, inscriptionId: row.inscription_id, matchId, reason: 'late_cancellation' })
          : fairPlay;
        await conn.commit();
        await processWaitlistForMatch(matchId).catch((error) => {
          console.error('[WAITLIST] Error tras cancelar entradas Stripe:', error);
        });
        return res.json({
          ok:true,
          msg:`Canceladas ${inscriptionCount} plaza(s) sin reembolso.${earnsLateWarning ? ` Aviso Plus ${warningStatus.warningCount}/3.` : ''}`,
          pct:0,
          refundedAmount:0,
          plusWarningCount:warningStatus.warningCount,
          plusBenefitsSuspended:warningStatus.suspended,
        });
      }

      // Obtener charge desde la sesión
      const session = await stripe.checkout.sessions.retrieve(row.stripe_session_id, {
        expand: ['payment_intent.latest_charge']
      });
      const charge = session?.payment_intent?.latest_charge;
      if (!charge) return res.status(400).json({ ok:false, msg:'Pago no localizable' });

      const refundAmount = Math.round((charge.amount_captured || 0) * (pct/100));

      await conn.beginTransaction();

      // Crear reembolso en Stripe
      const refund = await stripe.refunds.create({ charge: charge.id, amount: refundAmount });

      // Marcar cancelada y liberar plaza
      await conn.query('UPDATE inscriptions SET status="cancelled" WHERE user_id=? AND match_id=? AND status NOT IN ("cancelled","canceled")', [userId, matchId]);
      await conn.query(
        'UPDATE matches SET spots_taken = GREATEST(spots_taken - ?, 0) WHERE id=?',
        [inscriptionCount, matchId]
      );

      await conn.commit();

      await processWaitlistForMatch(matchId).catch((error) => {
        console.error('[WAITLIST] Error tras cancelar entradas Stripe:', error);
      });

      return res.json({ ok:true, msg:`Canceladas ${inscriptionCount} plaza(s) con reembolso`, pct, refund_id: refund.id });
    }

    // Ya estaba cancelada
    return res.status(400).json({ ok:false, msg:'Ya estaba cancelada' });

  } catch (e) {
    await conn.rollback();
    console.error(e);
    return res.status(500).json({ ok:false, msg:'Error al cancelar' });
  } finally {
    conn.release();
  }
});

export default router;
