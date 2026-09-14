// "El 8 de la semana": votación pública y resultado. Montado en /api/weekly-lineup
import express from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { POSITIONS, getPollWithCandidates, getPollWinners } from '../services/weeklyLineupService.js';

const router = express.Router();

/** GET /api/weekly-lineup/current — votación abierta + mis votos */
router.get('/current', requireAuth, async (req, res) => {
  try {
    const [[poll]] = await pool.query("SELECT id FROM weekly_lineup_polls WHERE status='open' ORDER BY week_start DESC LIMIT 1");
    if (!poll) return res.json({ ok: true, poll: null, candidates: null, my_votes: {} });

    const data = await getPollWithCandidates(poll.id);
    const [myVotes] = await pool.query(
      'SELECT position, candidate_id FROM weekly_lineup_votes WHERE poll_id=? AND user_id=?',
      [poll.id, req.user.id]
    );

    res.json({
      ok: true,
      poll: data.poll,
      candidates: data.candidates,
      my_votes: Object.fromEntries(myVotes.map((v) => [v.position, v.candidate_id])),
    });
  } catch (e) {
    console.error('[GET /weekly-lineup/current]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo cargar la votación' });
  }
});

/**
 * POST /api/weekly-lineup/vote
 * Body: { position, candidate_id }
 */
router.post('/vote', requireAuth, async (req, res) => {
  try {
    const position = req.body?.position;
    const candidateId = Number(req.body?.candidate_id);

    if (!POSITIONS.includes(position)) return res.status(400).json({ ok: false, msg: 'Posición inválida' });
    if (!Number.isInteger(candidateId) || candidateId <= 0) return res.status(400).json({ ok: false, msg: 'Candidato inválido' });

    const [[poll]] = await pool.query("SELECT id FROM weekly_lineup_polls WHERE status='open' ORDER BY week_start DESC LIMIT 1");
    if (!poll) return res.status(409).json({ ok: false, msg: 'No hay ninguna votación abierta ahora mismo' });

    const [[candidate]] = await pool.query(
      'SELECT id FROM weekly_lineup_candidates WHERE id=? AND poll_id=? AND position=?',
      [candidateId, poll.id, position]
    );
    if (!candidate) return res.status(404).json({ ok: false, msg: 'Ese candidato no está en esta votación' });

    await pool.query(
      `INSERT INTO weekly_lineup_votes (poll_id, position, candidate_id, user_id)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE candidate_id=VALUES(candidate_id)`,
      [poll.id, position, candidateId, req.user.id]
    );

    res.json({ ok: true, msg: 'Voto registrado' });
  } catch (e) {
    console.error('[POST /weekly-lineup/vote]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo registrar el voto' });
  }
});

/** GET /api/weekly-lineup/latest-result — última alineación ganadora (semana cerrada más reciente) */
router.get('/latest-result', requireAuth, async (req, res) => {
  try {
    const [[poll]] = await pool.query("SELECT id, week_start, week_end FROM weekly_lineup_polls WHERE status='closed' ORDER BY week_start DESC LIMIT 1");
    if (!poll) return res.json({ ok: true, poll: null, winners: null });

    const winners = await getPollWinners(poll.id);
    res.json({ ok: true, poll, winners });
  } catch (e) {
    console.error('[GET /weekly-lineup/latest-result]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo cargar el resultado' });
  }
});

export default router;
