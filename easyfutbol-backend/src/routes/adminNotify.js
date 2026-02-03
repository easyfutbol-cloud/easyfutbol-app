// src/routes/adminNotify.js
import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import { getMatchPushTokens, getUserPushToken, sendExpoPush } from '../services/push.js';

const router = Router();

/** Enviar aviso a TODOS los confirmados de un partido */
router.post('/admin/notify/match/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    const { title, body, data } = req.body || {};
    if (!title || !body) return res.status(400).json({ ok:false, msg:'Faltan title y body' });

    const tokens = await getMatchPushTokens(matchId);
    const { sent } = await sendExpoPush(tokens, title, body, { type: 'match', matchId, ...(data || {}) });

    res.json({ ok:true, sent, tokens: tokens.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error enviando notificación' });
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
