
import express from 'express';
import db from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
}

async function getConfirmedCount(matchId) {
  const [rows] = await db.query(
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
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { city, status } = req.query;

    let sql = `
      SELECT
        id,
        title,
        description,
        city,
        field_name,
        match_date,
        start_time,
        end_time,
        total_slots,
        available_slots,
        status,
        easypass_required,
        shirt_color,
        created_at,
        updated_at
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
      params.push(status);
    }

    sql += ' ORDER BY match_date DESC, start_time DESC';

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('Error obteniendo partidos admin:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener detalle de un partido
router.get('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      `
        SELECT
          id,
          title,
          description,
          city,
          field_name,
          match_date,
          start_time,
          end_time,
          total_slots,
          available_slots,
          status,
          easypass_required,
          shirt_color,
          created_at,
          updated_at
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
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      city,
      field_name,
      match_date,
      start_time,
      end_time,
      total_slots,
      status,
      easypass_required,
      shirt_color,
    } = req.body;

    const [existingRows] = await db.query(
      'SELECT id, total_slots, available_slots FROM matches WHERE id = ? LIMIT 1',
      [id]
    );

    if (!existingRows.length) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }

    const confirmedCount = await getConfirmedCount(id);
    const parsedTotalSlots = Number(total_slots);
    const parsedEasyPassRequired = Number(easypass_required);

    if (!title || !city || !field_name || !match_date || !start_time || !end_time) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
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

    if (end_time <= start_time) {
      return res.status(400).json({ error: 'La hora de fin debe ser mayor que la de inicio' });
    }

    const recalculatedAvailableSlots = parsedTotalSlots - confirmedCount;

    await db.query(
      `
        UPDATE matches
        SET
          title = ?,
          description = ?,
          city = ?,
          field_name = ?,
          match_date = ?,
          start_time = ?,
          end_time = ?,
          total_slots = ?,
          available_slots = ?,
          status = ?,
          easypass_required = ?,
          shirt_color = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [
        title,
        description || null,
        city,
        field_name,
        match_date,
        start_time,
        end_time,
        parsedTotalSlots,
        recalculatedAvailableSlots,
        status || 'open',
        parsedEasyPassRequired,
        shirt_color || null,
        id,
      ]
    );

    const [updatedRows] = await db.query(
      `
        SELECT
          id,
          title,
          description,
          city,
          field_name,
          match_date,
          start_time,
          end_time,
          total_slots,
          available_slots,
          status,
          easypass_required,
          shirt_color,
          created_at,
          updated_at
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
router.patch('/:id/status', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ['draft', 'open', 'full', 'closed', 'cancelled', 'finished'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Estado no válido' });
    }

    const [result] = await db.query(
      `
        UPDATE matches
        SET status = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [status, id]
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