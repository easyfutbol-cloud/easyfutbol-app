import express from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

function mapDbStatusToAdminStatus(status) {
  if (status === 'scheduled') return 'open';
  if (status === 'full') return 'full';
  if (status === 'cancelled') return 'cancelled';
  return 'open';
}

function mapAdminStatusToDbStatus(status) {
  if (status === 'full') return 'full';
  if (status === 'cancelled') return 'cancelled';
  return 'scheduled';
}

async function getConfirmedCount(matchId) {
  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS total
      FROM inscriptions
      WHERE match_id = ?
        AND status IN ('confirmed', 'paid', 'active')
    `,
    [matchId]
  );

  return Number(rows?.[0]?.total || 0);
}

// Listado admin de partidos
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { city, status } = req.query;

    let sql = `
      SELECT
        id,
        title,
        '' AS description,
        city,
        CAST(field_id AS CHAR) AS field_name,
        DATE(starts_at) AS match_date,
        TIME(starts_at) AS start_time,
        TIME(DATE_ADD(starts_at, INTERVAL duration_min MINUTE)) AS end_time,
        capacity AS total_slots,
        GREATEST(capacity - spots_taken, 0) AS available_slots,
        CASE
          WHEN status = 'scheduled' THEN 'open'
          WHEN status = 'full' THEN 'full'
          WHEN status = 'cancelled' THEN 'cancelled'
          ELSE 'open'
        END AS status,
        1 AS easypass_required,
        NULL AS shirt_color,
        COALESCE(has_aftergame, 0) AS has_aftergame,
        created_at,
        created_at AS updated_at
      FROM matches
      WHERE 1=1
    `;

    const params = [];

    if (city) {
      sql += ' AND city = ?';
      params.push(city);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(mapAdminStatusToDbStatus(status));
    }

    sql += ' ORDER BY starts_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('Error obteniendo partidos admin:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener detalle de un partido
router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      `
        SELECT
          id,
          title,
          '' AS description,
          city,
          CAST(field_id AS CHAR) AS field_name,
          DATE(starts_at) AS match_date,
          TIME(starts_at) AS start_time,
          TIME(DATE_ADD(starts_at, INTERVAL duration_min MINUTE)) AS end_time,
          capacity AS total_slots,
          GREATEST(capacity - spots_taken, 0) AS available_slots,
          CASE
            WHEN status = 'scheduled' THEN 'open'
            WHEN status = 'full' THEN 'full'
            WHEN status = 'cancelled' THEN 'cancelled'
            ELSE 'open'
          END AS status,
          1 AS easypass_required,
          NULL AS shirt_color,
          COALESCE(has_aftergame, 0) AS has_aftergame,
          created_at,
          created_at AS updated_at
        FROM matches
        WHERE id = ?
        LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }

    const confirmedCount = await getConfirmedCount(id);

    res.json({
      ...rows[0],
      confirmed_count: confirmedCount,
    });
  } catch (error) {
    console.error('Error obteniendo partido admin:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Actualizar partido
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      city,
      field_name,
      match_date,
      start_time,
      end_time,
      total_slots,
      status,
      easypass_required,
      has_aftergame,
    } = req.body;

    const [existingRows] = await pool.query(
      'SELECT id, capacity, spots_taken, starts_at, duration_min, status FROM matches WHERE id = ? LIMIT 1',
      [id]
    );

    if (!existingRows.length) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }

    const confirmedCount = await getConfirmedCount(id);
    const parsedTotalSlots = Number(total_slots);
    const parsedFieldId = Number(field_name);
    const parsedEasyPassRequired = Number(easypass_required);
    const parsedHasAftergame = Number(has_aftergame) === 1 ? 1 : 0;

    const startsAt = new Date(`${match_date}T${start_time}:00`);
    const endsAt = new Date(`${match_date}T${end_time}:00`);
    const durationMin = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000);

    if (!title || !city || !field_name || !match_date || !start_time || !end_time) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    if (!Number.isInteger(parsedFieldId) || parsedFieldId <= 0) {
      return res.status(400).json({ error: 'field_name debe contener un field_id válido' });
    }

    if (!Number.isInteger(parsedTotalSlots) || parsedTotalSlots <= 0) {
      return res.status(400).json({ error: 'total_slots debe ser un número entero mayor que 0' });
    }

    if (parsedTotalSlots < confirmedCount) {
      return res.status(400).json({
        error: `No puedes poner menos plazas que inscritos confirmados (${confirmedCount})`,
      });
    }

    if (!Number.isInteger(parsedEasyPassRequired) || parsedEasyPassRequired < 0) {
      return res.status(400).json({ error: 'easypass_required debe ser un número entero válido' });
    }

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || durationMin <= 0) {
      return res.status(400).json({ error: 'La fecha y las horas no son válidas' });
    }

    const recalculatedAvailableSlots = parsedTotalSlots - confirmedCount;
    const dbStatus = mapAdminStatusToDbStatus(status || 'open');
    const autoStatus = recalculatedAvailableSlots <= 0 && dbStatus === 'scheduled' ? 'full' : dbStatus;

    await pool.query(
      `
        UPDATE matches
        SET
          title = ?,
          field_id = ?,
          city = ?,
          starts_at = ?,
          duration_min = ?,
          capacity = ?,
          spots_taken = ?,
          status = ?,
          has_aftergame = ?
        WHERE id = ?
      `,
      [
        title,
        parsedFieldId,
        city,
        `${match_date} ${start_time}:00`,
        durationMin,
        parsedTotalSlots,
        confirmedCount,
        autoStatus,
        parsedHasAftergame,
        id,
      ]
    );

    const [updatedRows] = await pool.query(
      `
        SELECT
          id,
          title,
          '' AS description,
          city,
          CAST(field_id AS CHAR) AS field_name,
          DATE(starts_at) AS match_date,
          TIME(starts_at) AS start_time,
          TIME(DATE_ADD(starts_at, INTERVAL duration_min MINUTE)) AS end_time,
          capacity AS total_slots,
          GREATEST(capacity - spots_taken, 0) AS available_slots,
          CASE
            WHEN status = 'scheduled' THEN 'open'
            WHEN status = 'full' THEN 'full'
            WHEN status = 'cancelled' THEN 'cancelled'
            ELSE 'open'
          END AS status,
          1 AS easypass_required,
          NULL AS shirt_color,
          COALESCE(has_aftergame, 0) AS has_aftergame,
          created_at,
          created_at AS updated_at
        FROM matches
        WHERE id = ?
        LIMIT 1
      `,
      [id]
    );

    res.json({
      message: 'Partido actualizado correctamente',
      match: {
        ...updatedRows[0],
        confirmed_count: confirmedCount,
      },
    });
  } catch (error) {
    console.error('Error actualizando partido admin:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Cambiar solo el estado del partido
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['draft', 'open', 'full', 'closed', 'cancelled', 'finished'];
    const dbStatus = mapAdminStatusToDbStatus(status);

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Estado no válido' });
    }

    const [result] = await pool.query(
      `
        UPDATE matches
        SET status = ?
        WHERE id = ?
      `,
      [dbStatus, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }

    res.json({ message: 'Estado actualizado correctamente' });
  } catch (error) {
    console.error('Error actualizando estado del partido:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;