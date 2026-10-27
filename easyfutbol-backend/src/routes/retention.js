// Valoración rápida del partido y panel de retención del admin.
// Montado en /api
import express from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

const ACTIVE_INSCRIPTION = "i.status IN ('confirmed','paid','active')";
const TEAMS_VALUES = new Set(['balanced', 'so_so', 'unbalanced']);
// Solo se pide valorar los partidos de los últimos 4 días.
const FEEDBACK_WINDOW_DAYS = 4;

const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, msg: 'Demasiadas solicitudes. Prueba de nuevo en unos minutos.' },
});

function rating(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : undefined;
}

/** GET /api/me/match-feedback/pending — último partido jugado sin valorar, o null. */
router.get('/me/match-feedback/pending', requireAuth, async (req, res) => {
  try {
    const [[match]] = await pool.query(
      `SELECT m.id, m.title, m.starts_at, f.name AS field_name
       FROM inscriptions i
       JOIN matches m ON m.id = i.match_id
       LEFT JOIN fields f ON f.id = m.field_id
       LEFT JOIN match_feedback mf ON mf.match_id = m.id AND mf.user_id = ?
       WHERE ${ACTIVE_INSCRIPTION} AND COALESCE(i.assigned_user_id, i.user_id) = ?
         AND m.status <> 'cancelled'
         AND DATE_ADD(m.starts_at, INTERVAL COALESCE(m.duration_min, 60) MINUTE) <= NOW()
         AND m.starts_at >= DATE_SUB(NOW(), INTERVAL ${FEEDBACK_WINDOW_DAYS} DAY)
         AND mf.match_id IS NULL
       ORDER BY m.starts_at DESC
       LIMIT 1`,
      [req.user.id, req.user.id]
    );
    return res.json({ ok: true, match: match || null });
  } catch (error) {
    console.error('[GET /me/match-feedback/pending]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudo cargar la valoración' });
  }
});

/**
 * POST /api/matches/:id/feedback
 * body { teams_balance?, organizer_rating?, field_rating?, comment?, dismissed? }
 */
router.post('/matches/:id/feedback', requireAuth, feedbackLimiter, async (req, res) => {
  try {
    const matchId = Number(req.params.id);
    if (!Number.isInteger(matchId) || matchId <= 0) return res.status(400).json({ ok: false, msg: 'Partido inválido' });

    const dismissed = req.body?.dismissed === true;
    const teams = req.body?.teams_balance ?? null;
    const organizer = rating(req.body?.organizer_rating);
    const field = rating(req.body?.field_rating);
    const comment = String(req.body?.comment || '').trim().slice(0, 500) || null;
    if ((teams !== null && !TEAMS_VALUES.has(teams)) || organizer === undefined || field === undefined) {
      return res.status(400).json({ ok: false, msg: 'Valoración inválida' });
    }
    if (!dismissed && teams === null && organizer === null && field === null && !comment) {
      return res.status(400).json({ ok: false, msg: 'Responde al menos una pregunta' });
    }

    const [[access]] = await pool.query(
      `SELECT 1 AS found FROM inscriptions i JOIN matches m ON m.id = i.match_id
       WHERE i.match_id = ? AND ${ACTIVE_INSCRIPTION} AND COALESCE(i.assigned_user_id, i.user_id) = ?
         AND m.starts_at <= NOW()
       LIMIT 1`,
      [matchId, req.user.id]
    );
    if (!access) return res.status(403).json({ ok: false, msg: 'Solo pueden valorar quienes jugaron el partido' });

    await pool.query(
      `INSERT INTO match_feedback (match_id, user_id, teams_balance, organizer_rating, field_rating, comment, dismissed)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE teams_balance = VALUES(teams_balance), organizer_rating = VALUES(organizer_rating),
         field_rating = VALUES(field_rating), comment = VALUES(comment), dismissed = VALUES(dismissed)`,
      [matchId, req.user.id, dismissed ? null : teams, dismissed ? null : organizer, dismissed ? null : field, dismissed ? null : comment, dismissed ? 1 : 0]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('[POST /matches/:id/feedback]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudo guardar la valoración' });
  }
});

const pct = (part, total) => (Number(total) ? Math.round((Number(part) / Number(total)) * 1000) / 10 : null);
const avg = (value) => (value === null || value === undefined ? null : Math.round(Number(value) * 10) / 10);

/** GET /api/admin/retention?days=30 — valoraciones y efecto de cada aviso. */
router.get('/admin/retention', requireAuth, requireAdmin, async (req, res) => {
  try {
    const days = Math.min(180, Math.max(7, Number.parseInt(req.query.days, 10) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [[feedback]] = await pool.query(
      `SELECT COUNT(*) AS responses,
              AVG(organizer_rating) AS organizer_avg,
              AVG(field_rating) AS field_avg,
              SUM(teams_balance = 'balanced') AS balanced,
              SUM(teams_balance = 'so_so') AS so_so,
              SUM(teams_balance = 'unbalanced') AS unbalanced
       FROM match_feedback WHERE dismissed = 0 AND created_at >= ?`,
      [since]
    );
    // Jugadores que podían valorar (jugaron en el periodo, ya terminado) para la tasa de respuesta.
    const [[eligible]] = await pool.query(
      `SELECT COUNT(DISTINCT m.id, COALESCE(i.assigned_user_id, i.user_id)) AS total
       FROM inscriptions i JOIN matches m ON m.id = i.match_id
       WHERE ${ACTIVE_INSCRIPTION} AND m.status <> 'cancelled' AND m.starts_at >= ? AND m.starts_at <= NOW()`,
      [since]
    );
    const [byField] = await pool.query(
      `SELECT COALESCE(f.name, 'Sin campo') AS field_name, COUNT(*) AS responses,
              AVG(mf.field_rating) AS field_avg, AVG(mf.organizer_rating) AS organizer_avg,
              SUM(mf.teams_balance = 'unbalanced') AS unbalanced
       FROM match_feedback mf JOIN matches m ON m.id = mf.match_id LEFT JOIN fields f ON f.id = m.field_id
       WHERE mf.dismissed = 0 AND mf.created_at >= ?
       GROUP BY f.id, f.name ORDER BY responses DESC`,
      [since]
    );
    const [comments] = await pool.query(
      `SELECT mf.comment, mf.organizer_rating, mf.field_rating, mf.teams_balance, mf.created_at,
              m.title AS match_title, m.starts_at, u.name AS user_name
       FROM match_feedback mf JOIN matches m ON m.id = mf.match_id JOIN users u ON u.id = mf.user_id
       WHERE mf.dismissed = 0 AND mf.comment IS NOT NULL AND mf.created_at >= ?
       ORDER BY mf.created_at DESC LIMIT 20`,
      [since]
    );
    // ¿Vuelven a jugar en 14 días según cómo valoraron? Solo partidos de hace 14+ días.
    const [returnBySentiment] = await pool.query(
      `SELECT CASE
                WHEN mf.teams_balance = 'unbalanced' THEN 'Equipos descompensados'
                WHEN LEAST(COALESCE(mf.organizer_rating, 5), COALESCE(mf.field_rating, 5)) <= 2 THEN 'Organizador o campo ≤ 2★'
                ELSE 'Buena experiencia'
              END AS bucket,
              COUNT(*) AS players,
              SUM(EXISTS (
                SELECT 1 FROM inscriptions i2 JOIN matches m2 ON m2.id = i2.match_id
                WHERE i2.status IN ('confirmed','paid','active') AND COALESCE(i2.assigned_user_id, i2.user_id) = mf.user_id
                  AND m2.status <> 'cancelled' AND m2.starts_at > m.starts_at
                  AND m2.starts_at <= DATE_ADD(m.starts_at, INTERVAL 14 DAY)
              )) AS returned
       FROM match_feedback mf JOIN matches m ON m.id = mf.match_id
       WHERE mf.dismissed = 0 AND m.starts_at >= ? AND m.starts_at <= DATE_SUB(NOW(), INTERVAL 14 DAY)
       GROUP BY bucket`,
      [new Date(since.getTime() - 14 * 24 * 60 * 60 * 1000)]
    );

    // Avisos de retención: enviados y cuántos acabaron en partido (7 días).
    const [nudges] = await pool.query(
      `SELECT sn.type, COUNT(*) AS sent,
              SUM(CASE
                WHEN sn.type IN ('slot_alert','friend_joined') THEN EXISTS (
                  SELECT 1 FROM inscriptions i WHERE i.match_id = sn.entity_id AND i.status IN ('confirmed','paid','active')
                    AND COALESCE(i.assigned_user_id, i.user_id) = sn.user_id AND i.created_at >= sn.created_at)
                WHEN sn.type = 'idle_balance' THEN EXISTS (
                  SELECT 1 FROM easypass_transactions t WHERE t.user_id = sn.user_id AND t.type = 'spend'
                    AND t.created_at >= sn.created_at AND t.created_at <= DATE_ADD(sn.created_at, INTERVAL 7 DAY))
                ELSE EXISTS (
                  SELECT 1 FROM inscriptions i WHERE i.status IN ('confirmed','paid','active')
                    AND COALESCE(i.assigned_user_id, i.user_id) = sn.user_id
                    AND i.created_at >= sn.created_at AND i.created_at <= DATE_ADD(sn.created_at, INTERVAL 7 DAY))
              END) AS converted
       FROM social_notifications sn
       WHERE sn.type IN ('slot_alert','reactivation','idle_balance','friend_joined') AND sn.created_at >= ?
       GROUP BY sn.type`,
      [since]
    );
    // ¿Repiten más los que tienen amigos? Jugadores del periodo según sus amigos.
    const [byFriends] = await pool.query(
      `SELECT CASE WHEN x.friends = 0 THEN '0 amigos' WHEN x.friends < 3 THEN '1-2 amigos' ELSE '3+ amigos' END AS bucket,
              COUNT(*) AS players, SUM(x.matches >= 2) AS repeaters, AVG(x.matches) AS matches_avg
       FROM (
         SELECT p.user_id, COUNT(DISTINCT p.match_id) AS matches,
                (SELECT COUNT(*) FROM friendships f WHERE f.status = 'accepted'
                   AND (f.requester_id = p.user_id OR f.addressee_id = p.user_id)) AS friends
         FROM (
           SELECT DISTINCT COALESCE(i.assigned_user_id, i.user_id) AS user_id, m.id AS match_id
           FROM inscriptions i JOIN matches m ON m.id = i.match_id
           WHERE ${ACTIVE_INSCRIPTION} AND m.status <> 'cancelled' AND m.starts_at >= ? AND m.starts_at <= NOW()
         ) p
         GROUP BY p.user_id
       ) x
       GROUP BY bucket
       ORDER BY FIELD(bucket, '0 amigos', '1-2 amigos', '3+ amigos')`,
      [since]
    );
    // Repetir: jugadores que se apuntan a otro partido en las 24 h tras terminar uno.
    const [[repeat]] = await pool.query(
      `SELECT COUNT(*) AS played,
              SUM(EXISTS (
                SELECT 1 FROM inscriptions i2 WHERE i2.status IN ('confirmed','paid','active')
                  AND COALESCE(i2.assigned_user_id, i2.user_id) = p.user_id AND i2.match_id <> p.match_id
                  AND i2.created_at >= p.ends_at AND i2.created_at <= DATE_ADD(p.ends_at, INTERVAL 24 HOUR)
              )) AS rejoined
       FROM (
         SELECT DISTINCT m.id AS match_id, COALESCE(i.assigned_user_id, i.user_id) AS user_id,
                DATE_ADD(m.starts_at, INTERVAL COALESCE(m.duration_min, 60) MINUTE) AS ends_at
         FROM inscriptions i JOIN matches m ON m.id = i.match_id
         WHERE ${ACTIVE_INSCRIPTION} AND m.status <> 'cancelled' AND m.starts_at >= ?
           AND DATE_ADD(m.starts_at, INTERVAL COALESCE(m.duration_min, 60) + 1440 MINUTE) <= NOW()
       ) p`,
      [since]
    );

    const nudgeLabels = { slot_alert: 'Alerta de hueco', reactivation: 'Reactivación', idle_balance: 'Saldo sin usar', friend_joined: 'Amigo apuntado' };
    return res.json({
      ok: true,
      days,
      feedback: {
        responses: Number(feedback.responses || 0),
        response_rate: pct(feedback.responses, eligible.total),
        organizer_avg: avg(feedback.organizer_avg),
        field_avg: avg(feedback.field_avg),
        teams: {
          balanced: Number(feedback.balanced || 0),
          so_so: Number(feedback.so_so || 0),
          unbalanced: Number(feedback.unbalanced || 0),
        },
        by_field: byField.map((row) => ({
          field_name: row.field_name,
          responses: Number(row.responses),
          field_avg: avg(row.field_avg),
          organizer_avg: avg(row.organizer_avg),
          unbalanced: Number(row.unbalanced || 0),
        })),
        return_by_sentiment: returnBySentiment.map((row) => ({
          bucket: row.bucket,
          players: Number(row.players),
          return_rate: pct(row.returned, row.players),
        })),
        comments,
      },
      social: byFriends.map((row) => ({
        bucket: row.bucket,
        players: Number(row.players),
        repeat_rate: pct(row.repeaters, row.players),
        matches_avg: avg(row.matches_avg),
      })),
      nudges: ['slot_alert', 'reactivation', 'idle_balance', 'friend_joined'].map((type) => {
        const row = nudges.find((item) => item.type === type) || { sent: 0, converted: 0 };
        return { type, label: nudgeLabels[type], sent: Number(row.sent || 0), conversion_rate: pct(row.converted, row.sent) };
      }),
      repeat: {
        played: Number(repeat.played || 0),
        rejoin_24h_rate: pct(repeat.rejoined, repeat.played),
      },
    });
  } catch (error) {
    console.error('[GET /admin/retention]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudieron cargar los datos de retención' });
  }
});

export default router;
