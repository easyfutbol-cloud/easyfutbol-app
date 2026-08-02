// src/routes/adminNotify.js
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import { pool } from '../config/db.js';
import { getCityPushTokens, getMatchPushTokens, getUserPushToken, sendExpoPush } from '../services/push.js';
import { sendMatchReminders } from '../services/reminderService.js';

const router = Router();

router.get('/admin/notify/options', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [locations] = await pool.query(
      `SELECT id, name, slug
       FROM locations
       WHERE active = 1
       ORDER BY name ASC`
    );
    const [matches] = await pool.query(
      `SELECT m.id, m.title, m.city, m.starts_at, m.status, f.name AS field_name
       FROM matches m
       LEFT JOIN fields f ON f.id = m.field_id
       WHERE m.status <> 'cancelled'
         AND m.starts_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       ORDER BY m.starts_at DESC
       LIMIT 100`
    );
    return res.json({ ok: true, data: { locations, matches } });
  } catch (e) {
    console.error('Error cargando opciones de notificación', e);
    return res.status(500).json({ ok: false, msg: 'Error cargando destinatarios' });
  }
});

/** Enviar aviso a todos los jugadores de una sede/ciudad preferida. */
router.post('/admin/notify/city/:slug', requireAuth, requireAdmin, async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    const { title, body, data } = req.body || {};
    if (!slug) return res.status(400).json({ ok: false, msg: 'Falta la ciudad' });
    if (!title?.trim() || !body?.trim()) return res.status(400).json({ ok: false, msg: 'Título y mensaje son obligatorios' });

    const [[location]] = await pool.query(
      'SELECT id, name, slug FROM locations WHERE LOWER(slug) = ? AND active = 1 LIMIT 1',
      [slug]
    );
    if (!location) return res.status(404).json({ ok: false, msg: 'Ciudad no encontrada' });

    const tokens = await getCityPushTokens(location.slug);
    const { sent } = await sendExpoPush(tokens, title.trim(), body.trim(), {
      type: 'city',
      locationId: Number(location.id),
      locationSlug: location.slug,
      ...(data || {}),
    });
    return res.json({ ok: true, sent, tokens: tokens.length, target: location.name });
  } catch (e) {
    console.error('Error enviando notificación por ciudad', e);
    return res.status(500).json({ ok: false, msg: 'Error enviando notificación' });
  }
});

/** Enviar aviso a TODOS los confirmados de un partido */
router.post('/admin/notify/match/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const { title, body, data } = req.body || {};
    if (!Number.isInteger(matchId) || matchId <= 0) return res.status(400).json({ ok:false, msg:'Partido inválido' });
    if (!title?.trim() || !body?.trim()) return res.status(400).json({ ok:false, msg:'Título y mensaje son obligatorios' });

    const [[match]] = await pool.query('SELECT id, title FROM matches WHERE id = ? LIMIT 1', [matchId]);
    if (!match) return res.status(404).json({ ok: false, msg: 'Partido no encontrado' });

    const tokens = await getMatchPushTokens(matchId);
    const { sent } = await sendExpoPush(tokens, title.trim(), body.trim(), { type: 'match', matchId, screen: 'Match', ...(data || {}) });

    res.json({ ok:true, sent, tokens: tokens.length, target: match.title });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error enviando notificación' });
  }
});

/** Lanzar manualmente los recordatorios de partidos (4h antes por defecto) */
router.post('/admin/notify/send-reminders', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { hoursAhead, windowMinutes } = req.body || {};

    const result = await sendMatchReminders({
      hoursAhead: Number.isFinite(Number(hoursAhead)) ? Number(hoursAhead) : 4,
      windowMinutes: Number.isFinite(Number(windowMinutes)) ? Number(windowMinutes) : 10,
    });

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error enviando recordatorios' });
  }
});

/** Enviar aviso a un usuario concreto */
router.post('/admin/notify/user/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const { title, body, data } = req.body || {};
    if (!title || !body) return res.status(400).json({ ok:false, msg:'Faltan title y body' });

    const token = await getUserPushToken(userId);
    if (!token) return res.status(404).json({ ok:false, msg:'Usuario sin token push' });

    const { sent } = await sendExpoPush([token], title, body, { type: 'direct', userId, ...(data || {}) });
    res.json({ ok:true, sent });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error enviando notificación' });
  }
});

export default router;
