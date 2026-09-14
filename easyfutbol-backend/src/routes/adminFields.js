// Gestión de campos (fields) desde la app de administración.
// Montado en /api/admin/fields
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import { ALLOWED_CITIES } from './admin.js';

const router = express.Router();

const uploadDir = path.join(process.cwd(), 'uploads/fields');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `field-${req.params.id || 'new'}-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype || '')) return cb(new Error('El archivo debe ser una imagen'));
    cb(null, true);
  },
});

const FIELD_COLUMNS = `id, name, city, address, maps_url, image_url, arrival_instructions,
                       CAST(is_active AS UNSIGNED) AS is_active, created_at`;

/** Normaliza texto opcional: recorta y devuelve null si queda vacío */
function cleanText(value, maxLength) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

/** Valida que una URL sea http(s) o una ruta local de /uploads */
function cleanUrl(value, maxLength = 500) {
  const text = cleanText(value, maxLength);
  if (!text) return null;
  if (/^https?:\/\//i.test(text) || text.startsWith('/uploads/')) return text;
  return false; // marca de URL inválida
}

function isValidCity(city) {
  return ALLOWED_CITIES.includes(city);
}

async function findDuplicate(name, city, excludeId = null) {
  const [[row]] = await pool.query(
    `SELECT id FROM fields
     WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND city = ? ${excludeId ? 'AND id <> ?' : ''}
     LIMIT 1`,
    excludeId ? [name, city, excludeId] : [name, city]
  );
  return row?.id || null;
}

async function getFieldById(id) {
  const [[row]] = await pool.query(`SELECT ${FIELD_COLUMNS} FROM fields WHERE id=? LIMIT 1`, [id]);
  return row || null;
}

/**
 * GET /api/admin/fields
 * Query: city (opcional), include_inactive=1 (opcional)
 * Sin ciudad devuelve todos los campos (útil para el listado de administración).
 */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { city, include_inactive: includeInactive } = req.query;
    const showInactive = String(includeInactive || '') === '1' || includeInactive === 'true';

    const where = [];
    const params = [];

    if (city) {
      if (!isValidCity(city)) {
        return res.status(400).json({ ok: false, msg: 'Ciudad inválida' });
      }
      where.push('city = ?');
      params.push(city);
    }
    if (!showInactive) where.push('is_active = 1');

    const [rows] = await pool.query(
      `SELECT ${FIELD_COLUMNS}
       FROM fields
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY city ASC, name ASC`,
      params
    );

    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error('[GET /admin/fields]', e);
    res.status(500).json({ ok: false, msg: 'Error listando campos' });
  }
});

/** GET /api/admin/fields/:id */
router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const field = await getFieldById(id);
    if (!field) return res.status(404).json({ ok: false, msg: 'Campo no encontrado' });

    res.json({ ok: true, data: field });
  } catch (e) {
    console.error('[GET /admin/fields/:id]', e);
    res.status(500).json({ ok: false, msg: 'Error obteniendo el campo' });
  }
});

/**
 * POST /api/admin/fields
 * Body: { name, city, address, maps_url, image_url, arrival_instructions, is_active }
 */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = cleanText(req.body?.name, 120);
    const city = String(req.body?.city || '').trim();

    if (!name) return res.status(400).json({ ok: false, msg: 'El nombre del campo es obligatorio' });
    if (!isValidCity(city)) return res.status(400).json({ ok: false, msg: 'Ciudad inválida o ausente' });

    const mapsUrl = cleanUrl(req.body?.maps_url);
    if (mapsUrl === false) return res.status(400).json({ ok: false, msg: 'El enlace de Maps debe empezar por http:// o https://' });

    const imageUrl = cleanUrl(req.body?.image_url);
    if (imageUrl === false) return res.status(400).json({ ok: false, msg: 'El enlace de la foto debe empezar por http:// o https://' });

    const duplicateId = await findDuplicate(name, city);
    if (duplicateId) {
      return res.status(409).json({ ok: false, msg: `Ya existe un campo con ese nombre en ${city}`, data: { id: duplicateId } });
    }

    const [result] = await pool.query(
      `INSERT INTO fields (name, city, address, maps_url, image_url, arrival_instructions, is_active)
       VALUES (?,?,?,?,?,?,?)`,
      [
        name,
        city,
        cleanText(req.body?.address, 190),
        mapsUrl,
        imageUrl,
        cleanText(req.body?.arrival_instructions, 600),
        req.body?.is_active === 0 || req.body?.is_active === false ? 0 : 1,
      ]
    );

    const field = await getFieldById(result.insertId);
    res.status(201).json({ ok: true, msg: 'Campo creado', data: field });
  } catch (e) {
    console.error('[POST /admin/fields]', e);
    res.status(500).json({ ok: false, msg: 'Error creando el campo' });
  }
});

/**
 * PUT /api/admin/fields/:id
 * Actualiza solo los campos enviados en el body.
 */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, msg: 'ID inválido' });

    const current = await getFieldById(id);
    if (!current) return res.status(404).json({ ok: false, msg: 'Campo no encontrado' });

    const updates = [];
    const params = [];

    if (req.body?.name !== undefined) {
      const name = cleanText(req.body.name, 120);
      if (!name) return res.status(400).json({ ok: false, msg: 'El nombre del campo es obligatorio' });
      updates.push('name=?');
      params.push(name);
    }

    if (req.body?.city !== undefined) {
      const city = String(req.body.city || '').trim();
      if (!isValidCity(city)) return res.status(400).json({ ok: false, msg: 'Ciudad inválida' });
      updates.push('city=?');
      params.push(city);
    }

    const nextName = req.body?.name !== undefined ? cleanText(req.body.name, 120) : current.name;
    const nextCity = req.body?.city !== undefined ? String(req.body.city || '').trim() : current.city;
    const duplicateId = await findDuplicate(nextName, nextCity, id);
    if (duplicateId) {
      return res.status(409).json({ ok: false, msg: `Ya existe otro campo con ese nombre en ${nextCity}` });
    }

    if (req.body?.address !== undefined) {
      updates.push('address=?');
      params.push(cleanText(req.body.address, 190));
    }

    if (req.body?.maps_url !== undefined) {
      const mapsUrl = cleanUrl(req.body.maps_url);
      if (mapsUrl === false) return res.status(400).json({ ok: false, msg: 'El enlace de Maps debe empezar por http:// o https://' });
      updates.push('maps_url=?');
      params.push(mapsUrl);
    }

    if (req.body?.image_url !== undefined) {
      const imageUrl = cleanUrl(req.body.image_url);
      if (imageUrl === false) return res.status(400).json({ ok: false, msg: 'El enlace de la foto debe empezar por http:// o https://' });
      updates.push('image_url=?');
      params.push(imageUrl);
    }

    if (req.body?.arrival_instructions !== undefined) {
      updates.push('arrival_instructions=?');
      params.push(cleanText(req.body.arrival_instructions, 600));
    }

    if (req.body?.is_active !== undefined) {
      updates.push('is_active=?');
      params.push(req.body.is_active === 0 || req.body.is_active === false || req.body.is_active === '0' ? 0 : 1);
    }

    if (!updates.length) return res.status(400).json({ ok: false, msg: 'No hay cambios que guardar' });

    params.push(id);
    await pool.query(`UPDATE fields SET ${updates.join(', ')} WHERE id=?`, params);

    const field = await getFieldById(id);
    res.json({ ok: true, msg: 'Campo actualizado', data: field });
  } catch (e) {
    console.error('[PUT /admin/fields/:id]', e);
    res.status(500).json({ ok: false, msg: 'Error actualizando el campo' });
  }
});

/**
 * POST /api/admin/fields/:id/photo
 * Sube la foto del campo (form-data, clave "photo").
 */
router.post('/:id/photo', requireAuth, requireAdmin, upload.single('photo'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, msg: 'ID inválido' });
    if (!req.file) return res.status(400).json({ ok: false, msg: 'No se ha recibido ninguna imagen' });

    const current = await getFieldById(id);
    if (!current) return res.status(404).json({ ok: false, msg: 'Campo no encontrado' });

    const fileUrl = `/uploads/fields/${req.file.filename}`;
    await pool.query('UPDATE fields SET image_url=? WHERE id=?', [fileUrl, id]);

    // Borramos la foto anterior si era un archivo local, para no acumular basura
    try {
      const prevUrl = current.image_url || '';
      if (prevUrl.startsWith('/uploads/fields/')) {
        const prevPath = path.join(process.cwd(), prevUrl.replace(/^\//, '').split('?')[0]);
        if (fs.existsSync(prevPath)) fs.unlinkSync(prevPath);
      }
    } catch (cleanupError) {
      console.warn('[POST /admin/fields/:id/photo] No se pudo borrar la foto anterior:', cleanupError?.message || cleanupError);
    }

    const field = await getFieldById(id);
    res.json({ ok: true, msg: 'Foto actualizada', image_url: fileUrl, data: field });
  } catch (e) {
    console.error('[POST /admin/fields/:id/photo]', e);
    res.status(500).json({ ok: false, msg: 'Error subiendo la foto del campo' });
  }
});

export default router;
