// Organizadores de partidos ("Organizado por") desde la app de administración.
// Montado en /api/admin/organizers
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

const uploadDir = path.join(process.cwd(), 'uploads/organizers');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic']);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      cb(null, `organizer-${req.params.id}-${Date.now()}${IMAGE_EXTENSIONS.has(ext) ? ext : '.jpg'}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype || '')) return cb(new Error('El archivo debe ser una imagen'));
    cb(null, true);
  },
});

const COLUMNS = `id, first_name, last_name, photo_url, CAST(is_active AS UNSIGNED) AS is_active, created_at`;

function cleanName(value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, 60) : null;
}

async function getOrganizer(id) {
  const [[row]] = await pool.query(`SELECT ${COLUMNS} FROM match_organizers WHERE id=? LIMIT 1`, [id]);
  return row || null;
}

/**
 * Valida el organizer_id que llega al crear/editar/programar un partido.
 * Devuelve el id, null (sin organizador) o false si no existe o está inactivo.
 */
export async function resolveOrganizerId(db, value) {
  // Sin organizador: también cuando no llega (versiones de la app sin este campo).
  if (value === undefined || value === null || value === '' || value === 0 || value === '0') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return false;
  const [[row]] = await db.query('SELECT id FROM match_organizers WHERE id=? AND is_active=1 LIMIT 1', [id]);
  return row ? id : false;
}

/** GET /api/admin/organizers?include_inactive=1 */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const showInactive = ['1', 'true'].includes(String(req.query.include_inactive || ''));
    const [rows] = await pool.query(
      `SELECT ${COLUMNS} FROM match_organizers ${showInactive ? '' : 'WHERE is_active = 1'}
       ORDER BY is_active DESC, first_name ASC, last_name ASC`
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('[GET /admin/organizers]', e);
    res.status(500).json({ ok: false, msg: 'Error listando organizadores' });
  }
});

/** GET /api/admin/organizers/:id */
router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const organizer = await getOrganizer(Number(req.params.id));
    if (!organizer) return res.status(404).json({ ok: false, msg: 'Organizador no encontrado' });
    res.json({ ok: true, data: organizer });
  } catch (e) {
    console.error('[GET /admin/organizers/:id]', e);
    res.status(500).json({ ok: false, msg: 'Error obteniendo el organizador' });
  }
});

/** POST /api/admin/organizers — body { first_name, last_name, is_active } */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const firstName = cleanName(req.body?.first_name);
    const lastName = cleanName(req.body?.last_name);
    if (!firstName || !lastName) return res.status(400).json({ ok: false, msg: 'Escribe el nombre y el primer apellido' });
    const [result] = await pool.query(
      'INSERT INTO match_organizers (first_name, last_name, is_active) VALUES (?,?,?)',
      [firstName, lastName, req.body?.is_active === false || req.body?.is_active === 0 ? 0 : 1]
    );
    res.status(201).json({ ok: true, msg: 'Organizador creado', data: await getOrganizer(result.insertId) });
  } catch (e) {
    console.error('[POST /admin/organizers]', e);
    res.status(500).json({ ok: false, msg: 'Error creando el organizador' });
  }
});

/** PUT /api/admin/organizers/:id — actualiza solo lo enviado */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!(await getOrganizer(id))) return res.status(404).json({ ok: false, msg: 'Organizador no encontrado' });

    const updates = [];
    const params = [];
    for (const key of ['first_name', 'last_name']) {
      if (req.body?.[key] === undefined) continue;
      const value = cleanName(req.body[key]);
      if (!value) return res.status(400).json({ ok: false, msg: 'El nombre y el primer apellido son obligatorios' });
      updates.push(`${key}=?`);
      params.push(value);
    }
    if (req.body?.is_active !== undefined) {
      updates.push('is_active=?');
      params.push(req.body.is_active === false || req.body.is_active === 0 || req.body.is_active === '0' ? 0 : 1);
    }
    if (!updates.length) return res.status(400).json({ ok: false, msg: 'No hay cambios que guardar' });

    params.push(id);
    await pool.query(`UPDATE match_organizers SET ${updates.join(', ')} WHERE id=?`, params);
    res.json({ ok: true, msg: 'Organizador actualizado', data: await getOrganizer(id) });
  } catch (e) {
    console.error('[PUT /admin/organizers/:id]', e);
    res.status(500).json({ ok: false, msg: 'Error actualizando el organizador' });
  }
});

/** POST /api/admin/organizers/:id/photo — form-data, clave "photo" */
// multer avisa de un archivo no válido con un error: se responde 400 en vez de 500.
const receivePhoto = (req, res, next) => upload.single('photo')(req, res, (error) => {
  if (error) return res.status(400).json({ ok: false, msg: error.message || 'Imagen no válida' });
  return next();
});

router.post('/:id/photo', requireAuth, requireAdmin, receivePhoto, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ ok: false, msg: 'No se ha recibido ninguna imagen' });
    const current = await getOrganizer(id);
    if (!current) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ ok: false, msg: 'Organizador no encontrado' });
    }

    const fileUrl = `/uploads/organizers/${req.file.filename}`;
    await pool.query('UPDATE match_organizers SET photo_url=? WHERE id=?', [fileUrl, id]);

    // Borra la foto anterior para no acumular archivos.
    if (String(current.photo_url || '').startsWith('/uploads/organizers/')) {
      fs.unlink(path.join(uploadDir, path.basename(current.photo_url)), () => {});
    }
    res.json({ ok: true, msg: 'Foto actualizada', photo_url: fileUrl, data: await getOrganizer(id) });
  } catch (e) {
    console.error('[POST /admin/organizers/:id/photo]', e);
    res.status(500).json({ ok: false, msg: 'Error subiendo la foto' });
  }
});

export default router;
