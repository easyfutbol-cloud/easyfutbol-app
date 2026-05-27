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

function getFallbackLocationFromCity(city = '') {
  const normalized = String(city || '').trim().toLowerCase();
  if (['avilés', 'aviles', 'oviedo', 'gijón', 'gijon', 'asturias'].includes(normalized)) {
    return { id: 2, name: 'Asturias', slug: 'asturias' };
  }
  return { id: 1, name: 'Valladolid', slug: 'valladolid' };
}

async function getLocationById(conn, locationId) {
  const [[location]] = await conn.query(
    'SELECT id, name, slug FROM locations WHERE id=? LIMIT 1',
    [locationId]
  );
  return location || null;
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
 *   "duration_min": 60,
 *   "easypass_cost": 1,
 *   "location_id": 1,
 *   "locationId": 1,
 *   "location_slug": "valladolid"
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
      duration_min = 60,
      easypass_cost = 1,
      location_id,
      locationId,
      location_slug
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
    const easyPassCost = Math.max(1, Number(easypass_cost || 1));
    if (!isPositiveInt(cap) || cap > 50) {
      return res.status(400).json({ ok:false, msg:'Capacidad inválida (1-50)' });
    }
    if (!isPositiveInt(dur) || dur > 240) {
      return res.status(400).json({ ok:false, msg:'Duración inválida (1-240)' });
    }
    if (!(price >= 0 && price <= 1000)) {
      return res.status(400).json({ ok:false, msg:'Precio inválido (0-1000€)' });
    }
    if (!Number.isInteger(easyPassCost) || easyPassCost <= 0 || easyPassCost > 50) {
      return res.status(400).json({ ok:false, msg:'Coste EasyPass inválido (1-50)' });
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

    const fallbackLocation = getFallbackLocationFromCity(city);
    let matchLocationId = Number(location_id || locationId || 0);

    if (!matchLocationId && location_slug) {
      const [[locationBySlug]] = await conn.query(
        'SELECT id, name, slug FROM locations WHERE slug=? LIMIT 1',
        [String(location_slug).trim().toLowerCase()]
      );
      if (locationBySlug?.id) matchLocationId = Number(locationBySlug.id);
    }

    if (!matchLocationId) {
      matchLocationId = fallbackLocation.id;
    }

    const location = await getLocationById(conn, matchLocationId);
    if (!location) {
      await conn.rollback();
      return res.status(400).json({ ok:false, msg:'Localización EasyPass inválida' });
    }

    // Crear el partido
    const [ins] = await conn.query(
      `INSERT INTO matches
       (title, field_id, city, location_id, starts_at, duration_min, price_eur, easypass_cost, capacity, spots_taken, status)
       VALUES (?,?,?,?,?,?,?,?,?,0,'scheduled')`, // 'scheduled' => visible y pagable en /matches
      [title, fieldId, city, matchLocationId, startsAt, dur, price, easyPassCost, cap]
    );

    await conn.commit();
    res.status(201).json({
      ok:true,
      id: ins.insertId,
      location_id: matchLocationId,
      locationId: matchLocationId,
      locationName: location.name,
      easypass_cost: easyPassCost,
      easyPassCost,
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error creando partido' });
  } finally {
    conn.release();
  }
});

/**
 * 4) Ajuste manual de EasyPass (ADMIN)
 * Body esperado:
 * {
 *   "amount": 3,                         // puede ser positivo o negativo, pero no 0
 *   "reason": "Compensación por incidencia",
 *   "location_id": 1                     // 1 Valladolid, 2 Asturias
 * }
 */
router.post('/admin/users/:id/easypass-adjust', requireAuth, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const userId = Number(req.params.id);
    const amount = Number(req.body?.amount);
    const reason = String(req.body?.reason || '').trim();
    const requestedLocationId = Number(req.body?.location_id || req.body?.locationId || 1);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok:false, msg:'Usuario inválido' });
    }

    if (!Number.isInteger(amount) || amount === 0) {
      return res.status(400).json({ ok:false, msg:'La cantidad debe ser un número entero distinto de 0' });
    }

    if (!reason) {
      return res.status(400).json({ ok:false, msg:'El motivo es obligatorio' });
    }
    if (!Number.isInteger(requestedLocationId) || requestedLocationId <= 0) {
      return res.status(400).json({ ok:false, msg:'Localización EasyPass inválida' });
    }

    await conn.beginTransaction();

    const [[user]] = await conn.query(
      'SELECT id, name, email, easypass_balance FROM users WHERE id=? LIMIT 1 FOR UPDATE',
      [userId]
    );

    if (!user) {
      await conn.rollback();
      return res.status(404).json({ ok:false, msg:'Usuario no encontrado' });
    }

    const location = await getLocationById(conn, requestedLocationId);
    if (!location) {
      await conn.rollback();
      return res.status(400).json({ ok:false, msg:'Localización EasyPass no encontrada' });
    }

    const [[balanceRow]] = await conn.query(
      `SELECT balance
       FROM user_easypass_balances
       WHERE user_id=?
         AND location_id=?
       FOR UPDATE`,
      [userId, requestedLocationId]
    );

    const currentLocationBalance = Number(balanceRow?.balance || 0);
    const nextLocationBalance = currentLocationBalance + amount;

    if (nextLocationBalance < 0) {
      await conn.rollback();
      return res.status(400).json({ ok:false, msg:`El ajuste dejaría el saldo de EasyPass de ${location.name} en negativo` });
    }

    await conn.query(
      `INSERT INTO user_easypass_balances (user_id, location_id, balance)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE balance = VALUES(balance)`,
      [userId, requestedLocationId, nextLocationBalance]
    );

    const [[totalRow]] = await conn.query(
      `SELECT COALESCE(SUM(balance), 0) AS totalBalance
       FROM user_easypass_balances
       WHERE user_id=?`,
      [userId]
    );

    const nextGlobalBalance = Number(totalRow?.totalBalance || 0);

    await conn.query(
      'UPDATE users SET easypass_balance=? WHERE id=?',
      [nextGlobalBalance, userId]
    );

    await conn.query(
      `INSERT INTO easypass_transactions (user_id, type, amount, description, created_at)
       VALUES (?, 'admin_adjustment', ?, ?, NOW())`,
      [userId, amount, `Ajuste manual admin: ${reason} - EasyPass ${location.name}`]
    );

    await conn.commit();

    return res.json({
      ok:true,
      msg:'Ajuste de EasyPass aplicado correctamente',
      data: {
        user: {
          id: Number(user.id),
          name: user.name,
          email: user.email,
        },
        amount,
        reason,
        location_id: requestedLocationId,
        locationId: requestedLocationId,
        location_name: location.name,
        locationName: location.name,
        balance: nextLocationBalance,
        easyPassBalance: nextLocationBalance,
        credits: nextLocationBalance,
        globalEasyPassBalance: nextGlobalBalance,
      },
    });
  } catch (e) {
    await conn.rollback();
    console.error(e);
    return res.status(500).json({ ok:false, msg:'Error aplicando ajuste manual de EasyPass' });
  } finally {
    conn.release();
  }
});


/**
 * 5) Listar usuarios registrados (ADMIN)
 * Query opcional:
 * - location=all | valladolid | asturias | undefined
 * - search=texto, id, teléfono o email
 */
router.get('/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const location = String(req.query?.location || 'all').trim().toLowerCase();
    const search = String(req.query?.search || '').trim();

    const where = [];
    const params = [];

    if (location === 'valladolid' || location === 'asturias') {
      where.push('preferred_location = ?');
      params.push(location);
    } else if (location === 'undefined' || location === 'sin_definir' || location === 'null') {
      where.push('(preferred_location IS NULL OR preferred_location = \'\')');
    }

    if (search) {
      const like = `%${search}%`;
      where.push(`(
        CAST(id AS CHAR) LIKE ?
        OR name LIKE ?
        OR email LIKE ?
        OR phone LIKE ?
      )`);
      params.push(like, like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT
         id,
         name,
         email,
         phone,
         preferred_location,
         role,
         created_at
       FROM users
       ${whereSql}
       ORDER BY id DESC
       LIMIT 500`,
      params
    );

    return res.json({
      ok: true,
      data: rows.map((user) => ({
        id: Number(user.id),
        name: user.name,
        email: user.email,
        phone: user.phone,
        preferred_location: user.preferred_location,
        preferredLocation: user.preferred_location,
        role: user.role,
        created_at: user.created_at,
        createdAt: user.created_at,
      })),
    });
  } catch (e) {
    console.error('Error listando usuarios admin', e);
    return res.status(500).json({ ok: false, msg: 'Error listando usuarios' });
  }
});

export default router;
