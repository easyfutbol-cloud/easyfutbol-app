// Popups del admin: qué popup toca enseñar al jugador y registro de vistas/clics.
// Montado en /api/popups
import express from 'express';
import rateLimit from 'express-rate-limit';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { formatLocationLabel } from '../services/weeklyLineupService.js';

const router = express.Router();

const DAY_MS = 24 * 60 * 60 * 1000;

const eventLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, msg: 'Demasiadas solicitudes. Prueba de nuevo en unos minutos.' },
});

const PUBLIC_COLUMNS = 'id, title, body, image_url, button_label, action_type, action_value, frequency, audience_locations';

/**
 * Sede del jugador: la que eligió al registrarse (preferred_location) o, si no
 * la tiene, la de sus partidos más habituales. null si no se puede saber.
 */
async function getUserLocationSlug(userId) {
  const [[user]] = await pool.query('SELECT preferred_location FROM users WHERE id=? LIMIT 1', [userId]);
  const chosen = formatLocationLabel(user?.preferred_location);
  if (chosen) return chosen.toLowerCase();

  const [[inferred]] = await pool.query(
    `SELECT COALESCE(l.slug, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 'asturias' ELSE 'valladolid' END) AS slug
     FROM inscriptions i
     JOIN matches m ON m.id = i.match_id
     LEFT JOIN locations l ON l.id = m.location_id
     WHERE i.user_id=?
     GROUP BY slug ORDER BY COUNT(*) DESC LIMIT 1`,
    [userId]
  );
  const label = formatLocationLabel(inferred?.slug);
  return label ? label.toLowerCase() : null;
}

/**
 * GET /api/popups/active
 * Devuelve el popup que le toca ver a este jugador (o null). Se prioriza el
 * que aún no ha visto nunca, y dentro de eso el más reciente.
 */
router.get('/active', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const [popups] = await pool.query(
      `SELECT ${PUBLIC_COLUMNS} FROM app_popups
       WHERE is_active=1 AND (ends_at IS NULL OR ends_at > ?)
       ORDER BY id DESC`,
      [now]
    );
    if (!popups.length) return res.json({ ok: true, popup: null });

    // Solo calculamos la sede del jugador si algún popup activo está segmentado.
    const userLocation = popups.some((p) => p.audience_locations) ? await getUserLocationSlug(req.user.id) : null;
    const inAudience = (popup) => !popup.audience_locations
      || (userLocation !== null && popup.audience_locations.split(',').includes(userLocation));

    const [seen] = await pool.query(
      `SELECT popup_id, MAX(created_at) AS last_view
       FROM app_popup_events WHERE user_id=? AND action='view' GROUP BY popup_id`,
      [req.user.id]
    );
    const lastViewById = new Map(seen.map((row) => [Number(row.popup_id), new Date(row.last_view).getTime()]));

    const eligible = popups.filter(inAudience).filter((popup) => {
      const lastView = lastViewById.get(Number(popup.id));
      if (lastView === undefined) return true;
      if (popup.frequency === 'always') return true;
      if (popup.frequency === 'daily') return now.getTime() - lastView >= DAY_MS;
      return false; // once
    });

    const neverSeen = eligible.filter((popup) => !lastViewById.has(Number(popup.id)));
    const chosen = neverSeen[0] || eligible[0] || null;
    const popup = chosen ? { ...chosen, audience_locations: undefined } : null;
    return res.json({ ok: true, popup });
  } catch (e) {
    console.error('[GET /popups/active]', e);
    return res.status(500).json({ ok: false, msg: 'No se pudo cargar el aviso' });
  }
});

/** POST /api/popups/:id/event — body { action: 'view' | 'click' } */
router.post('/:id/event', requireAuth, eventLimiter, async (req, res) => {
  try {
    const popupId = Number(req.params.id);
    const action = String(req.body?.action || '');
    if (!Number.isInteger(popupId) || popupId <= 0 || !['view', 'click'].includes(action)) {
      return res.status(400).json({ ok: false, msg: 'Solicitud inválida' });
    }

    const [[popup]] = await pool.query('SELECT id FROM app_popups WHERE id=? LIMIT 1', [popupId]);
    if (!popup) return res.status(404).json({ ok: false, msg: 'Aviso no encontrado' });

    await pool.query(
      'INSERT INTO app_popup_events (popup_id, user_id, action, created_at) VALUES (?,?,?,?)',
      [popupId, req.user.id, action, new Date()]
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error('[POST /popups/:id/event]', e);
    return res.status(500).json({ ok: false, msg: 'No se pudo registrar' });
  }
});

export default router;
