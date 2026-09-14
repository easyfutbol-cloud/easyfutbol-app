// "El 8 de la semana": votación pública y resultado. Montado en /api/weekly-lineup
import express from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { POSITIONS, POSITION_SLOTS, getPollWithCandidates, getPollWinners } from '../services/weeklyLineupService.js';

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

    const myVotesByPosition = {};
    for (const position of POSITIONS) myVotesByPosition[position] = [];
    for (const v of myVotes) myVotesByPosition[v.position]?.push(v.candidate_id);

    res.json({
      ok: true,
      poll: data.poll,
      candidates: data.candidates,
      position_limits: POSITION_SLOTS,
      my_votes: myVotesByPosition,
    });
  } catch (e) {
    console.error('[GET /weekly-lineup/current]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo cargar la votación' });
  }
});

/**
 * POST /api/weekly-lineup/vote/toggle
 * Body: { position, candidate_id }
 * Si el candidato ya estaba elegido en esa posición, se quita. Si no,
 * se añade — siempre que no se haya llegado ya al máximo de esa posición
 * (p.ej. 3 en defensa). Nunca se puede elegir dos veces al mismo candidato.
 */
router.post('/vote/toggle', requireAuth, async (req, res) => {
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

    const [[existingVote]] = await pool.query(
      'SELECT id FROM weekly_lineup_votes WHERE poll_id=? AND position=? AND user_id=? AND candidate_id=?',
      [poll.id, position, req.user.id, candidateId]
    );

    if (existingVote) {
      await pool.query('DELETE FROM weekly_lineup_votes WHERE id=?', [existingVote.id]);
      return res.json({ ok: true, msg: 'Voto quitado', selected: false });
    }

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM weekly_lineup_votes WHERE poll_id=? AND position=? AND user_id=?',
      [poll.id, position, req.user.id]
    );
    const limit = POSITION_SLOTS[position];
    if (Number(total) >= limit) {
      return res.status(409).json({ ok: false, msg: `Ya has elegido ${limit} en esta posición` });
    }

    await pool.query(
      'INSERT INTO weekly_lineup_votes (poll_id, position, candidate_id, user_id) VALUES (?,?,?,?)',
      [poll.id, position, candidateId, req.user.id]
    );
    res.json({ ok: true, msg: 'Voto registrado', selected: true });
  } catch (e) {
    console.error('[POST /weekly-lineup/vote/toggle]', e);
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
