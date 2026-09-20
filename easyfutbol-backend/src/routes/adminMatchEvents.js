// Registro en directo de goles, paradas y MVP de un partido, sobre jugadores
// reales del roster — alimenta directamente las estadísticas oficiales.
// Montado en /api/admin/matches/:matchId/events
import express from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import { applyEventStatDelta, setMvp, clearMvp, applyMatchResult } from '../services/matchLiveStatsService.js';

const router = express.Router({ mergeParams: true });

const EVENT_COLUMNS = `e.id, e.match_id, e.type, e.minute, e.user_id, e.assist_user_id, e.team_color,
                       CAST(e.is_candidate AS UNSIGNED) AS is_candidate, e.created_at,
                       scorer.name AS player_name, scorer.avatar_url AS player_avatar_url,
                       assist.name AS assist_name`;

async function getMatch(matchId) {
  const [[match]] = await pool.query(
    `SELECT m.id, m.title, m.starts_at, m.status, f.name AS field_name
     FROM matches m LEFT JOIN fields f ON f.id = m.field_id WHERE m.id = ?`,
    [matchId]
  );
  return match || null;
}

async function getEventById(id) {
  const [[row]] = await pool.query(
    `SELECT ${EVENT_COLUMNS} FROM match_live_events e
     LEFT JOIN users scorer ON scorer.id = e.user_id
     LEFT JOIN users assist ON assist.id = e.assist_user_id
     WHERE e.id=? LIMIT 1`,
    [id]
  );
  return row || null;
}

async function isRosterPlayer(matchId, userId) {
  const [[row]] = await pool.query(
    `SELECT 1 FROM inscriptions WHERE match_id=? AND status='confirmed' AND (user_id=? OR assigned_user_id=?) LIMIT 1`,
    [matchId, userId, userId]
  );
  return !!row;
}

/** GET /api/admin/matches/:matchId/events — lista cronológica de goles, paradas y MVP */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const matchId = Number(req.params.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) return res.status(400).json({ ok: false, msg: 'ID de partido inválido' });

    const match = await getMatch(matchId);
    if (!match) return res.status(404).json({ ok: false, msg: 'Partido no encontrado' });

    const [events] = await pool.query(
      `SELECT ${EVENT_COLUMNS} FROM match_live_events e
       LEFT JOIN users scorer ON scorer.id = e.user_id
       LEFT JOIN users assist ON assist.id = e.assist_user_id
       WHERE e.match_id=? ORDER BY FIELD(e.type,'mvp','goal','save'), e.minute ASC, e.id ASC`,
      [matchId]
    );

    res.json({ ok: true, match, data: events });
  } catch (e) {
    console.error('[GET /admin/matches/:matchId/events]', e);
    res.status(500).json({ ok: false, msg: 'Error listando los eventos del partido' });
  }
});

/**
 * POST /api/admin/matches/:matchId/events
 * Body: { type: 'goal'|'save'|'mvp', minute, user_id, assist_user_id?, team_color?, is_candidate? }
 * user_id (y assist_user_id) deben pertenecer al roster confirmado del partido.
 */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const matchId = Number(req.params.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) { conn.release(); return res.status(400).json({ ok: false, msg: 'ID de partido inválido' }); }

    const match = await getMatch(matchId);
    if (!match) { conn.release(); return res.status(404).json({ ok: false, msg: 'Partido no encontrado' }); }

    const type = req.body?.type;
    if (!['goal', 'save', 'mvp'].includes(type)) { conn.release(); return res.status(400).json({ ok: false, msg: 'Tipo de evento inválido' }); }

    const userId = Number(req.body?.user_id);
    if (!Number.isInteger(userId) || userId <= 0) { conn.release(); return res.status(400).json({ ok: false, msg: 'Selecciona un jugador' }); }
    if (!(await isRosterPlayer(matchId, userId))) { conn.release(); return res.status(400).json({ ok: false, msg: 'Ese jugador no está confirmado en este partido' }); }

    let minute = null;
    if (type !== 'mvp') {
      minute = Number(req.body?.minute);
      if (!Number.isInteger(minute) || minute < 0 || minute > 200) { conn.release(); return res.status(400).json({ ok: false, msg: 'Minuto inválido' }); }
    }

    let assistUserId = null;
    if (type === 'goal' && req.body?.assist_user_id) {
      assistUserId = Number(req.body.assist_user_id);
      if (assistUserId === userId) { conn.release(); return res.status(400).json({ ok: false, msg: 'La asistencia no puede ser del mismo jugador' }); }
      if (!(await isRosterPlayer(matchId, assistUserId))) { conn.release(); return res.status(400).json({ ok: false, msg: 'El jugador de la asistencia no está confirmado en este partido' }); }
    }

    const teamColor = req.body?.team_color;
    if (teamColor && !['white', 'black'].includes(teamColor)) { conn.release(); return res.status(400).json({ ok: false, msg: 'Equipo inválido' }); }

    await conn.beginTransaction();

    if (type === 'mvp') {
      await conn.query('DELETE FROM match_live_events WHERE match_id=? AND type=\'mvp\'', [matchId]);
      await setMvp(conn, matchId, userId);
    } else {
      await applyEventStatDelta(conn, { matchId, type, userId, assistUserId }, 1);
    }

    const [result] = await conn.query(
      `INSERT INTO match_live_events (match_id, type, minute, user_id, assist_user_id, team_color, is_candidate, created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [matchId, type, minute, userId, assistUserId, teamColor || null, req.body?.is_candidate ? 1 : 0, req.user?.id || null]
    );

    await conn.commit();
    const event = await getEventById(result.insertId);
    res.status(201).json({ ok: true, msg: 'Evento registrado', data: event });
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error('[POST /admin/matches/:matchId/events]', e);
    res.status(500).json({ ok: false, msg: 'Error registrando el evento' });
  } finally {
    conn.release();
  }
});

/**
 * PUT /api/admin/matches/:matchId/events/:eventId
 * Actualiza minuto, jugador, asistencia, equipo o estrella — recalculando
 * las estadísticas si cambia el jugador o la asistencia.
 */
router.put('/:eventId', requireAuth, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const matchId = Number(req.params.matchId);
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) { conn.release(); return res.status(400).json({ ok: false, msg: 'ID de evento inválido' }); }

    const current = await getEventById(eventId);
    if (!current || current.match_id !== matchId) { conn.release(); return res.status(404).json({ ok: false, msg: 'Evento no encontrado' }); }

    let minute = current.minute;
    if (req.body?.minute !== undefined && current.type !== 'mvp') {
      minute = Number(req.body.minute);
      if (!Number.isInteger(minute) || minute < 0 || minute > 200) { conn.release(); return res.status(400).json({ ok: false, msg: 'Minuto inválido' }); }
    }

    let userId = current.user_id;
    if (req.body?.user_id !== undefined) {
      userId = Number(req.body.user_id);
      if (!Number.isInteger(userId) || userId <= 0) { conn.release(); return res.status(400).json({ ok: false, msg: 'Selecciona un jugador' }); }
      if (!(await isRosterPlayer(matchId, userId))) { conn.release(); return res.status(400).json({ ok: false, msg: 'Ese jugador no está confirmado en este partido' }); }
    }

    let assistUserId = current.assist_user_id;
    if (req.body?.assist_user_id !== undefined) {
      assistUserId = req.body.assist_user_id ? Number(req.body.assist_user_id) : null;
      if (assistUserId) {
        if (assistUserId === userId) { conn.release(); return res.status(400).json({ ok: false, msg: 'La asistencia no puede ser del mismo jugador' }); }
        if (!(await isRosterPlayer(matchId, assistUserId))) { conn.release(); return res.status(400).json({ ok: false, msg: 'El jugador de la asistencia no está confirmado en este partido' }); }
      }
    }

    let teamColor = current.team_color;
    if (req.body?.team_color !== undefined) {
      teamColor = req.body.team_color;
      if (teamColor && !['white', 'black'].includes(teamColor)) { conn.release(); return res.status(400).json({ ok: false, msg: 'Equipo inválido' }); }
    }

    const isCandidate = req.body?.is_candidate !== undefined ? (req.body.is_candidate ? 1 : 0) : current.is_candidate;

    await conn.beginTransaction();

    if (current.type === 'mvp') {
      if (userId !== current.user_id) await setMvp(conn, matchId, userId);
    } else {
      const playerChanged = userId !== current.user_id;
      const assistChanged = assistUserId !== current.assist_user_id;
      if (playerChanged || assistChanged) {
        await applyEventStatDelta(conn, { matchId, type: current.type, userId: current.user_id, assistUserId: current.assist_user_id }, -1);
        await applyEventStatDelta(conn, { matchId, type: current.type, userId, assistUserId }, 1);
      }
    }

    await conn.query(
      'UPDATE match_live_events SET minute=?, user_id=?, assist_user_id=?, team_color=?, is_candidate=? WHERE id=?',
      [minute, userId, assistUserId, teamColor || null, isCandidate, eventId]
    );

    await conn.commit();
    const event = await getEventById(eventId);
    res.json({ ok: true, msg: 'Evento actualizado', data: event });
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error('[PUT /admin/matches/:matchId/events/:eventId]', e);
    res.status(500).json({ ok: false, msg: 'Error actualizando el evento' });
  } finally {
    conn.release();
  }
});

/** DELETE /api/admin/matches/:matchId/events/:eventId */
router.delete('/:eventId', requireAuth, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const matchId = Number(req.params.matchId);
    const eventId = Number(req.params.eventId);

    const current = await getEventById(eventId);
    if (!current || current.match_id !== matchId) { conn.release(); return res.status(404).json({ ok: false, msg: 'Evento no encontrado' }); }

    await conn.beginTransaction();
    if (current.type === 'mvp') {
      await clearMvp(conn, matchId, current.user_id);
    } else {
      await applyEventStatDelta(conn, { matchId, type: current.type, userId: current.user_id, assistUserId: current.assist_user_id }, -1);
    }
    await conn.query('DELETE FROM match_live_events WHERE id=? AND match_id=?', [eventId, matchId]);
    await conn.commit();

    res.json({ ok: true, msg: 'Evento eliminado' });
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error('[DELETE /admin/matches/:matchId/events/:eventId]', e);
    res.status(500).json({ ok: false, msg: 'Error eliminando el evento' });
  } finally {
    conn.release();
  }
});

/**
 * POST /api/admin/matches/:matchId/events/result
 * Body: { winner: 'white'|'black'|'draw' } — aplica win/loss/draw a todos los
 * jugadores confirmados según su camiseta, para completar el ranking.
 */
router.post('/result', requireAuth, requireAdmin, async (req, res) => {
  try {
    const matchId = Number(req.params.matchId);
    const winner = req.body?.winner;
    if (!['white', 'black', 'draw'].includes(winner)) return res.status(400).json({ ok: false, msg: 'Resultado inválido' });

    const updated = await applyMatchResult(matchId, winner);
    res.json({ ok: true, msg: `Resultado aplicado a ${updated} jugador(es)` });
  } catch (e) {
    console.error('[POST /admin/matches/:matchId/events/result]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo aplicar el resultado' });
  }
});

/** GET /api/admin/matches/:matchId/events/summary — resumen listo para hacer los recortes */
router.get('/summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const matchId = Number(req.params.matchId);
    const match = await getMatch(matchId);
    if (!match) return res.status(404).json({ ok: false, msg: 'Partido no encontrado' });

    const [events] = await pool.query(
      `SELECT ${EVENT_COLUMNS} FROM match_live_events e
       LEFT JOIN users scorer ON scorer.id = e.user_id
       LEFT JOIN users assist ON assist.id = e.assist_user_id
       WHERE e.match_id=? ORDER BY e.minute ASC, e.id ASC`,
      [matchId]
    );

    const goals = events.filter((e) => e.type === 'goal');
    const saves = events.filter((e) => e.type === 'save');
    const mvp = events.find((e) => e.type === 'mvp') || null;

    res.json({
      ok: true,
      match,
      data: {
        goals,
        saves,
        mvp,
        goal_candidates: goals.filter((e) => e.is_candidate),
        save_candidates: saves.filter((e) => e.is_candidate),
      },
    });
  } catch (e) {
    console.error('[GET /admin/matches/:matchId/events/summary]', e);
    res.status(500).json({ ok: false, msg: 'Error generando el resumen' });
  }
});

export default router;
