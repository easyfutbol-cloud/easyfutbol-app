import express from 'express';
import { pool } from '../config/db.js';
import * as authMiddleware from '../middlewares/auth.js';

const router = express.Router();

const requireAuth =
  authMiddleware.default ||
  authMiddleware.requireAuth ||
  authMiddleware.auth;

const ALLOWED_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
const ALLOWED_REGISTRATION_TYPES = ['solo', 'group', 'full_team'];
const MIN_SHIRT_NUMBER = 1;
const MAX_SHIRT_NUMBER = 99;
const MAX_PLAYERS_PER_REGISTRATION = 10;

const getLocationIdFromCity = (city) => {
  const normalizedCity = String(city || '').toLowerCase().trim();

  if (normalizedCity === 'valladolid') return 1;
  if (normalizedCity === 'asturias' || normalizedCity === 'aviles' || normalizedCity === 'avilés') return 2;

  return 1;
};

const getUserIdFromRequest = (req) => {
  return req.user?.id || req.user?.userId || req.userId || req.auth?.id || req.auth?.userId;
};

const normalizeText = (value) => String(value || '').trim();
const normalizeUpperText = (value) => normalizeText(value).toUpperCase();
const normalizeEmail = (value) => normalizeText(value).toLowerCase();

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidBirthDate = (birthDate) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate || ''))) return false;

  const date = new Date(`${birthDate}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime());
};

const normalizeRegistrationType = (registrationType, totalPlayers) => {
  const normalizedType = String(registrationType || '').toLowerCase().trim();

  if (ALLOWED_REGISTRATION_TYPES.includes(normalizedType)) {
    return normalizedType;
  }

  if (totalPlayers === 1) return 'solo';
  if (totalPlayers >= 8) return 'full_team';
  return 'group';
};

const validatePlayers = (players) => {
  if (!Array.isArray(players) || players.length === 0) {
    return {
      valid: false,
      message: 'Debes añadir al menos un jugador para apuntarte al torneo.',
    };
  }

  if (players.length > MAX_PLAYERS_PER_REGISTRATION) {
    return {
      valid: false,
      message: `No puedes añadir más de ${MAX_PLAYERS_PER_REGISTRATION} jugadores en una misma inscripción.`,
    };
  }

  const normalizedPlayers = [];
  const usedDnis = new Set();
  const usedEmails = new Set();

  for (let index = 0; index < players.length; index += 1) {
    const playerNumber = index + 1;
    const player = players[index] || {};

    const fullName = normalizeText(player.full_name || player.fullName || player.name);
    const dni = normalizeUpperText(player.dni);
    const birthDate = normalizeText(player.birth_date || player.birthDate);
    const phone = normalizeText(player.phone);
    const email = normalizeEmail(player.email);
    const shirtSize = normalizeUpperText(player.shirt_size || player.shirtSize);
    const shirtName = normalizeUpperText(player.shirt_name || player.shirtName || player.dorsal_name || player.dorsalName);
    const rawShirtNumber = player.shirt_number ?? player.shirtNumber ?? player.dorsal_number ?? player.dorsalNumber;
    const shirtNumber = rawShirtNumber === undefined || rawShirtNumber === null || rawShirtNumber === ''
      ? null
      : Number(rawShirtNumber);

    if (!fullName) {
      return { valid: false, message: `Falta el nombre completo del jugador ${playerNumber}.` };
    }

    if (!dni) {
      return { valid: false, message: `Falta el DNI del jugador ${playerNumber}.` };
    }

    if (!birthDate || !isValidBirthDate(birthDate)) {
      return { valid: false, message: `La fecha de nacimiento del jugador ${playerNumber} no es válida. Usa formato YYYY-MM-DD.` };
    }

    if (!phone) {
      return { valid: false, message: `Falta el teléfono del jugador ${playerNumber}.` };
    }

    if (!email || !isValidEmail(email)) {
      return { valid: false, message: `El correo electrónico del jugador ${playerNumber} no es válido.` };
    }

    if (!shirtSize || !ALLOWED_SIZES.includes(shirtSize)) {
      return {
        valid: false,
        message: `La talla del jugador ${playerNumber} no es válida.`,
        allowed_sizes: ALLOWED_SIZES,
      };
    }

    if (!shirtName) {
      return { valid: false, message: `Falta el nombre de camiseta del jugador ${playerNumber}.` };
    }

    if (shirtName.length > 30) {
      return { valid: false, message: `El nombre de camiseta del jugador ${playerNumber} no puede superar 30 caracteres.` };
    }

    if (!Number.isInteger(shirtNumber) || shirtNumber < MIN_SHIRT_NUMBER || shirtNumber > MAX_SHIRT_NUMBER) {
      return {
        valid: false,
        message: `El número de camiseta del jugador ${playerNumber} debe estar entre ${MIN_SHIRT_NUMBER} y ${MAX_SHIRT_NUMBER}.`,
      };
    }

    if (usedDnis.has(dni)) {
      return { valid: false, message: `El DNI del jugador ${playerNumber} está repetido en esta inscripción.` };
    }

    if (usedEmails.has(email)) {
      return { valid: false, message: `El email del jugador ${playerNumber} está repetido en esta inscripción.` };
    }

    usedDnis.add(dni);
    usedEmails.add(email);

    normalizedPlayers.push({
      full_name: fullName,
      dni,
      birth_date: birthDate,
      phone,
      email,
      shirt_size: shirtSize,
      shirt_name: shirtName,
      shirt_number: shirtNumber,
    });
  }

  return {
    valid: true,
    players: normalizedPlayers,
  };
};

const getConfirmedPlayersCountQuery = `
  SELECT COUNT(*) AS confirmed_players
  FROM tournament_registration_players trp
  JOIN tournament_registration_groups trg
    ON trg.id = trp.registration_group_id
  WHERE trp.tournament_id = ?
    AND trp.status = 'confirmed'
    AND trg.status = 'confirmed'
`;

// GET /api/tournaments
// Lista los torneos con el número de jugadores confirmados
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
        COUNT(trp.id) AS confirmed_players,
        GREATEST(t.max_players - COUNT(trp.id), 0) AS available_spots
      FROM tournaments t
      LEFT JOIN tournament_registration_groups trg
        ON trg.tournament_id = t.id
        AND trg.status = 'confirmed'
      LEFT JOIN tournament_registration_players trp
        ON trp.registration_group_id = trg.id
        AND trp.status = 'confirmed'
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
        COUNT(trp.id) AS confirmed_players,
        GREATEST(t.max_players - COUNT(trp.id), 0) AS available_spots
      FROM tournaments t
      LEFT JOIN tournament_registration_groups trg
        ON trg.tournament_id = t.id
        AND trg.status = 'confirmed'
      LEFT JOIN tournament_registration_players trp
        ON trp.registration_group_id = trg.id
        AND trp.status = 'confirmed'
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
// Devuelve la inscripción o inscripciones del usuario autenticado en un torneo concreto
router.get('/:id/my-inscription', requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = getUserIdFromRequest(req);

  if (!userId) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }

  try {
    const [groups] = await pool.query(
      `
      SELECT
        id AS registration_group_id,
        tournament_id,
        responsible_user_id,
        registration_type,
        total_players,
        status,
        payment_method,
        easypass_used,
        created_at,
        cancelled_at
      FROM tournament_registration_groups
      WHERE tournament_id = ?
        AND responsible_user_id = ?
      ORDER BY created_at DESC
      `,
      [id, userId]
    );

    if (groups.length === 0) {
      return res.json({
        is_inscribed: false,
        registrations: [],
        inscription: null,
      });
    }

    const groupIds = groups.map((group) => group.registration_group_id);
    const placeholders = groupIds.map(() => '?').join(',');

    const [players] = await pool.query(
      `
      SELECT
        id AS player_registration_id,
        registration_group_id,
        tournament_id,
        linked_user_id,
        full_name,
        dni,
        birth_date,
        phone,
        email,
        shirt_size,
        shirt_name,
        shirt_number,
        status,
        created_at
      FROM tournament_registration_players
      WHERE registration_group_id IN (${placeholders})
      ORDER BY registration_group_id ASC, id ASC
      `,
      groupIds
    );

    const playersByGroupId = players.reduce((acc, player) => {
      if (!acc[player.registration_group_id]) acc[player.registration_group_id] = [];
      acc[player.registration_group_id].push(player);
      return acc;
    }, {});

    const registrations = groups.map((group) => ({
      ...group,
      players: playersByGroupId[group.registration_group_id] || [],
    }));

    return res.json({
      is_inscribed: registrations.some((registration) => registration.status === 'confirmed'),
      registrations,
      inscription: registrations[0] || null,
    });
  } catch (error) {
    console.error('Error fetching user tournament inscription:', error);
    return res.status(500).json({ message: 'Error al obtener tu inscripción del torneo' });
  }
});

// POST /api/tournaments/:id/inscribe
// Crea una inscripción individual, grupal o de equipo completo y descuenta EasyPass por jugador
router.post('/:id/inscribe', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { registration_type, players } = req.body;
  const userId = getUserIdFromRequest(req);

  if (!userId) {
    return res.status(401).json({ message: 'Usuario no autenticado' });
  }

  const validation = validatePlayers(players);

  if (!validation.valid) {
    return res.status(400).json({
      message: validation.message,
      allowed_sizes: validation.allowed_sizes,
    });
  }

  const normalizedPlayers = validation.players;
  const totalPlayers = normalizedPlayers.length;
  const normalizedRegistrationType = normalizeRegistrationType(registration_type, totalPlayers);

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
    const totalEasypassNeeded = priceEasypass * totalPlayers;

    if (tournament.status !== 'open') {
      await connection.rollback();
      return res.status(400).json({ message: 'Las inscripciones de este torneo no están abiertas' });
    }

    const [confirmedRows] = await connection.query(getConfirmedPlayersCountQuery, [id]);
    const confirmedPlayers = Number(confirmedRows[0]?.confirmed_players || 0);
    const availableSpots = Number(tournament.max_players || 0) - confirmedPlayers;

    if (availableSpots < totalPlayers) {
      await connection.rollback();
      return res.status(400).json({
        message: `No quedan suficientes plazas. Quedan ${Math.max(availableSpots, 0)} plazas disponibles.`,
        available_spots: Math.max(availableSpots, 0),
        requested_spots: totalPlayers,
      });
    }

    const dnis = normalizedPlayers.map((player) => player.dni);
    const emails = normalizedPlayers.map((player) => player.email);

    const [duplicatedPlayers] = await connection.query(
      `
      SELECT dni, email
      FROM tournament_registration_players
      WHERE tournament_id = ?
        AND status = 'confirmed'
        AND (dni IN (?) OR email IN (?))
      LIMIT 1
      `,
      [id, dnis, emails]
    );

    if (duplicatedPlayers.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        message: 'Alguno de los jugadores ya está inscrito en este torneo.',
      });
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

    if (currentBalance < totalEasypassNeeded) {
      await connection.rollback();
      return res.status(400).json({
        message: `No tienes suficientes EasyPass. Necesitas ${totalEasypassNeeded} EasyPass para apuntar a ${totalPlayers} jugador${totalPlayers === 1 ? '' : 'es'} al torneo.`,
        current_balance: currentBalance,
        required_balance: totalEasypassNeeded,
      });
    }

    await connection.query(
      `
      UPDATE user_easypass_balances
      SET balance = balance - ?
      WHERE user_id = ?
        AND location_id = ?
      `,
      [totalEasypassNeeded, userId, locationId]
    );

    await connection.query(
      `
      UPDATE users
      SET easypass_balance = GREATEST(COALESCE(easypass_balance, 0) - ?, 0)
      WHERE id = ?
      `,
      [totalEasypassNeeded, userId]
    );

    const [groupResult] = await connection.query(
      `
      INSERT INTO tournament_registration_groups (
        tournament_id,
        responsible_user_id,
        registration_type,
        total_players,
        status,
        payment_method,
        easypass_used,
        created_at,
        cancelled_at
      )
      VALUES (?, ?, ?, ?, 'confirmed', 'easypass', ?, NOW(), NULL)
      `,
      [id, userId, normalizedRegistrationType, totalPlayers, totalEasypassNeeded]
    );

    const registrationGroupId = groupResult.insertId;

    const playerValues = normalizedPlayers.map((player, index) => [
      registrationGroupId,
      id,
      index === 0 ? userId : null,
      player.full_name,
      player.dni,
      player.birth_date,
      player.phone,
      player.email,
      player.shirt_size,
      player.shirt_name,
      player.shirt_number,
      'confirmed',
    ]);

    await connection.query(
      `
      INSERT INTO tournament_registration_players (
        registration_group_id,
        tournament_id,
        linked_user_id,
        full_name,
        dni,
        birth_date,
        phone,
        email,
        shirt_size,
        shirt_name,
        shirt_number,
        status
      )
      VALUES ?
      `,
      [playerValues]
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
      responsible_user_id: Number(userId),
      registration_group_id: registrationGroupId,
      registration_type: normalizedRegistrationType,
      total_players: totalPlayers,
      easypass_used: totalEasypassNeeded,
      easypass_balance: newBalance,
      players: normalizedPlayers,
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
// Cancela todas las plazas de la última inscripción confirmada del usuario y devuelve los EasyPass si faltan al menos 2 días
router.post('/:id/cancel', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { registration_group_id } = req.body || {};
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
    const locationId = getLocationIdFromCity(tournament.city);
    const hoursUntilTournament = Number(tournament.hours_until_tournament || 0);

    if (hoursUntilTournament < 48) {
      await connection.rollback();
      return res.status(400).json({
        message: 'No se puede cancelar la inscripción con menos de 2 días de antelación.',
      });
    }

    const groupQueryParams = registration_group_id
      ? [registration_group_id, id, userId]
      : [id, userId];

    const [groupRows] = await connection.query(
      registration_group_id
        ? `
        SELECT id, status, payment_method, easypass_used, total_players
        FROM tournament_registration_groups
        WHERE id = ?
          AND tournament_id = ?
          AND responsible_user_id = ?
        LIMIT 1
        FOR UPDATE
        `
        : `
        SELECT id, status, payment_method, easypass_used, total_players
        FROM tournament_registration_groups
        WHERE tournament_id = ?
          AND responsible_user_id = ?
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
        `,
      groupQueryParams
    );

    if (groupRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'No tienes una inscripción en este torneo' });
    }

    const group = groupRows[0];

    if (group.status === 'cancelled') {
      await connection.rollback();
      return res.status(400).json({ message: 'Esta inscripción ya está cancelada' });
    }

    await connection.query(
      `
      UPDATE tournament_registration_groups
      SET status = 'cancelled',
          cancelled_at = NOW()
      WHERE id = ?
      `,
      [group.id]
    );

    await connection.query(
      `
      UPDATE tournament_registration_players
      SET status = 'cancelled'
      WHERE registration_group_id = ?
      `,
      [group.id]
    );

    const easypassToRefund = group.payment_method === 'easypass' ? Number(group.easypass_used || 0) : 0;

    if (easypassToRefund > 0) {
      await connection.query(
        `
        INSERT INTO user_easypass_balances (user_id, location_id, balance)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)
        `,
        [userId, locationId, easypassToRefund]
      );

      await connection.query(
        `
        UPDATE users
        SET easypass_balance = COALESCE(easypass_balance, 0) + ?
        WHERE id = ?
        `,
        [easypassToRefund, userId]
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
      responsible_user_id: Number(userId),
      registration_group_id: Number(group.id),
      total_players_cancelled: Number(group.total_players || 0),
      easypass_refunded: easypassToRefund,
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