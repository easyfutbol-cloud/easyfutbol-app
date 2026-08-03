import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = Router();
const toMysql = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT smp.*, f.name AS resolved_field_name
       FROM scheduled_match_publications smp
       LEFT JOIN fields f ON f.id=smp.field_id
       WHERE smp.status IN ('pending','publishing','failed')
       ORDER BY smp.publish_at ASC, smp.starts_at ASC`
    );
    return res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('[GET scheduled matches]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudieron cargar los partidos programados' });
  }
});

router.post('/batch', requireAuth, requireAdmin, async (req, res) => {
  const items = Array.isArray(req.body?.matches) ? req.body.matches : [];
  if (!items.length || items.length > 50) {
    return res.status(400).json({ ok: false, msg: 'Añade entre 1 y 50 partidos al lote' });
  }

  const values = [];
  for (const item of items) {
    const startsAt = new Date(item.starts_at);
    const publishAt = new Date(item.publish_at);
    const capacity = Number(item.capacity);
    const duration = Number(item.duration_min || 60);
    if (!item.title || !item.city || !(item.field_id || item.field_name) || Number.isNaN(startsAt.getTime()) || Number.isNaN(publishAt.getTime())) {
      return res.status(400).json({ ok: false, msg: 'Hay un partido con datos incompletos o fechas inválidas' });
    }
    if (startsAt <= new Date() || publishAt >= startsAt || capacity < 1 || capacity > 50 || duration < 1 || duration > 240) {
      return res.status(400).json({ ok: false, msg: 'Revisa fecha de publicación, capacidad y duración' });
    }
    values.push([
      item.title,
      item.city,
      Number(item.location_id || 1),
      item.field_id ? Number(item.field_id) : null,
      item.field_name || null,
      toMysql(startsAt),
      toMysql(publishAt),
      duration,
      Number(item.price_eur || 0),
      Math.max(1, Number(item.easypass_cost || 1)),
      capacity,
      Number(item.has_aftergame) === 1 ? 1 : 0,
      req.user.id,
    ]);
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO scheduled_match_publications
       (title, city, location_id, field_id, field_name, starts_at, publish_at, duration_min, price_eur, easypass_cost, capacity, has_aftergame, created_by)
       VALUES ?`,
      [values]
    );
    return res.status(201).json({ ok: true, created: result.affectedRows });
  } catch (error) {
    console.error('[POST scheduled matches batch]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudo guardar la programación' });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE scheduled_match_publications
       SET status='cancelled', cancelled_at=NOW()
       WHERE id=? AND status IN ('pending','failed')`,
      [Number(req.params.id)]
    );
    if (!result.affectedRows) return res.status(409).json({ ok: false, msg: 'La programación ya no se puede cancelar' });
    return res.json({ ok: true, msg: 'Automatización cancelada' });
  } catch (error) {
    console.error('[DELETE scheduled match]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudo cancelar la automatización' });
  }
});

export default router;
