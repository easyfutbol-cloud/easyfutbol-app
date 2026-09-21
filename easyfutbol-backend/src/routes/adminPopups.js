// Gestión de popups desde la app de administración. Montado en /api/admin/popups
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

// Pantallas a las que un botón de popup puede llevar. Es una lista cerrada a
// propósito: el valor lo escribe un admin pero lo ejecuta la app de todos.
export const POPUP_SCREENS = [
  'Home', 'Matchs', 'MisPartidos', 'Social', 'Profile', 'EasyPass', 'Plus',
  'WeeklyLineupVote', 'WeeklyLineupResult', 'Stats', 'Achievements', 'Faq',
];
// Sedes de EasyFutbol (mismos slugs que users.preferred_location y la tabla locations).
export const POPUP_LOCATIONS = ['valladolid', 'asturias'];
const ACTION_TYPES = ['none', 'url', 'screen'];
const FREQUENCIES = ['once', 'daily', 'always'];

const uploadDir = path.join(process.cwd(), 'uploads/popups');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      cb(null, `popup-${req.params.id || 'new'}-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype || '')) return cb(new Error('El archivo debe ser una imagen'));
    cb(null, true);
  },
});

const ADMIN_SELECT = `
  SELECT p.id, p.title, p.body, p.image_url, p.button_label, p.action_type, p.action_value,
         p.frequency, p.audience_locations, CAST(p.is_active AS UNSIGNED) AS is_active, p.ends_at, p.created_at,
         (SELECT COUNT(DISTINCT e.user_id) FROM app_popup_events e WHERE e.popup_id=p.id AND e.action='view') AS viewers,
         (SELECT COUNT(DISTINCT e.user_id) FROM app_popup_events e WHERE e.popup_id=p.id AND e.action='click') AS clickers
  FROM app_popups p`;

function cleanText(value, maxLength) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : null;
}

/**
 * Valida el popup completo (ya fusionado con lo que había guardado).
 * Devuelve { error } o { value } con los campos listos para guardar.
 */
function validatePopup(input) {
  const title = cleanText(input.title, 120);
  if (!title) return { error: 'El título es obligatorio' };

  const actionType = String(input.action_type || 'none');
  if (!ACTION_TYPES.includes(actionType)) return { error: 'Tipo de botón inválido' };

  const frequency = String(input.frequency || 'once');
  if (!FREQUENCIES.includes(frequency)) return { error: 'Frecuencia inválida' };

  let actionValue = null;
  let buttonLabel = null;
  if (actionType !== 'none') {
    buttonLabel = cleanText(input.button_label, 40);
    if (!buttonLabel) return { error: 'Escribe el texto del botón' };
    actionValue = cleanText(input.action_value, 500);
    if (!actionValue) return { error: actionType === 'url' ? 'Escribe el enlace del botón' : 'Elige la pantalla del botón' };
    if (actionType === 'url' && !/^https:\/\/[^\s]+$/i.test(actionValue)) {
      return { error: 'El enlace tiene que empezar por https://' };
    }
    if (actionType === 'screen' && !POPUP_SCREENS.includes(actionValue)) {
      return { error: 'Pantalla no permitida' };
    }
  }

  // Acepta array o texto separado por comas. Vacío o "todas las sedes" = sin segmentar (NULL).
  const rawLocations = Array.isArray(input.audience_locations)
    ? input.audience_locations
    : String(input.audience_locations || '').split(',');
  const locations = [...new Set(rawLocations.map((l) => String(l).trim().toLowerCase()).filter(Boolean))];
  if (locations.some((l) => !POPUP_LOCATIONS.includes(l))) return { error: 'Sede no válida' };
  const audienceLocations = locations.length && locations.length < POPUP_LOCATIONS.length
    ? POPUP_LOCATIONS.filter((l) => locations.includes(l)).join(',')
    : null;

  let endsAt = null;
  if (input.ends_at) {
    endsAt = new Date(input.ends_at);
    if (Number.isNaN(endsAt.getTime())) return { error: 'Fecha de caducidad inválida' };
  }

  return {
    value: {
      title,
      body: cleanText(input.body, 1000),
      button_label: buttonLabel,
      action_type: actionType,
      action_value: actionValue,
      frequency,
      audience_locations: audienceLocations,
      is_active: input.is_active === undefined ? 1 : (input.is_active ? 1 : 0),
      ends_at: endsAt,
    },
  };
}

async function getPopup(id) {
  const [[row]] = await pool.query(`${ADMIN_SELECT} WHERE p.id=? LIMIT 1`, [id]);
  return row || null;
}

function removeLocalImage(imageUrl) {
  try {
    if (!imageUrl || !imageUrl.startsWith('/uploads/popups/')) return;
    const filePath = path.join(process.cwd(), imageUrl.replace(/^\//, '').split('?')[0]);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.warn('[admin/popups] No se pudo borrar la imagen:', e?.message || e);
  }
}

/** GET /api/admin/popups — todos, con vistas y clics */
router.get('/', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(`${ADMIN_SELECT} ORDER BY p.id DESC LIMIT 100`);
    res.json({ ok: true, data: rows, screens: POPUP_SCREENS, locations: POPUP_LOCATIONS });
  } catch (e) {
    console.error('[GET /admin/popups]', e);
    res.status(500).json({ ok: false, msg: 'No se pudieron cargar los popups' });
  }
});

/** GET /api/admin/popups/:id */
router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, msg: 'ID inválido' });
    const popup = await getPopup(id);
    if (!popup) return res.status(404).json({ ok: false, msg: 'Popup no encontrado' });
    res.json({ ok: true, data: popup });
  } catch (e) {
    console.error('[GET /admin/popups/:id]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo cargar el popup' });
  }
});

/** POST /api/admin/popups — crear */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { error, value } = validatePopup(req.body || {});
    if (error) return res.status(400).json({ ok: false, msg: error });
    if (value.ends_at && value.ends_at.getTime() <= Date.now()) {
      return res.status(400).json({ ok: false, msg: 'La fecha de caducidad tiene que ser futura' });
    }

    const [result] = await pool.query(
      `INSERT INTO app_popups (title, body, button_label, action_type, action_value, frequency, audience_locations, is_active, ends_at, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [value.title, value.body, value.button_label, value.action_type, value.action_value, value.frequency,
       value.audience_locations, value.is_active, value.ends_at, req.user.id, new Date()]
    );
    res.json({ ok: true, data: await getPopup(result.insertId) });
  } catch (e) {
    console.error('[POST /admin/popups]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo crear el popup' });
  }
});

/**
 * PUT /api/admin/popups/:id — editar. Solo cambia los campos que lleguen
 * (así se puede activar/desactivar sin reenviar todo). `ends_at: null` quita la caducidad.
 */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, msg: 'ID inválido' });
    const current = await getPopup(id);
    if (!current) return res.status(404).json({ ok: false, msg: 'Popup no encontrado' });

    const merged = { ...current, ...(req.body || {}) };
    const { error, value } = validatePopup(merged);
    if (error) return res.status(400).json({ ok: false, msg: error });

    await pool.query(
      `UPDATE app_popups SET title=?, body=?, button_label=?, action_type=?, action_value=?,
              frequency=?, audience_locations=?, is_active=?, ends_at=? WHERE id=?`,
      [value.title, value.body, value.button_label, value.action_type, value.action_value,
       value.frequency, value.audience_locations, value.is_active, value.ends_at, id]
    );
    res.json({ ok: true, data: await getPopup(id) });
  } catch (e) {
    console.error('[PUT /admin/popups/:id]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo guardar el popup' });
  }
});

/** POST /api/admin/popups/:id/image — imagen del popup (form-data, clave "image") */
router.post('/:id/image', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, msg: 'ID inválido' });
    if (!req.file) return res.status(400).json({ ok: false, msg: 'No se ha recibido ninguna imagen' });

    const current = await getPopup(id);
    if (!current) {
      removeLocalImage(`/uploads/popups/${req.file.filename}`);
      return res.status(404).json({ ok: false, msg: 'Popup no encontrado' });
    }

    const fileUrl = `/uploads/popups/${req.file.filename}`;
    await pool.query('UPDATE app_popups SET image_url=? WHERE id=?', [fileUrl, id]);
    removeLocalImage(current.image_url);
    res.json({ ok: true, image_url: fileUrl, data: await getPopup(id) });
  } catch (e) {
    console.error('[POST /admin/popups/:id/image]', e);
    res.status(500).json({ ok: false, msg: 'Error subiendo la imagen' });
  }
});

/** DELETE /api/admin/popups/:id/image — quita la imagen */
router.delete('/:id/image', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, msg: 'ID inválido' });
    const current = await getPopup(id);
    if (!current) return res.status(404).json({ ok: false, msg: 'Popup no encontrado' });
    await pool.query('UPDATE app_popups SET image_url=NULL WHERE id=?', [id]);
    removeLocalImage(current.image_url);
    res.json({ ok: true, data: await getPopup(id) });
  } catch (e) {
    console.error('[DELETE /admin/popups/:id/image]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo quitar la imagen' });
  }
});

/** DELETE /api/admin/popups/:id — borra el popup y su historial de vistas */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, msg: 'ID inválido' });
    const current = await getPopup(id);
    if (!current) return res.status(404).json({ ok: false, msg: 'Popup no encontrado' });

    await pool.query('DELETE FROM app_popup_events WHERE popup_id=?', [id]);
    await pool.query('DELETE FROM app_popups WHERE id=?', [id]);
    removeLocalImage(current.image_url);
    res.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /admin/popups/:id]', e);
    res.status(500).json({ ok: false, msg: 'No se pudo borrar el popup' });
  }
});

export default router;
