import { Router } from 'express';
import Stripe from 'stripe';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';

// --- Stripe setup ---
const stripeSecret = process.env.STRIPE_SECRET_KEY;
if (!stripeSecret) {
  throw new Error('Falta STRIPE_SECRET_KEY en el .env del backend');
}

const stripe = new Stripe(stripeSecret, {
  apiVersion: '2023-10-16',
});

const STRIPE_SUCCESS_URL =
  process.env.STRIPE_SUCCESS_URL || 'https://easyfutbol.es/pago-ok';
const STRIPE_CANCEL_URL =
  process.env.STRIPE_CANCEL_URL || 'https://easyfutbol.es/pago-cancelado';

const MAX_TICKETS_PER_PURCHASE = 8;


const router = Router();

const normalizeCity = (value = '') => String(value || '').trim().toLowerCase();

const getFallbackLocationFromCity = (city = '') => {
  const normalized = normalizeCity(city);
  if (['avilés', 'aviles', 'oviedo', 'gijón', 'gijon', 'asturias'].includes(normalized)) {
    return { id: 2, name: 'Asturias', slug: 'asturias' };
  }
  return { id: 1, name: 'Valladolid', slug: 'valladolid' };
};

const decorateMatchLocation = (row) => {
  const fallback = getFallbackLocationFromCity(row?.city);
  const locationId = Number(row?.location_id || row?.locationId || fallback.id);
  const locationName = row?.location_name || row?.locationName || fallback.name;
  const locationSlug = row?.location_slug || row?.locationSlug || fallback.slug;

  return {
    ...row,
    location_id: locationId,
    locationId,
    location_name: locationName,
    locationName,
    location_slug: locationSlug,
    locationSlug,
    easypass_cost: Number(row?.easypass_cost || 1),
    easyPassCost: Number(row?.easypass_cost || 1),
  };
};

/**
 * Listado de partidos abiertos
 */
router.get('/matches', async (req, res) => {
  try {
    const onlyOpen = req.query.only_open === '1';

    const [rows] = await pool.query(
      `SELECT m.id,
              m.title,
              m.city,
              COALESCE(m.location_id, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END) AS location_id,
              COALESCE(l.name, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 'Asturias' ELSE 'Valladolid' END) AS location_name,
              COALESCE(l.slug, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 'asturias' ELSE 'valladolid' END) AS location_slug,
              m.starts_at,
              m.duration_min,
              m.price_eur,
              COALESCE(m.easypass_cost, 1) AS easypass_cost,
              m.capacity,
              m.spots_taken,
              m.status,
              COALESCE(m.has_aftergame, 0) AS has_aftergame,
              (m.capacity - m.spots_taken) AS spots_remaining,
              CASE WHEN m.spots_taken >= m.capacity THEN 1 ELSE 0 END AS is_full,
              f.name AS field_name
       FROM matches m
       JOIN fields f ON f.id = m.field_id
       LEFT JOIN locations l ON l.id = m.location_id
       ${onlyOpen ? "WHERE m.status IN ('scheduled','open')" : ''}
       ORDER BY m.starts_at ASC`
    );

    const data = rows.map((row) => {
      const decorated = decorateMatchLocation(row);
      return {
        ...decorated,
        spots_remaining: Math.max(0, Number(row.spots_remaining) || 0),
        is_full: Number(row.is_full) === 1,
      };
    });

    return res.json({ ok: true, data });
  } catch (e) {
    console.error('Error listando partidos', e);
    return res
      .status(500)
      .json({ ok: false, msg: 'Error listando partidos' });
  }
});

/**
 * Detalle de un partido
 */
router.get('/matches/:id', async (req, res) => {
/**
 * Asistentes de un partido (solo confirmados)
 * Devuelve: [{ user_id, username, avatar_url, ticket_type }]
 */
router.get('/matches/:id/attendees', async (req, res) => {
  try {
    const matchId = Number(req.params.id);

    if (!Number.isInteger(matchId) || matchId <= 0) {
      return res.status(400).json({ ok: false, msg: 'ID de partido inválido' });
    }

    // Verificar que el partido existe (rápido)
    const [[m]] = await pool.query('SELECT id FROM matches WHERE id=? LIMIT 1', [matchId]);
    if (!m) {
      return res.status(404).json({ ok: false, msg: 'Partido no encontrado' });
    }

    const [rows] = await pool.query(
      `SELECT 
          u.id AS user_id,
          u.name AS username,
          u.avatar_url,
          i.ticket_type
       FROM inscriptions i
       JOIN users u ON u.id = i.user_id
       WHERE i.match_id=?
         AND i.status='confirmed'
       ORDER BY 
         CASE i.ticket_type WHEN 'white' THEN 0 WHEN 'black' THEN 1 ELSE 2 END,
         u.name ASC`,
      [matchId]
    );

    return res.json({ ok: true, data: { attendees: rows } });
  } catch (e) {
    console.error('Error listando asistentes', e);
    return res.status(500).json({ ok: false, msg: 'Error listando asistentes' });
  }
});
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, msg: 'ID de partido inválido' });
    }

    const [rows] = await pool.query(
      `SELECT m.id,
              m.title,
              m.city,
              COALESCE(m.location_id, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END) AS location_id,
              COALESCE(l.name, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 'Asturias' ELSE 'Valladolid' END) AS location_name,
              COALESCE(l.slug, CASE WHEN LOWER(m.city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 'asturias' ELSE 'valladolid' END) AS location_slug,
              m.starts_at,
              m.duration_min,
              m.price_eur,
              COALESCE(m.easypass_cost, 1) AS easypass_cost,
              m.capacity,
              m.spots_taken,
              m.status,
              COALESCE(m.has_aftergame, 0) AS has_aftergame,
              (m.capacity - m.spots_taken) AS spots_remaining,
              CASE WHEN m.spots_taken >= m.capacity THEN 1 ELSE 0 END AS is_full,
              f.name AS field_name
       FROM matches m
       JOIN fields f ON f.id = m.field_id
       LEFT JOIN locations l ON l.id = m.location_id
       WHERE m.id=?`,
      [id]
    );

    if (!rows.length) {
      return res
        .status(404)
        .json({ ok: false, msg: 'Partido no encontrado' });
    }

    const match = decorateMatchLocation(rows[0]);

    match.spots_remaining = Math.max(0, Number(match.spots_remaining) || 0);
    match.is_full = Number(match.is_full) === 1;

    // Calcular plazas restantes por color usando el mismo criterio que en /matches/:id/pay
    const capacity = Number(match.capacity) || 0;
    const perColorLimit = capacity ? Math.floor(capacity / 2) : 8;

    const [[whiteRow]] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM inscriptions
       WHERE match_id=? AND ticket_type='white' AND status IN ('pending','confirmed')`,
      [id]
    );

    const [[blackRow]] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM inscriptions
       WHERE match_id=? AND ticket_type='black' AND status IN ('pending','confirmed')`,
      [id]
    );

    const whiteTaken = Number(whiteRow.count) || 0;
    const blackTaken = Number(blackRow.count) || 0;

    match.white_remaining = Math.max(0, perColorLimit - whiteTaken);
    match.black_remaining = Math.max(0, perColorLimit - blackTaken);

    // añadir flag de admin
    match.is_admin = req.user?.role === 'admin';
    match.has_aftergame = Number(match.has_aftergame) === 1;

    return res.json({ ok: true, data: match });
  } catch (e) {
    console.error('Error obteniendo partido', e);
    return res
      .status(500)
      .json({ ok: false, msg: 'Error obteniendo partido' });
  }
});

/**
 * Iniciar pago de un partido (Stripe Checkout)
 * Crea/actualiza una inscripción en estado "pending" y devuelve la URL de pago
 */
router.post('/matches/:id/pay', requireAuth, async (req, res) => {
/**
 * Apuntarse con EasyPass respetando la localización del partido
 */
router.post('/matches/:id/join-with-easypass', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const matchId = Number(req.params.id);

  const { ticketType, ticket_type, shirtColor, quantity } = req.body || {};
  const rawTicketType = ticketType || ticket_type || shirtColor || 'white';
  const allowedTypes = ['white', 'black'];
  const finalTicketType = allowedTypes.includes(rawTicketType) ? rawTicketType : 'white';

  const rawQty = Number(quantity) || 1;
  const safeQuantity = Math.max(1, Math.min(rawQty, MAX_TICKETS_PER_PURCHASE));

  if (!Number.isInteger(matchId) || matchId <= 0) {
    return res.status(400).json({ ok: false, msg: 'ID de partido inválido' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[match]] = await conn.query(
      `SELECT id,
              title,
              city,
              COALESCE(location_id, CASE WHEN LOWER(city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END) AS location_id,
              COALESCE(easypass_cost, 1) AS easypass_cost,
              capacity,
              spots_taken,
              status
       FROM matches
       WHERE id=?
       FOR UPDATE`,
      [matchId]
    );

    if (!match) {
      await conn.rollback();
      return res.status(404).json({ ok: false, msg: 'Partido no encontrado' });
    }

    const payableStatuses = ['scheduled', 'open'];
    if (!payableStatuses.includes(match.status)) {
      await conn.rollback();
      return res.status(400).json({ ok: false, msg: 'El partido no está disponible' });
    }

    const capacity = Number(match.capacity) || 0;
    const spotsTaken = Number(match.spots_taken) || 0;

    if (!Number.isFinite(capacity) || capacity <= 0) {
      await conn.rollback();
      return res.status(400).json({ ok: false, msg: 'La capacidad de este partido no está configurada correctamente' });
    }

    if (spotsTaken >= capacity || spotsTaken + safeQuantity > capacity) {
      await conn.rollback();
      return res.status(400).json({ ok: false, msg: 'No hay plazas suficientes para este partido' });
    }

    const [[already]] = await conn.query(
      `SELECT id
       FROM inscriptions
       WHERE user_id = ?
         AND match_id = ?
         AND status IN ('pending','confirmed')
       LIMIT 1`,
      [userId, matchId]
    );

    if (already) {
      await conn.rollback();
      return res.status(400).json({ ok: false, msg: 'Ya estás apuntado a este partido' });
    }

    const [[colorRow]] = await conn.query(
      `SELECT COUNT(*) AS count
       FROM inscriptions
       WHERE match_id=?
         AND ticket_type=?
         AND status IN ('pending','confirmed')`,
      [matchId, finalTicketType]
    );

    const perColorLimit = capacity ? Math.floor(capacity / 2) : 8;
    const currentColorCount = Number(colorRow.count) || 0;
    const remainingForColor = perColorLimit - currentColorCount;

    if (remainingForColor <= 0 || safeQuantity > remainingForColor) {
      await conn.rollback();
      return res.status(400).json({
        ok: false,
        msg: finalTicketType === 'white'
          ? 'No quedan plazas suficientes con camiseta blanca para este partido'
          : 'No quedan plazas suficientes con camiseta negra para este partido',
      });
    }

    const fallbackLocation = getFallbackLocationFromCity(match.city);
    const locationId = Number(match.location_id || fallbackLocation.id);
    const locationName = locationId === 2 ? 'Asturias' : fallbackLocation.name;
    const easyPassCost = Math.max(1, Number(match.easypass_cost || 1));
    const totalEasyPassCost = easyPassCost * safeQuantity;

    const [[balanceRow]] = await conn.query(
      `SELECT balance
       FROM user_easypass_balances
       WHERE user_id = ?
         AND location_id = ?
       FOR UPDATE`,
      [userId, locationId]
    );

    const currentLocationBalance = Number(balanceRow?.balance || 0);
    if (currentLocationBalance < totalEasyPassCost) {
      await conn.rollback();
      return res.status(400).json({
        ok: false,
        msg: `No tienes EasyPass suficientes de ${locationName}. Este partido solo acepta EasyPass de ${locationName}.`,
        location_id: locationId,
        locationId,
        locationName,
        requiredEasyPass: totalEasyPassCost,
        currentEasyPass: currentLocationBalance,
      });
    }

    await conn.query(
      `UPDATE user_easypass_balances
       SET balance = balance - ?
       WHERE user_id = ?
         AND location_id = ?`,
      [totalEasyPassCost, userId, locationId]
    );

    await conn.query(
      `UPDATE users
       SET easypass_balance = GREATEST(COALESCE(easypass_balance, 0) - ?, 0)
       WHERE id = ?`,
      [totalEasyPassCost, userId]
    );

    const inscriptionIds = [];
    for (let i = 0; i < safeQuantity; i += 1) {
      const [insertRes] = await conn.query(
        `INSERT INTO inscriptions (user_id, match_id, status, ticket_type)
         VALUES (?,?, 'confirmed', ?)`,
        [userId, matchId, finalTicketType]
      );
      inscriptionIds.push(insertRes.insertId);
    }

    await conn.query(
      `UPDATE matches
       SET spots_taken = spots_taken + ?
       WHERE id = ?`,
      [safeQuantity, matchId]
    );

    await conn.query(
      `INSERT INTO easypass_transactions
        (user_id, type, amount, description, event_id, payment_reference, created_at)
       VALUES (?, 'spend', ?, ?, ?, ?, NOW())`,
      [
        userId,
        -totalEasyPassCost,
        `Inscripción partido ${match.title || `#${matchId}`} - EasyPass ${locationName}`,
        matchId,
        `match_${matchId}_${userId}_${Date.now()}`,
      ]
    );

    await conn.commit();

    return res.json({
      ok: true,
      paidWithEasyPass: true,
      inscription_ids: inscriptionIds,
      inscription_id: inscriptionIds[0] || null,
      easyPassSpent: totalEasyPassCost,
      location_id: locationId,
      locationId,
      locationName,
      msg: `Te has apuntado usando ${totalEasyPassCost} EasyPass de ${locationName}`,
    });
  } catch (e) {
    await conn.rollback();
    console.error('Error apuntándose con EasyPass por localización', e);
    return res.status(500).json({ ok: false, msg: 'Error apuntándose con EasyPass' });
  } finally {
    conn.release();
  }
});
  const userId = req.user.id;
  const matchId = Number(req.params.id);

  const { ticketType, quantity } = req.body || {};
  const allowedTypes = ['white', 'black'];
  const finalTicketType = allowedTypes.includes(ticketType) ? ticketType : 'white';

  const rawQty = Number(quantity) || 1;
  const safeQuantity = Math.max(1, Math.min(rawQty, MAX_TICKETS_PER_PURCHASE));

  if (!Number.isInteger(matchId) || matchId <= 0) {
    return res.status(400).json({ ok: false, msg: 'ID de partido inválido' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Bloquear el partido para evitar condiciones de carrera
    const [[match]] = await conn.query(
      `SELECT id,
              title,
              city,
              COALESCE(location_id, CASE WHEN LOWER(city) IN ('avilés','aviles','oviedo','gijón','gijon','asturias') THEN 2 ELSE 1 END) AS location_id,
              starts_at,
              duration_min,
              price_eur,
              COALESCE(easypass_cost, 1) AS easypass_cost,
              capacity,
              spots_taken,
              status
       FROM matches
       WHERE id=?
       FOR UPDATE`,
      [matchId]
    );

    if (!match) {
      await conn.rollback();
      return res
        .status(404)
        .json({ ok: false, msg: 'Partido no encontrado' });
    }

    const payableStatuses = ['scheduled', 'open'];
    if (!payableStatuses.includes(match.status)) {
      await conn.rollback();
      return res.status(400).json({
        ok: false,
        msg: 'El partido no está disponible para pago',
      });
    }

    const capacity = Number(match.capacity) || 0;
    const spotsTaken = Number(match.spots_taken) || 0;

    if (!Number.isFinite(capacity) || capacity <= 0) {
      await conn.rollback();
      return res.status(400).json({
        ok: false,
        msg: 'La capacidad de este partido no está configurada correctamente',
      });
    }

    if (spotsTaken >= capacity) {
      await conn.rollback();
      return res.status(400).json({
        ok: false,
        msg: 'El partido ya está completo',
      });
    }

    // Comprobar que hay plazas suficientes para la cantidad solicitada
    if (spotsTaken + safeQuantity > capacity) {
      await conn.rollback();
      return res.status(400).json({
        ok: false,
        msg: 'No hay plazas suficientes para este partido',
      });
    }

    const price = Number(match.price_eur ?? 0);
    const easyPassCost = Math.max(1, Number(match.easypass_cost || 1));
    const matchLocation = getFallbackLocationFromCity(match.city);
    const locationId = Number(match.location_id || matchLocation.id);
    const locationName = locationId === 2 ? 'Asturias' : matchLocation.name;

    // Comprobar límite de plazas por color (mitad de la capacidad para cada color)
    const [[colorRow]] = await conn.query(
      `SELECT COUNT(*) AS count
       FROM inscriptions
       WHERE match_id=? AND ticket_type=? AND status IN ('pending','confirmed')`,
      [matchId, finalTicketType]
    );

    const perColorLimit = capacity
      ? Math.floor(capacity / 2)
      : 8; // fallback si por lo que sea no viene capacity

    const currentColorCount = Number(colorRow.count) || 0;
    const remainingForColor = perColorLimit - currentColorCount;

    if (remainingForColor <= 0 || safeQuantity > remainingForColor) {
      await conn.rollback();
      return res.status(400).json({
        ok: false,
        msg:
          finalTicketType === 'white'
            ? 'No quedan plazas suficientes con camiseta blanca para este partido'
            : 'No quedan plazas suficientes con camiseta negra para este partido',
      });
    }

    // Si el partido cuesta EasyPass, el saldo debe ser de la misma localización del partido.
    // Esto evita que alguien use EasyPass de Valladolid para apuntarse a un partido de Asturias, o al revés.
    if (!Number.isFinite(price) || price <= 0) {
      const totalEasyPassCost = easyPassCost * safeQuantity;

      const [[balanceRow]] = await conn.query(
        `SELECT balance
         FROM user_easypass_balances
         WHERE user_id = ?
           AND location_id = ?
         FOR UPDATE`,
        [userId, locationId]
      );

      const currentLocationBalance = Number(balanceRow?.balance || 0);
      if (currentLocationBalance < totalEasyPassCost) {
        await conn.rollback();
        return res.status(400).json({
          ok: false,
          msg: `No tienes EasyPass suficientes de ${locationName}. Este partido solo acepta EasyPass de ${locationName}.`,
          location_id: locationId,
          locationId,
          locationName,
          requiredEasyPass: totalEasyPassCost,
          currentEasyPass: currentLocationBalance,
        });
      }

      await conn.query(
        `UPDATE user_easypass_balances
         SET balance = balance - ?
         WHERE user_id = ?
           AND location_id = ?`,
        [totalEasyPassCost, userId, locationId]
      );

      await conn.query(
        `UPDATE users
         SET easypass_balance = GREATEST(COALESCE(easypass_balance, 0) - ?, 0)
         WHERE id = ?`,
        [totalEasyPassCost, userId]
      );

      const inscriptionIds = [];
      for (let i = 0; i < safeQuantity; i += 1) {
        const [insertRes] = await conn.query(
          `INSERT INTO inscriptions (user_id, match_id, status, ticket_type)
           VALUES (?,?, 'confirmed', ?)`,
          [userId, matchId, finalTicketType]
        );
        inscriptionIds.push(insertRes.insertId);
      }

      await conn.query(
        `UPDATE matches
         SET spots_taken = spots_taken + ?
         WHERE id = ?`,
        [safeQuantity, matchId]
      );

      await conn.query(
        `INSERT INTO easypass_transactions
          (user_id, type, amount, description, event_id, payment_reference, created_at)
         VALUES (?, 'spend', ?, ?, ?, ?, NOW())`,
        [
          userId,
          -totalEasyPassCost,
          `Inscripción partido ${match.title || `#${matchId}`} - EasyPass ${locationName}`,
          matchId,
          `match_${matchId}_${userId}_${Date.now()}`,
        ]
      );

      await conn.commit();

      return res.json({
        ok: true,
        paidWithEasyPass: true,
        inscription_ids: inscriptionIds,
        inscription_id: inscriptionIds[0] || null,
        easyPassSpent: totalEasyPassCost,
        location_id: locationId,
        locationId,
        locationName,
        msg: `Te has apuntado usando ${totalEasyPassCost} EasyPass de ${locationName}`,
      });
    }

    // Crear SIEMPRE una nueva inscripción pendiente con el tipo de entrada
    const [insertRes] = await conn.query(
      `INSERT INTO inscriptions (user_id, match_id, status, ticket_type)
       VALUES (?,?, 'pending', ?)`,
      [userId, matchId, finalTicketType]
    );
    const inscriptionId = insertRes.insertId;

    // Crear sesión de Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: safeQuantity,
          price_data: {
            currency: 'eur',
            unit_amount: Math.round(price * 100),
            product_data: {
              name:
                finalTicketType === 'white'
                  ? (match.title || 'Partido EasyFutbol') + ' · Camiseta blanca'
                  : (match.title || 'Partido EasyFutbol') + ' · Camiseta negra',
              description: `${match.city || ''} · ${new Date(
                match.starts_at
              ).toLocaleString('es-ES')}`.trim(),
            },
          },
        },
      ],
      metadata: {
        match_id: String(matchId),
        user_id: String(userId),
        inscription_id: String(inscriptionId),
        ticket_type: finalTicketType,
        quantity: String(safeQuantity),
        location_id: String(locationId),
        locationName: String(locationName),
      },
      success_url: STRIPE_SUCCESS_URL,
      cancel_url: STRIPE_CANCEL_URL,
    });

    // Vinculamos la sesión de Stripe a la inscripción
    await conn.query(
      `UPDATE inscriptions
       SET stripe_session_id=?
       WHERE id=?`,
      [session.id, inscriptionId]
    );

    await conn.commit();

    return res.json({ ok: true, checkoutUrl: session.url });
  } catch (e) {
    await conn.rollback();
    console.error('Error iniciando pago', e);
    return res.status(500).json({ ok: false, msg: 'Error iniciando pago' });
  } finally {
    conn.release();
  }
});

export default router;
