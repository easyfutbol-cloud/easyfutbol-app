// Qué apartados de la app usan los jugadores. Montado en /api
import express from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import { madridCalendarDate } from '../services/rankingScope.js';
import { buildFeatureUsage, isTrackableFeature } from '../services/featureUsageRules.js';

const router = express.Router();

const NOT_ADMIN = "COALESCE(u.role, 'player') <> 'admin'";

const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, msg: 'Demasiadas solicitudes. Prueba de nuevo en unos minutos.' },
});

/** POST /api/me/feature-usage — body { feature }. Una fila por jugador, apartado y día. */
router.post('/me/feature-usage', requireAuth, trackLimiter, async (req, res) => {
  try {
    const feature = req.body?.feature;
    if (!isTrackableFeature(feature)) return res.status(400).json({ ok: false, msg: 'Apartado inválido' });
    await pool.query(
      'INSERT IGNORE INTO feature_usage_daily (user_id, feature, used_on) VALUES (?, ?, ?)',
      [req.user.id, feature, madridCalendarDate()]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('[POST /me/feature-usage]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudo registrar el uso' });
  }
});

// Lo que ya queda guardado cuando un jugador usa cada apartado.
const ACTIONS_SQL = `
  SELECT 'social' AS feature, 'friend_requests' AS action, requester_id AS user_id FROM friendships WHERE created_at >= ?
  UNION ALL SELECT 'social', 'friend_accepts', addressee_id FROM friendships WHERE status = 'accepted' AND updated_at >= ?
  UNION ALL SELECT 'social', 'match_invites', sender_id FROM match_invitations WHERE created_at >= ?
  UNION ALL SELECT 'social', 'friend_groups', owner_id FROM friend_groups WHERE created_at >= ?
  UNION ALL SELECT 'friend_leagues', 'leagues_created', owner_id FROM friend_leagues WHERE created_at >= ?
  UNION ALL SELECT 'friend_leagues', 'leagues_joined', m.user_id FROM friend_league_members m
    JOIN friend_leagues l ON l.id = m.league_id
    WHERE m.status = 'accepted' AND m.user_id <> l.owner_id AND m.created_at >= ?
  UNION ALL SELECT 'player_profiles', 'profile_views', viewer_user_id FROM profile_views WHERE viewed_on >= ?
  UNION ALL SELECT 'player_profiles', 'profile_comments', author_user_id FROM player_profile_comments WHERE created_at >= ?
  UNION ALL SELECT 'player_profiles', 'profile_reactions', reactor_user_id FROM player_profile_reactions WHERE created_at >= ?
  UNION ALL SELECT 'my_profile', 'profile_photos', user_id FROM player_profile_photos WHERE created_at >= ?
  UNION ALL SELECT 'weekly_lineup', 'lineup_votes', user_id FROM weekly_lineup_votes WHERE created_at >= ?
  UNION ALL SELECT 'easypoints_shop', 'shop_purchases', user_id FROM easypoints_ledger WHERE source_type = 'purchase' AND created_at >= ?
  UNION ALL SELECT 'match_reviews', 'reviews', user_id FROM match_feedback WHERE dismissed = 0 AND created_at >= ?`;
const ACTIONS_PARAMS = 13;

/** GET /api/admin/feature-usage?days=30 — jugadores que usan cada apartado. Sin cuentas de admin. */
router.get('/admin/feature-usage', requireAuth, requireAdmin, async (req, res) => {
  try {
    const days = Math.min(180, Math.max(7, Number.parseInt(req.query.days, 10) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sinceDay = since.toISOString().slice(0, 10);

    const [visitRows] = await pool.query(
      `SELECT d.feature, COUNT(DISTINCT d.user_id) AS users, COUNT(*) AS user_days
       FROM feature_usage_daily d JOIN users u ON u.id = d.user_id
       WHERE d.used_on >= ? AND ${NOT_ADMIN}
       GROUP BY d.feature`,
      [sinceDay]
    );
    const [actionRows] = await pool.query(
      `SELECT a.feature, a.action, a.user_id, COUNT(*) AS events
       FROM (${ACTIONS_SQL}) a JOIN users u ON u.id = a.user_id
       WHERE ${NOT_ADMIN}
       GROUP BY a.feature, a.action, a.user_id`,
      Array(ACTIONS_PARAMS).fill(since)
    );
    const [[tracking]] = await pool.query('SELECT MIN(used_on) AS since FROM feature_usage_daily');
    const [[totals]] = await pool.query(
      `SELECT
         (SELECT COUNT(DISTINCT x.user_id) FROM (
            SELECT requester_id AS user_id FROM friendships WHERE status = 'accepted'
            UNION ALL SELECT addressee_id FROM friendships WHERE status = 'accepted'
          ) x JOIN users u ON u.id = x.user_id WHERE ${NOT_ADMIN}) AS with_friends,
         (SELECT COUNT(DISTINCT m.user_id) FROM friend_league_members m
            JOIN friend_leagues l ON l.id = m.league_id JOIN users u ON u.id = m.user_id
            WHERE m.status = 'accepted' AND l.status = 'active' AND ${NOT_ADMIN}) AS in_active_league`
    );

    return res.json({
      ok: true,
      days,
      tracking_since: tracking?.since || null,
      with_friends: Number(totals.with_friends || 0),
      in_active_league: Number(totals.in_active_league || 0),
      ...buildFeatureUsage(visitRows, actionRows),
    });
  } catch (error) {
    console.error('[GET /admin/feature-usage]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudieron cargar los datos de uso' });
  }
});

export default router;
