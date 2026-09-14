// Gestión admin de "El 8 de la semana": preparar los candidatos del próximo
// borrador antes de que se abra automáticamente. Montado en /api/admin/weekly-lineup
import express from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import {
  POSITIONS,
  POSITION_CANDIDATE_POOL,
  ensureUpcomingDraftPoll,
  getPollWithCandidates,
  resolveLocationLabel,
  INFERRED_LOCATION_JOIN_SQL,
  openPoll,
} from '../services/weeklyLineupService.js';

const router = express.Router();

/** GET /api/admin/weekly-lineup/polls — últimos polls (draft/open/closed) para el panel admin */
router.get('/polls', requireAuth, requireAdmin, async (req, res) => {
  try {
    await ensureUpcomingDraftPoll();
    const [rows] = await pool.query('SELECT * FROM weekly_lineup_polls ORDER BY week_start DESC LIMIT 12');
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('[GET /admin/weekly-lineup/polls]', e);
    res.status(500).json({ ok: false, msg: 'No se pudieron cargar las votaciones' });
  }
});

/** GET /api/admin/weekly-lineup/polls/:id — detalle con candidatos por posición */
router.get('/polls/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pollId = Number(req.params.id);
    const data = await getPollWithCandidates(pollId);
    if (!data) return res.status(404).json({ ok: false, msg: 'Votación no encontrada' });
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[GET /admin/weekly-lineup/polls/:id]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo cargar la votación' });
  }
});

/** GET /api/admin/weekly-lineup/users-search?q=texto — buscar jugadores para añadir como candidato */
router.get('/users-search', requireAuth, requireAdmin, async (req, res) => {
  try {
    const q = String(req.query?.q || '').trim();
    if (q.length < 2) return res.json({ ok: true, data: [] });

    const like = `%${q}%`;
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.avatar_url, u.preferred_location, inferred_loc.location_slug AS inferred_location_slug
       FROM users u
       ${INFERRED_LOCATION_JOIN_SQL}
       WHERE u.name LIKE ? ORDER BY u.name ASC LIMIT 20`,
      [like]
    );
    res.json({ ok: true, data: rows.map((r) => ({ ...r, location: resolveLocationLabel(r.preferred_location, r.inferred_location_slug) })) });
  } catch (e) {
    console.error('[GET /admin/weekly-lineup/users-search]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo buscar jugadores' });
  }
});

/**
 * POST /api/admin/weekly-lineup/polls/:id/candidates
 * Body: { position, user_id }
 */
router.post('/polls/:id/candidates', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pollId = Number(req.params.id);
    const position = req.body?.position;
    const userId = Number(req.body?.user_id);

    if (!POSITIONS.includes(position)) return res.status(400).json({ ok: false, msg: 'Posición inválida' });
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ ok: false, msg: 'Jugador inválido' });

    const [[poll]] = await pool.query('SELECT id, status FROM weekly_lineup_polls WHERE id=?', [pollId]);
    if (!poll) return res.status(404).json({ ok: false, msg: 'Votación no encontrada' });
    if (poll.status !== 'draft') return res.status(409).json({ ok: false, msg: 'Solo se pueden editar candidatos mientras la votación está en borrador' });

    const [[user]] = await pool.query('SELECT id FROM users WHERE id=?', [userId]);
    if (!user) return res.status(404).json({ ok: false, msg: 'Jugador no encontrado' });

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM weekly_lineup_candidates WHERE poll_id=? AND position=?',
      [pollId, position]
    );
    const limit = POSITION_CANDIDATE_POOL[position];
    if (Number(total) >= limit) {
      return res.status(409).json({ ok: false, msg: `Máximo ${limit} candidatos en esta posición` });
    }

    await pool.query(
      'INSERT IGNORE INTO weekly_lineup_candidates (poll_id, position, user_id) VALUES (?,?,?)',
      [pollId, position, userId]
    );

    const data = await getPollWithCandidates(pollId);
    res.status(201).json({ ok: true, msg: 'Candidato añadido', ...data });
  } catch (e) {
    console.error('[POST /admin/weekly-lineup/polls/:id/candidates]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo añadir el candidato' });
  }
});

/** DELETE /api/admin/weekly-lineup/polls/:id/candidates/:candidateId */
router.delete('/polls/:id/candidates/:candidateId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pollId = Number(req.params.id);
    const candidateId = Number(req.params.candidateId);

    const [[poll]] = await pool.query('SELECT id, status FROM weekly_lineup_polls WHERE id=?', [pollId]);
    if (!poll) return res.status(404).json({ ok: false, msg: 'Votación no encontrada' });
    if (poll.status !== 'draft') return res.status(409).json({ ok: false, msg: 'Solo se pueden editar candidatos mientras la votación está en borrador' });

    const [result] = await pool.query('DELETE FROM weekly_lineup_candidates WHERE id=? AND poll_id=?', [candidateId, pollId]);
    if (!result.affectedRows) return res.status(404).json({ ok: false, msg: 'Candidato no encontrado' });

    const data = await getPollWithCandidates(pollId);
    res.json({ ok: true, msg: 'Candidato eliminado', ...data });
  } catch (e) {
    console.error('[DELETE /admin/weekly-lineup/polls/:id/candidates/:candidateId]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo eliminar el candidato' });
  }
});

/**
 * POST /api/admin/weekly-lineup/polls/:id/open
 * Abre la votación a mano (mientras no automaticemos la apertura). Exige al
 * menos un candidato en cada posición.
 */
router.post('/polls/:id/open', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pollId = Number(req.params.id);
    const result = await openPoll(pollId);
    if (!result.ok) return res.status(409).json(result);

    const [rows] = await pool.query('SELECT * FROM weekly_lineup_polls ORDER BY week_start DESC LIMIT 12');
    res.json({ ok: true, msg: 'Votación abierta', data: rows });
  } catch (e) {
    console.error('[POST /admin/weekly-lineup/polls/:id/open]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo abrir la votación' });
  }
});

/**
 * POST /api/admin/weekly-lineup/polls/:id/close-now
 * Cierra la votación al momento (modo prueba), sin esperar a que acabe su semana.
 * Sirve para poder ver ya la pantalla de resultado con datos reales.
 */
router.post('/polls/:id/close-now', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pollId = Number(req.params.id);
    const [[poll]] = await pool.query('SELECT id, status FROM weekly_lineup_polls WHERE id=?', [pollId]);
    if (!poll) return res.status(404).json({ ok: false, msg: 'Votación no encontrada' });
    if (poll.status === 'closed') return res.status(409).json({ ok: false, msg: 'Esta votación ya está cerrada' });

    await pool.query("UPDATE weekly_lineup_polls SET status='closed', closed_at=NOW() WHERE id=?", [pollId]);

    const [rows] = await pool.query('SELECT * FROM weekly_lineup_polls ORDER BY week_start DESC LIMIT 12');
    res.json({ ok: true, msg: 'Votación cerrada', data: rows });
  } catch (e) {
    console.error('[POST /admin/weekly-lineup/polls/:id/close-now]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo cerrar la votación' });
  }
});

/**
 * DELETE /api/admin/weekly-lineup/polls/:id
 * Borra una votación entera (candidatos y votos incluidos). Pensado para limpiar
 * pruebas — para una semana real, mejor dejar que se cierre sola.
 */
router.delete('/polls/:id', requireAuth, requireAdmin, async (req, res) => {
  const pollId = Number(req.params.id);
  const conn = await pool.getConnection();
  try {
    const [[poll]] = await conn.query('SELECT id FROM weekly_lineup_polls WHERE id=?', [pollId]);
    if (!poll) {
      res.status(404).json({ ok: false, msg: 'Votación no encontrada' });
      return;
    }

    await conn.beginTransaction();
    await conn.query('DELETE FROM weekly_lineup_votes WHERE poll_id=?', [pollId]);
    await conn.query('DELETE FROM weekly_lineup_candidates WHERE poll_id=?', [pollId]);
    await conn.query('DELETE FROM weekly_lineup_polls WHERE id=?', [pollId]);
    await conn.commit();

    await ensureUpcomingDraftPoll();
    const [rows] = await pool.query('SELECT * FROM weekly_lineup_polls ORDER BY week_start DESC LIMIT 12');
    res.json({ ok: true, msg: 'Votación eliminada', data: rows });
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error('[DELETE /admin/weekly-lineup/polls/:id]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo eliminar la votación' });
  } finally {
    conn.release();
  }
});

export default router;
