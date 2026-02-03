import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = Router();

/** Lista blanca de ciudades permitidas */
export const ALLOWED_CITIES = [
  'Valladolid', 'León', 'Oviedo', 'Palencia', 'Salamanca', 'Gijón', 'Avilés', 'Bilbao'
];

/** Helpers */
function isValidCity(city) {
  return ALLOWED_CITIES.includes(city);
}
function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}
function toMySQLDateTime(d) {
  // Recibe Date o string ISO; devuelve 'YYYY-MM-DD HH:mm:ss'
  const date = (d instanceof Date) ? d : new Date(d);
  const pad = (x) => String(x).padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}`;
}

/** 1) Ciudades permitidas */
router.get('/admin/cities', requireAuth, requireAdmin, (_req, res) => {
  res.json({ ok: true, data: ALLOWED_CITIES });
});

/** 2) Campos por ciudad (para poblar el selector de la app) */
router.get('/admin/fields', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { city } = req.query;
    if (!city || !isValidCity(city)) {
      return res.status(400).json({ ok:false, msg:'Ciudad inválida o ausente' });
    }
    const [rows] = await pool.query(
      `SELECT id, name, city, address
       FROM fields
       WHERE city = ?
       ORDER BY name ASC`,
      [city]
    );
    res.json({ ok:true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error listando campos' });
  }
});

/**
 * 3) Crear partido (ADMIN)
 * Body esperado:
 * {
 *   "title": "Miércoles Noche",
 *   "city": "Valladolid",
 *   "field_id": 1,          // O bien "field_name": "Ribera..."
 *   "date": "2025-10-05",   // YYYY-MM-DD (local Europe/Madrid)
 *   "time": "21:00",        // HH:mm (24h)
 *   "price_eur": 3.9,
 *   "capacity": 14,
 *   "duration_min": 60
 * }
 * Nota: price_eur y capacity se usan directamente en el flujo de pago Stripe
 * (/matches/:id/pay), así que deben venir siempre bien informados.
 */
router.post('/admin/matches', requireAuth, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      title,
      city,
      field_id,
      field_name,   // alternativo
      date,         // 'YYYY-MM-DD'
      time,         // 'HH:mm'
      price_eur,
      capacity,
      duration_min = 60
    } = req.body || {};

    // Validaciones básicas
    if (!title || !city || !(field_id || field_name) || !date || !time) {
      return res.status(400).json({ ok:false, msg:'Faltan campos obligatorios' });
    }
    if (!isValidCity(city)) {
      return res.status(400).json({ ok:false, msg:'Ciudad no permitida' });
    }
    const cap = Number(capacity);
    const price = Number(price_eur);
    const dur = Number(duration_min);
    if (!isPositiveInt(cap) || cap > 50) {
      return res.status(400).json({ ok:false, msg:'Capacidad inválida (1-50)' });
    }
    if (!isPositiveInt(dur) || dur > 240) {
      return res.status(400).json({ ok:false, msg:'Duración inválida (1-240)' });
    }
    if (!(price >= 0 && price <= 1000)) {
      return res.status(400).json({ ok:false, msg:'Precio inválido (0-1000€)' });
    }

    // Construir starts_at a partir de date + time (interpretado como hora local)
    const startsAt = toMySQLDateTime(new Date(`${date}T${time}:00`));

    // Validar que es futuro
    if (new Date(`${date}T${time}:00`).getTime() < Date.now() - 60_000) {
      return res.status(400).json({ ok:false, msg:'La fecha/hora debe ser futura' });
    }

    await conn.beginTransaction();

    // Resolver field_id
    let fieldId = field_id ? Number(field_id) : null;

    // Si no viene field_id, crear/asegurar campo por nombre + ciudad
    if (!fieldId) {
      const name = String(field_name || '').trim();
      if (!name) {
        await conn.rollback();
        return res.status(400).json({ ok:false, msg:'Nombre de campo requerido' });
      }
      // Buscar si existe
      const [[found]] = await conn.query(
        'SELECT id FROM fields WHERE name=? AND city=? LIMIT 1',
        [name, city]
      );
      if (found?.id) {
        fieldId = found.id;
      } else {
        const [insField] = await conn.query(
          'INSERT INTO fields (name, city) VALUES (?, ?)',
          [name, city]
        );
        fieldId = insField.insertId;
      }
    }

    // Crear el partido
    const [ins] = await conn.query(
      `INSERT INTO matches
       (title, field_id, city, starts_at, duration_min, price_eur, capacity, spots_taken, status)
       VALUES (?,?,?,?,?,?,?,0,'scheduled')`, // 'scheduled' => visible y pagable en /matches
      [title, fieldId, city, startsAt, dur, price, cap]
    );

    await conn.commit();
    res.status(201).json({ ok:true, id: ins.insertId });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error creando partido' });
  } finally {
    conn.release();
  }
});

export default router;
