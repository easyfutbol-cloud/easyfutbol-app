import express from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import { formatMadridAdminDateTime, madridWallTimeToUtc, toMysqlUtc } from '../utils/madridDateTime.js';

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

let assignedUserColumnAvailable;
async function hasAssignedUserIdColumn() {
  if (typeof assignedUserColumnAvailable === 'boolean') return assignedUserColumnAvailable;
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inscriptions'
       AND COLUMN_NAME = 'assigned_user_id' LIMIT 1`
  );
  assignedUserColumnAvailable = rows.length > 0;
  return assignedUserColumnAvailable;
}

// Listado admin de partidos
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { city, status } = req.query;

    let sql = `
      SELECT
        m.id,
        m.title,
        '' AS description,
        m.city,
        COALESCE(f.name,CAST(m.field_id AS CHAR)) AS field_name,
        m.starts_at,
        m.duration_min,
        DATE(m.starts_at) AS match_date,
        TIME(m.starts_at) AS start_time,
        TIME(DATE_ADD(m.starts_at, INTERVAL m.duration_min MINUTE)) AS end_time,
        m.capacity AS total_slots,
        GREATEST(m.capacity-m.spots_taken,0) AS available_slots,
        (SELECT COUNT(*) FROM inscriptions i WHERE i.match_id=m.id AND i.status IN ('confirmed','paid','active')) confirmed_count,
        (SELECT COUNT(*) FROM match_waitlist mw WHERE mw.match_id=m.id AND mw.status IN ('waiting','offered')) waitlist_count,
        CASE WHEN m.starts_at BETWEEN NOW() AND DATE_ADD(NOW(),INTERVAL 48 HOUR) AND (m.capacity-m.spots_taken)>=3 THEN 1 ELSE 0 END risk,
        CASE
          WHEN m.status = 'scheduled' THEN 'open'
          WHEN m.status = 'full' THEN 'full'
          WHEN m.status = 'cancelled' THEN 'cancelled'
          ELSE 'open'
        END AS status,
        1 AS easypass_required,
        NULL AS shirt_color,
        COALESCE(m.has_aftergame, 0) AS has_aftergame,
        m.created_at,
        m.created_at AS updated_at
      FROM matches m LEFT JOIN fields f ON f.id=m.field_id
      WHERE 1=1
    `;

    const params = [];

    if (city) {
      sql += ' AND m.city = ?';
      params.push(city);
    }

    if (status) {
      sql += ' AND m.status = ?';
      params.push(mapAdminStatusToDbStatus(status));
    }

    sql += ' ORDER BY m.starts_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json(rows.map((row) => {
      const local = formatMadridAdminDateTime(row.starts_at, row.duration_min);
      return {
        ...row,
        local_match_date: local?.match_date,
        local_start_time: local?.start_time,
        local_end_time: local?.end_time,
      };
    }));
  } catch (error) {
    console.error('Error obteniendo partidos admin:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/:id/roster', requireAuth, requireAdmin, async (req,res) => {
  try {
    const matchId=Number(req.params.id);
    const [[match]]=await pool.query(`SELECT m.id,m.title,m.starts_at,m.capacity,m.spots_taken,m.status,f.name field_name FROM matches m LEFT JOIN fields f ON f.id=m.field_id WHERE m.id=?`,[matchId]);
    if(!match)return res.status(404).json({error:'Partido no encontrado'});
    const hasAssignedUser = await hasAssignedUserIdColumn();
    const rosterSql = hasAssignedUser
      ? `SELECT i.id inscription_id,i.status,i.ticket_type,i.created_at,
                COALESCE(assigned.id,buyer.id) user_id,COALESCE(assigned.name,buyer.name) name,COALESCE(assigned.avatar_url,buyer.avatar_url) avatar_url
         FROM inscriptions i JOIN users buyer ON buyer.id=i.user_id LEFT JOIN users assigned ON assigned.id=i.assigned_user_id
         WHERE i.match_id=? AND i.status IN ('pending','confirmed','paid','active') ORDER BY i.created_at ASC`
      : `SELECT i.id inscription_id,i.status,i.ticket_type,i.created_at,
                buyer.id user_id,buyer.name,buyer.avatar_url
         FROM inscriptions i JOIN users buyer ON buyer.id=i.user_id
         WHERE i.match_id=? AND i.status IN ('pending','confirmed','paid','active') ORDER BY i.created_at ASC`;
    const [players]=await pool.query(rosterSql,[matchId]);
    const [waitlist]=await pool.query(
      `SELECT mw.id,mw.status,mw.created_at,mw.offer_expires_at,u.id user_id,u.name,u.avatar_url
       FROM match_waitlist mw JOIN users u ON u.id=mw.user_id WHERE mw.match_id=? AND mw.status IN ('waiting','offered')
       ORDER BY FIELD(mw.status,'offered','waiting'),mw.is_plus_snapshot DESC,mw.created_at ASC`,[matchId]
    );
    const groups={white:[],black:[],pending:[]};
    players.forEach(player=>{const color=['white','black'].includes(player.ticket_type)?player.ticket_type:'pending';groups[color].push(player);});
    res.json({ok:true,match:{...match,free_spots:Math.max(Number(match.capacity)-Number(match.spots_taken),0)},...groups,waitlist});
  }catch(error){console.error('[ADMIN ROSTER]',error);res.status(500).json({error:'No se pudo cargar la plantilla'});}
});

router.patch('/:id/roster/:inscriptionId/color', requireAuth, requireAdmin, async (req,res) => {
  try { const color=req.body?.color;if(!['white','black'].includes(color))return res.status(400).json({error:'Color no válido'});const[result]=await pool.query(`UPDATE inscriptions SET ticket_type=? WHERE id=? AND match_id=? AND status IN ('pending','confirmed','paid','active')`,[color,Number(req.params.inscriptionId),Number(req.params.id)]);if(!result.affectedRows)return res.status(404).json({error:'Inscripción no encontrada'});res.json({ok:true,color}); }
  catch(error){console.error('[ADMIN ROSTER COLOR]',error);res.status(500).json({error:'No se pudo cambiar el color'});}
});

router.post('/:id/duplicate', requireAuth, requireAdmin, async (req,res) => {
  try {
    const [[source]]=await pool.query('SELECT * FROM matches WHERE id=?',[Number(req.params.id)]);if(!source)return res.status(404).json({error:'Partido no encontrado'});
    const startsAt=req.body?.starts_at?new Date(req.body.starts_at):new Date(new Date(source.starts_at).getTime()+7*86400000);if(Number.isNaN(startsAt.getTime()))return res.status(400).json({error:'Fecha no válida'});
    const[result]=await pool.query(`INSERT INTO matches(title,field_id,city,location_id,starts_at,duration_min,price_eur,easypass_cost,capacity,spots_taken,status,has_aftergame) VALUES (?,?,?,?,?,?,?,?,?,0,'scheduled',?)`,[source.title,source.field_id,source.city,source.location_id,startsAt,source.duration_min,source.price_eur,source.easypass_cost,source.capacity,source.has_aftergame||0]);
    res.status(201).json({ok:true,id:result.insertId,starts_at:startsAt});
  }catch(error){console.error('[ADMIN DUPLICATE MATCH]',error);res.status(500).json({error:'No se pudo duplicar el partido'});}
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
          starts_at,
          duration_min,
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

    const local = formatMadridAdminDateTime(rows[0].starts_at, rows[0].duration_min);
    res.json({
      ...rows[0],
      local_match_date: local?.match_date,
      local_start_time: local?.start_time,
      local_end_time: local?.end_time,
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
      time_zone,
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

    const parseAdminTime = (time) => time_zone === 'Europe/Madrid'
      ? madridWallTimeToUtc(match_date, time)
      : new Date(`${match_date}T${time}:00Z`);
    const startsAt = parseAdminTime(start_time);
    const endsAt = parseAdminTime(end_time);
    if (!startsAt || !endsAt) return res.status(400).json({ error: 'La fecha y las horas no son válidas' });
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
        toMysqlUtc(startsAt),
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
          starts_at,
          duration_min,
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

    const updatedLocal = formatMadridAdminDateTime(updatedRows[0].starts_at, updatedRows[0].duration_min);
    res.json({
      message: 'Partido actualizado correctamente',
      match: {
        ...updatedRows[0],
        local_match_date: updatedLocal?.match_date,
        local_start_time: updatedLocal?.start_time,
        local_end_time: updatedLocal?.end_time,
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
