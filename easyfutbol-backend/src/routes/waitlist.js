import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { processWaitlistForMatch } from '../services/waitlistService.js';

const router = Router();

const serialize = (row) => ({
  joined: Boolean(row),
  status: row?.status || null,
  position: row?.position ? Number(row.position) : null,
  is_plus: Boolean(row?.is_plus_snapshot),
  offer_expires_at: row?.offer_expires_at || null,
  offer_active: row?.status === 'offered' && new Date(row.offer_expires_at).getTime() > Date.now(),
});

router.get('/matches/:id/waitlist', requireAuth, async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const userId = req.user.id;
    const [[entry]] = await pool.query(
      `SELECT mw.*,
              CASE WHEN mw.status = 'waiting' THEN (
                SELECT COUNT(*) + 1 FROM match_waitlist ahead
                WHERE ahead.match_id = mw.match_id AND ahead.status = 'waiting'
                  AND (ahead.is_plus_snapshot > mw.is_plus_snapshot
                    OR (ahead.is_plus_snapshot = mw.is_plus_snapshot AND ahead.created_at < mw.created_at))
              ) ELSE NULL END AS position
       FROM match_waitlist mw
       WHERE mw.match_id = ? AND mw.user_id = ? AND mw.status IN ('waiting','offered')
       LIMIT 1`,
      [matchId, userId]
    );
    return res.json({ ok: true, data: serialize(entry) });
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

    const [[match]] = await pool.query(
      'SELECT id, starts_at, capacity, spots_taken, status FROM matches WHERE id = ? LIMIT 1',
      [matchId]
    );
    if (!match || new Date(match.starts_at).getTime() <= Date.now()) return res.status(400).json({ ok: false, msg: 'Este partido ya no admite lista de espera' });

    const [[activeOffers]] = await pool.query(
      `SELECT COUNT(*) AS count FROM match_waitlist
       WHERE match_id = ? AND status='offered' AND offer_expires_at > NOW()`,
      [matchId]
    );
    const effectiveFreeSpots = Number(match.capacity || 0) - Number(match.spots_taken || 0) - Number(activeOffers?.count || 0);
    if (effectiveFreeSpots > 0) {
      return res.status(409).json({ ok: false, msg: 'Ahora mismo hay una plaza disponible; puedes reservarla directamente' });
    }

    const [[inscription]] = await pool.query(
      `SELECT id FROM inscriptions WHERE match_id = ? AND user_id = ? AND status IN ('pending','confirmed') LIMIT 1`,
      [matchId, userId]
    );
    if (inscription) return res.status(409).json({ ok: false, msg: 'Ya tienes una entrada para este partido' });

    const [[plus]] = await pool.query(
      `SELECT 1 AS active FROM user_plus_subscriptions
       WHERE user_id = ? AND status IN ('active','trialing')
         AND (current_period_end IS NULL OR current_period_end > NOW()) LIMIT 1`,
      [userId]
    );

    await pool.query(
      `INSERT INTO match_waitlist
         (match_id, user_id, status, is_plus_snapshot, notifications_consent_at, notified_at, offer_expires_at)
       VALUES (?, ?, 'waiting', ?, NOW(), NULL, NULL)
       ON DUPLICATE KEY UPDATE status='waiting', is_plus_snapshot=VALUES(is_plus_snapshot),
         notifications_consent_at=NOW(), notified_at=NULL, offer_expires_at=NULL`,
      [matchId, userId, plus ? 1 : 0]
    );

    await processWaitlistForMatch(matchId);
    const [[entry]] = await pool.query(
      `SELECT * FROM match_waitlist WHERE match_id = ? AND user_id = ? LIMIT 1`,
      [matchId, userId]
    );
    return res.json({ ok: true, data: serialize(entry), msg: 'Ya estás en la lista de espera' });
  } catch (error) {
    console.error('[POST waitlist]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudo entrar en la lista de espera' });
  }
});

router.delete('/matches/:id/waitlist', requireAuth, async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    await pool.query(
      `UPDATE match_waitlist SET status='cancelled', offer_expires_at=NULL
       WHERE match_id = ? AND user_id = ? AND status IN ('waiting','offered')`,
      [matchId, req.user.id]
    );
    await processWaitlistForMatch(matchId);
    return res.json({ ok: true, msg: 'Has salido de la lista de espera' });
  } catch (error) {
    console.error('[DELETE waitlist]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudo salir de la lista de espera' });
  }
});

export default router;
