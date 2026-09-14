// Registro en directo de goles y paradas de un partido (gol/parada de la semana).
// Montado en /api/admin/matches/:matchId/events
import express from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = express.Router({ mergeParams: true });

const EVENT_COLUMNS = `id, match_id, type, minute, player_name, team_color,
                       CAST(is_candidate AS UNSIGNED) AS is_candidate, created_at`;

function cleanText(value, maxLength) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

async function getMatch(matchId) {
  const [[match]] = await pool.query(
    `SELECT m.id, m.title, m.starts_at, m.status, f.name AS field_name
     FROM matches m LEFT JOIN fields f ON f.id = m.field_id WHERE m.id = ?`,
    [matchId]
  );
  return match || null;
}

async function getEventById(id) {
  const [[row]] = await pool.query(`SELECT ${EVENT_COLUMNS} FROM match_live_events WHERE id=? LIMIT 1`, [id]);
  return row || null;
}

/** GET /api/admin/matches/:matchId/events — lista cronológica de goles y paradas */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const matchId = Number(req.params.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) return res.status(400).json({ ok: false, msg: 'ID de partido inválido' });

    const match = await getMatch(matchId);
    if (!match) return res.status(404).json({ ok: false, msg: 'Partido no encontrado' });

    const [events] = await pool.query(
      `SELECT ${EVENT_COLUMNS} FROM match_live_events WHERE match_id=? ORDER BY minute ASC, id ASC`,
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
 * Body: { type: 'goal'|'save', minute, player_name, team_color, is_candidate }
 */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const matchId = Number(req.params.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) return res.status(400).json({ ok: false, msg: 'ID de partido inválido' });

    const match = await getMatch(matchId);
    if (!match) return res.status(404).json({ ok: false, msg: 'Partido no encontrado' });

    const type = req.body?.type;
    if (!['goal', 'save'].includes(type)) return res.status(400).json({ ok: false, msg: 'Tipo de evento inválido' });

    const minute = Number(req.body?.minute);
    if (!Number.isInteger(minute) || minute < 0 || minute > 200) return res.status(400).json({ ok: false, msg: 'Minuto inválido' });

    const teamColor = req.body?.team_color;
    if (teamColor && !['white', 'black'].includes(teamColor)) return res.status(400).json({ ok: false, msg: 'Equipo inválido' });

    const [result] = await pool.query(
      `INSERT INTO match_live_events (match_id, type, minute, player_name, team_color, is_candidate, created_by)
       VALUES (?,?,?,?,?,?,?)`,
      [
        matchId,
        type,
        minute,
        cleanText(req.body?.player_name, 120),
        teamColor || null,
        req.body?.is_candidate ? 1 : 0,
        req.user?.id || null,
      ]
    );

    const event = await getEventById(result.insertId);
    res.status(201).json({ ok: true, msg: 'Evento registrado', data: event });
  } catch (e) {
    console.error('[POST /admin/matches/:matchId/events]', e);
    res.status(500).json({ ok: false, msg: 'Error registrando el evento' });
  }
});

/**
 * PUT /api/admin/matches/:matchId/events/:eventId
 * Actualiza solo los campos enviados (minuto, jugador, equipo, estrella).
 */
router.put('/:eventId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const matchId = Number(req.params.matchId);
    const eventId = Number(req.params.eventId);
    if (!Number.isInteger(eventId) || eventId <= 0) return res.status(400).json({ ok: false, msg: 'ID de evento inválido' });

    const current = await getEventById(eventId);
    if (!current || current.match_id !== matchId) return res.status(404).json({ ok: false, msg: 'Evento no encontrado' });

    const updates = [];
    const params = [];

    if (req.body?.minute !== undefined) {
      const minute = Number(req.body.minute);
      if (!Number.isInteger(minute) || minute < 0 || minute > 200) return res.status(400).json({ ok: false, msg: 'Minuto inválido' });
      updates.push('minute=?');
      params.push(minute);
    }

    if (req.body?.player_name !== undefined) {
      updates.push('player_name=?');
      params.push(cleanText(req.body.player_name, 120));
    }

    if (req.body?.team_color !== undefined) {
      const teamColor = req.body.team_color;
      if (teamColor && !['white', 'black'].includes(teamColor)) return res.status(400).json({ ok: false, msg: 'Equipo inválido' });
      updates.push('team_color=?');
      params.push(teamColor || null);
    }

    if (req.body?.is_candidate !== undefined) {
      updates.push('is_candidate=?');
      params.push(req.body.is_candidate ? 1 : 0);
    }

    if (!updates.length) return res.status(400).json({ ok: false, msg: 'No hay cambios que guardar' });

    params.push(eventId);
    await pool.query(`UPDATE match_live_events SET ${updates.join(', ')} WHERE id=?`, params);

    const event = await getEventById(eventId);
    res.json({ ok: true, msg: 'Evento actualizado', data: event });
  } catch (e) {
    console.error('[PUT /admin/matches/:matchId/events/:eventId]', e);
    res.status(500).json({ ok: false, msg: 'Error actualizando el evento' });
  }
});

/** DELETE /api/admin/matches/:matchId/events/:eventId */
router.delete('/:eventId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const matchId = Number(req.params.matchId);
    const eventId = Number(req.params.eventId);
    const [result] = await pool.query('DELETE FROM match_live_events WHERE id=? AND match_id=?', [eventId, matchId]);
    if (!result.affectedRows) return res.status(404).json({ ok: false, msg: 'Evento no encontrado' });
    res.json({ ok: true, msg: 'Evento eliminado' });
  } catch (e) {
    console.error('[DELETE /admin/matches/:matchId/events/:eventId]', e);
    res.status(500).json({ ok: false, msg: 'Error eliminando el evento' });
  }
});

/** GET /api/admin/matches/:matchId/events/summary — resumen listo para hacer los recortes */
router.get('/summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    const matchId = Number(req.params.matchId);
    const match = await getMatch(matchId);
    if (!match) return res.status(404).json({ ok: false, msg: 'Partido no encontrado' });

    const [events] = await pool.query(
      `SELECT ${EVENT_COLUMNS} FROM match_live_events WHERE match_id=? ORDER BY minute ASC, id ASC`,
      [matchId]
    );

    const goals = events.filter((e) => e.type === 'goal');
    const saves = events.filter((e) => e.type === 'save');

    res.json({
      ok: true,
      match,
      data: {
        goals,
        saves,
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
