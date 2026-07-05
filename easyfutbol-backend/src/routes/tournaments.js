import express from 'express';
import { pool } from '../config/db.js';
import * as authMiddleware from '../middlewares/auth.js';

const router = express.Router();

const requireAuth =
  authMiddleware.default ||
  authMiddleware.requireAuth ||
  authMiddleware.auth;

const getLocationIdFromCity = (city) => {
  const normalizedCity = String(city || '').toLowerCase().trim();

  if (normalizedCity === 'valladolid') return 1;
  if (normalizedCity === 'asturias' || normalizedCity === 'aviles' || normalizedCity === 'avilés') return 2;

  return 1;
};

const getUserIdFromRequest = (req) => {
  return req.user?.id || req.user?.userId || req.userId || req.auth?.id || req.auth?.userId;
};

// GET /api/tournaments
// Lista los torneos con el número de inscritos confirmados
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.date,
        t.location,
        t.city,
        t.price_easypass,
        t.max_players,
        t.status,
        t.created_at,
        COUNT(ti.id) AS confirmed_players,
        GREATEST(t.max_players - COUNT(ti.id), 0) AS available_spots
      FROM tournaments t
      LEFT JOIN tournament_inscriptions ti
        ON ti.tournament_id = t.id
        AND ti.status = 'confirmed'
      GROUP BY
        t.id,
        t.title,
        t.description,
        t.date,
        t.location,
        t.city,
        t.price_easypass,
        t.max_players,
        t.status,
        t.created_at
      ORDER BY t.date ASC
    `);

    return res.json(rows);
  } catch (error) {
    console.error('Error fetching tournaments:', error);
    return res.status(500).json({ message: 'Error al obtener los torneos' });
  }
});

// GET /api/tournaments/:id
// Devuelve el detalle de un torneo con plazas disponibles
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT
        t.id,
        t.title,
        t.description,
        t.date,
        t.location,
        t.city,
        t.price_easypass,
        t.max_players,
        t.status,
        t.created_at,
        COUNT(ti.id) AS confirmed_players,
        GREATEST(t.max_players - COUNT(ti.id), 0) AS available_spots
      FROM tournaments t
      LEFT JOIN tournament_inscriptions ti
        ON ti.tournament_id = t.id
        AND ti.status = 'confirmed'
      WHERE t.id = ?
      GROUP BY
        t.id,
        t.title,
        t.description,
        t.date,
        t.location,
        t.city,
        t.price_easypass,
        t.max_players,
        t.status,
        t.created_at
      LIMIT 1
      `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Torneo no encontrado' });
    }

    return res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching tournament detail:', error);
    return res.status(500).json({ message: 'Error al obtener el torneo' });
  }
});

// GET /api/tournaments/:id/my-inscription
// Devuelve la inscripción del usuario autenticado en un torneo concreto
router.get('/:id/my-inscription', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = getUserIdFromRequest(req);

  if (!userId) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT
        ti.id AS inscription_id,
        ti.tournament_id,
        ti.user_id,
        ti.status,
        ti.shirt_size,
        ti.payment_method,
        ti.created_at,
        ti.cancelled_at
      FROM tournament_inscriptions ti
      WHERE ti.tournament_id = ?
        AND ti.user_id = ?
      LIMIT 1
      `,
      [id, userId]
    );

    if (rows.length === 0) {
      return res.json({
        is_inscribed: false,
        inscription: null,
      });
    }

    return res.json({
      is_inscribed: rows[0].status === 'confirmed',
      inscription: rows[0],
    });
  } catch (error) {
    console.error('Error fetching user tournament inscription:', error);
    return res.status(500).json({ message: 'Error al obtener tu inscripción del torneo' });
  }
});

// POST /api/tournaments/:id/inscribe
// Inscribe al usuario en un torneo, guarda la talla y descuenta EasyPass de su saldo por sede
router.post('/:id/inscribe', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { shirt_size } = req.body;
  const userId = getUserIdFromRequest(req);

  const allowedSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
  const normalizedShirtSize = String(shirt_size || '').toUpperCase().trim();

  if (!userId) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }

  if (!normalizedShirtSize || !allowedSizes.includes(normalizedShirtSize)) {
    return res.status(400).json({
      message: 'Selecciona una talla válida',
      allowed_sizes: allowedSizes,
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [tournamentRows] = await connection.query(
      `
      SELECT
        id,
        title,
        city,
        price_easypass,
        max_players,
        status
      FROM tournaments
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [id]
    );

    if (tournamentRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Torneo no encontrado' });
    }

    const tournament = tournamentRows[0];
    const priceEasypass = Number(tournament.price_easypass || 0);
    const locationId = getLocationIdFromCity(tournament.city);

    if (tournament.status !== 'open') {
      await connection.rollback();
      return res.status(400).json({ message: 'Las inscripciones de este torneo no están abiertas' });
    }

    const [alreadyInscribedRows] = await connection.query(
      `
      SELECT id, status
      FROM tournament_inscriptions
      WHERE tournament_id = ?
        AND user_id = ?
      LIMIT 1
      `,
      [id, userId]
    );

    if (alreadyInscribedRows.length > 0 && alreadyInscribedRows[0].status === 'confirmed') {
      await connection.rollback();
      return res.status(409).json({ message: 'Ya estás inscrito en este torneo' });
    }

    const [confirmedRows] = await connection.query(
      `
      SELECT COUNT(*) AS confirmed_players
      FROM tournament_inscriptions
      WHERE tournament_id = ?
        AND status = 'confirmed'
      `,
      [id]
    );

    const confirmedPlayers = Number(confirmedRows[0]?.confirmed_players || 0);

    if (confirmedPlayers >= Number(tournament.max_players || 0)) {
      await connection.rollback();
      return res.status(400).json({ message: 'El torneo está completo' });
    }

    const [balanceRows] = await connection.query(
      `
      SELECT balance
      FROM user_easypass_balances
      WHERE user_id = ?
        AND location_id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [userId, locationId]
    );

    const currentBalance = Number(balanceRows[0]?.balance || 0);

    if (currentBalance < priceEasypass) {
      await connection.rollback();
      return res.status(400).json({
        message: `No tienes suficientes EasyPass. Necesitas ${priceEasypass} EP para apuntarte al torneo.`,
        current_balance: currentBalance,
        required_balance: priceEasypass,
      });
    }

    await connection.query(
      `
      UPDATE user_easypass_balances
      SET balance = balance - ?
      WHERE user_id = ?
        AND location_id = ?
      `,
      [priceEasypass, userId, locationId]
    );

    await connection.query(
      `
      UPDATE users
      SET easypass_balance = GREATEST(COALESCE(easypass_balance, 0) - ?, 0)
      WHERE id = ?
      `,
      [priceEasypass, userId]
    );

    await connection.query(
      `
      INSERT INTO tournament_inscriptions (
        tournament_id,
        user_id,
        status,
        shirt_size,
        payment_method,
        created_at,
        cancelled_at
      )
      VALUES (?, ?, 'confirmed', ?, 'easypass', NOW(), NULL)
      ON DUPLICATE KEY UPDATE
        status = 'confirmed',
        shirt_size = VALUES(shirt_size),
        payment_method = 'easypass',
        created_at = NOW(),
        cancelled_at = NULL
      `,
      [id, userId, normalizedShirtSize]
    );

    const [newBalanceRows] = await connection.query(
      `
      SELECT balance
      FROM user_easypass_balances
      WHERE user_id = ?
        AND location_id = ?
      LIMIT 1
      `,
      [userId, locationId]
    );

    const newBalance = Number(newBalanceRows[0]?.balance || 0);

    await connection.commit();

    return res.status(201).json({
      message: 'Inscripción al torneo confirmada',
      tournament_id: Number(id),
      user_id: Number(userId),
      shirt_size: normalizedShirtSize,
      easypass_used: priceEasypass,
      easypass_balance: newBalance,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error inscribing tournament:', error);
    return res.status(500).json({ message: 'Error al apuntarse al torneo' });
  } finally {
    connection.release();
  }
});

// POST /api/tournaments/:id/cancel
// Cancela la inscripción del usuario y devuelve los EasyPass si faltan al menos 2 días para el torneo
router.post('/:id/cancel', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = getUserIdFromRequest(req);

  if (!userId) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [tournamentRows] = await connection.query(
      `
      SELECT
        id,
        title,
        city,
        date,
        price_easypass,
        status,
        TIMESTAMPDIFF(HOUR, NOW(), date) AS hours_until_tournament
      FROM tournaments
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [id]
    );

    if (tournamentRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Torneo no encontrado' });
    }

    const tournament = tournamentRows[0];
    const priceEasypass = Number(tournament.price_easypass || 0);
    const locationId = getLocationIdFromCity(tournament.city);
    const hoursUntilTournament = Number(tournament.hours_until_tournament || 0);

    if (hoursUntilTournament < 48) {
      await connection.rollback();
      return res.status(400).json({
        message: 'No se puede cancelar la inscripción con menos de 2 días de antelación.',
      });
    }

    const [inscriptionRows] = await connection.query(
      `
      SELECT id, status, payment_method
      FROM tournament_inscriptions
      WHERE tournament_id = ?
        AND user_id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [id, userId]
    );

    if (inscriptionRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'No tienes una inscripción en este torneo' });
    }

    const inscription = inscriptionRows[0];

    if (inscription.status === 'cancelled') {
      await connection.rollback();
      return res.status(400).json({ message: 'Esta inscripción ya está cancelada' });
    }

    await connection.query(
      `
      UPDATE tournament_inscriptions
      SET status = 'cancelled',
          cancelled_at = NOW()
      WHERE id = ?
      `,
      [inscription.id]
    );

    if (inscription.payment_method === 'easypass') {
      await connection.query(
        `
        INSERT INTO user_easypass_balances (user_id, location_id, balance)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)
        `,
        [userId, locationId, priceEasypass]
      );

      await connection.query(
        `
        UPDATE users
        SET easypass_balance = COALESCE(easypass_balance, 0) + ?
        WHERE id = ?
        `,
        [priceEasypass, userId]
      );
    }

    const [newBalanceRows] = await connection.query(
      `
      SELECT balance
      FROM user_easypass_balances
      WHERE user_id = ?
        AND location_id = ?
      LIMIT 1
      `,
      [userId, locationId]
    );

    const newBalance = Number(newBalanceRows[0]?.balance || 0);

    await connection.commit();

    return res.json({
      message: 'Inscripción cancelada correctamente',
      tournament_id: Number(id),
      user_id: Number(userId),
      easypass_refunded: inscription.payment_method === 'easypass' ? priceEasypass : 0,
      easypass_balance: newBalance,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error cancelling tournament inscription:', error);
    return res.status(500).json({ message: 'Error al cancelar la inscripción del torneo' });
  } finally {
    connection.release();
  }
});

export default router;