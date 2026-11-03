import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import {
  acceptExtraInvitation,
  declineExtraInvitation,
  getActiveExtraInvitation,
  joinWaitlist,
  leaveWaitlist,
  processWaitlistForMatch,
  WaitlistError,
} from '../services/waitlistService.js';
import { WAITLIST_AUTO_ENTRY_CUTOFF_HOURS } from '../services/waitlistPolicyService.js';
import { getPlusFairPlayStatus } from '../services/plusFairPlayService.js';

const router = Router();

const serialize = (row, extraInvitation = null) => ({
  joined: ['waiting', 'offered'].includes(row?.status),
  status: row?.status || null,
  position: row?.position ? Number(row.position) : null,
  is_plus: Boolean(row?.is_plus_snapshot),
  held_easypass: Number(row?.held_easypass || 0),
  preferred_ticket_type: row?.preferred_ticket_type || null,
  cutoff_hours: WAITLIST_AUTO_ENTRY_CUTOFF_HOURS,
  offer_expires_at: row?.offer_expires_at || null,
  offer_active: row?.status === 'offered' && new Date(row.offer_expires_at).getTime() > Date.now(),
  extra_invitation: extraInvitation,
});

const WAITLIST_POSITION_SQL = `CASE WHEN mw.status = 'waiting' THEN (
                SELECT COUNT(*) + 1 FROM match_waitlist ahead
                WHERE ahead.match_id = mw.match_id AND ahead.status = 'waiting'
                  AND (ahead.is_plus_snapshot > mw.is_plus_snapshot
                    OR (ahead.is_plus_snapshot = mw.is_plus_snapshot AND ahead.created_at < mw.created_at))
              ) ELSE NULL END AS position`;

const sendWaitlistError = (res, error, label, fallbackMsg) => {
  if (error instanceof WaitlistError) {
    return res.status(error.status).json({ ok: false, code: error.code, msg: error.message, ...error.extra });
  }
  console.error(label, error);
  return res.status(500).json({ ok: false, msg: fallbackMsg });
};

router.get('/matches/:id/waitlist', requireAuth, async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const userId = req.user.id;
    const [[entry]] = await pool.query(
      `SELECT mw.*, ${WAITLIST_POSITION_SQL}
       FROM match_waitlist mw
       WHERE mw.match_id = ? AND mw.user_id = ? AND mw.status IN ('waiting','offered')
       LIMIT 1`,
      [matchId, userId]
    );
    const invitation = entry?.status === 'waiting'
      ? await getActiveExtraInvitation(pool, { sourceMatchId: matchId, userId })
      : null;
    return res.json({ ok: true, data: serialize(entry, invitation) });
  } catch (error) {
    console.error('[GET waitlist]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudo consultar la lista de espera' });
  }
});

router.post('/matches/:id/waitlist', requireAuth, async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const userId = req.user.id;
    if (req.body?.notifications_consent !== true) {
      return res.status(400).json({ ok: false, msg: 'Debes aceptar las notificaciones para entrar en la lista de espera' });
    }

    const [[token]] = await pool.query(
      'SELECT 1 AS available FROM push_tokens WHERE user_id = ? AND is_active = 1 LIMIT 1',
      [userId]
    );
    if (!token) return res.status(400).json({ ok: false, code: 'PUSH_REQUIRED', msg: 'Activa las notificaciones para entrar en la lista de espera' });

    // Las versiones antiguas de la app no avisan de la retención: no se cobra sin ese aviso.
    if (req.body?.easypass_hold_consent !== true) {
      return res.status(400).json({ ok: false, code: 'HOLD_CONSENT_REQUIRED', msg: 'Actualiza la app para entrar en la lista de espera' });
    }

    const plus = await getPlusFairPlayStatus(pool, userId);
    const requestedColor = req.body?.ticketType;
    await joinWaitlist({
      matchId,
      userId,
      isPlus: plus.eligible,
      preferredTicketType: ['white', 'black'].includes(requestedColor) ? requestedColor : null,
    });

    await processWaitlistForMatch(matchId).catch((error) => {
      console.error('[WAITLIST] Error tras entrar en la lista:', error);
    });
    const [[entry]] = await pool.query(
      `SELECT mw.*, ${WAITLIST_POSITION_SQL} FROM match_waitlist mw WHERE mw.match_id = ? AND mw.user_id = ? LIMIT 1`,
      [matchId, userId]
    );
    return res.json({
      ok: true,
      data: serialize(entry),
      msg: entry?.status === 'claimed'
        ? '¡Había una plaza libre y ya es tuya!'
        : `Estás en la lista. Te hemos retenido ${Number(entry?.held_easypass || 0)} EasyPass.`,
    });
  } catch (error) {
    return sendWaitlistError(res, error, '[POST waitlist]', 'No se pudo entrar en la lista de espera');
  }
});

router.delete('/matches/:id/waitlist', requireAuth, async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const { refunded } = await leaveWaitlist({ matchId, userId: req.user.id });
    await processWaitlistForMatch(matchId).catch((error) => {
      console.error('[WAITLIST] Error tras salir de la lista:', error);
    });
    return res.json({
      ok: true,
      refundedEasyPass: refunded,
      msg: refunded > 0
        ? `Has salido de la lista y te hemos devuelto ${refunded} EasyPass`
        : 'Has salido de la lista de espera',
    });
  } catch (error) {
    return sendWaitlistError(res, error, '[DELETE waitlist]', 'No se pudo salir de la lista de espera');
  }
});

router.post('/waitlist/extra-invitations/:id/accept', requireAuth, async (req, res) => {
  try {
    const requestedColor = req.body?.ticketType;
    const result = await acceptExtraInvitation({
      invitationId: Number(req.params.id),
      userId: req.user.id,
      preferredTicketType: ['white', 'black'].includes(requestedColor) ? requestedColor : null,
    });
    return res.json({ ok: true, ...result, msg: '¡Estás dentro del partido extra!' });
  } catch (error) {
    return sendWaitlistError(res, error, '[ACCEPT extra invitation]', 'No se pudo aceptar la invitación');
  }
});

router.post('/waitlist/extra-invitations/:id/decline', requireAuth, async (req, res) => {
  try {
    const declined = await declineExtraInvitation({ invitationId: Number(req.params.id), userId: req.user.id });
    if (!declined) return res.status(404).json({ ok: false, msg: 'Esta invitación ya no está disponible' });
    return res.json({ ok: true, msg: 'Invitación rechazada. Sigues en la lista de espera.' });
  } catch (error) {
    return sendWaitlistError(res, error, '[DECLINE extra invitation]', 'No se pudo rechazar la invitación');
  }
});

export default router;
