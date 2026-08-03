// src/routes/adminStats.js
import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import { addPlusFairPlayWarning, getPlusFairPlayStatus } from '../services/plusFairPlayService.js';
// import { checkAndUnlockAchievements, awardReward } from '../services/achievementsService.js';


const router = Router();

async function hasAssignedUserIdColumn() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'inscriptions'
       AND COLUMN_NAME = 'assigned_user_id'`
  );

  return Number(rows?.[0]?.count || 0) > 0;
}

/**
 * Listar inscripciones de un partido con goles + asistencias + MVP
 */
router.get(
  '/admin/matches/:id/stats',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const matchId = Number(req.params.id);

      if (!Number.isInteger(matchId)) {
        return res.status(400).json({ ok: false, msg: 'ID de partido inválido' });
      }

      const hasAssignedUser = await hasAssignedUserIdColumn();

      const statsQuery = hasAssignedUser
        ? `SELECT 
            i.id   AS inscription_id,
            i.match_id,
            i.user_id,
            i.assigned_user_id,
            buyer.name AS buyer_name,
            buyer.email AS buyer_email,
            COALESCE(assigned.id, buyer.id) AS stats_user_id,
            COALESCE(assigned.name, buyer.name) AS name,
            COALESCE(assigned.email, buyer.email) AS email,
            i.goals,
            i.assists,
            i.ticket_type,
            i.status,
            i.is_mvp,
            EXISTS(SELECT 1 FROM plus_fair_play_warnings pfw WHERE pfw.inscription_id=i.id AND pfw.reason='no_show') AS marked_no_show
           FROM inscriptions i
           JOIN users buyer ON buyer.id = i.user_id
           LEFT JOIN users assigned ON assigned.id = i.assigned_user_id
           WHERE i.match_id = ? AND i.status IN ('confirmed', 'paid', 'active')
           ORDER BY i.is_mvp DESC, COALESCE(assigned.name, buyer.name) ASC`
        : `SELECT 
            i.id   AS inscription_id,
            i.match_id,
            i.user_id,
            NULL AS assigned_user_id,
            u.name AS buyer_name,
            u.email AS buyer_email,
            u.id   AS stats_user_id,
            u.name,
            u.email,
            i.goals,
            i.assists,
            i.ticket_type,
            i.status,
            i.is_mvp,
            EXISTS(SELECT 1 FROM plus_fair_play_warnings pfw WHERE pfw.inscription_id=i.id AND pfw.reason='no_show') AS marked_no_show
           FROM inscriptions i
           JOIN users u ON u.id = i.user_id
           WHERE i.match_id = ? AND i.status IN ('confirmed', 'paid', 'active')
           ORDER BY i.is_mvp DESC, u.name ASC`;

      const [rows] = await pool.query(statsQuery, [matchId]);

      const [allUsers] = await pool.query(
        `SELECT id, name, email
         FROM users
         ORDER BY name ASC, email ASC`
      );

      const data = rows.map(r => ({
        ...r,
        is_mvp: !!r.is_mvp,
        user_id: r.stats_user_id,
        assignable_users: allUsers,
      }));

      res.json({ ok: true, data });
    } catch (e) {
      console.error('Error listando estadísticas', e);
      res.status(500).json({ ok: false, msg: 'Error listando estadísticas' });
    }
  }
);

router.post('/admin/inscriptions/:id/no-show', requireAuth, requireAdmin, async (req, res) => {
  try {
    const inscriptionId = Number(req.params.id);
    const [[inscription]] = await pool.query(
      `SELECT i.id, i.user_id, i.match_id, m.starts_at
       FROM inscriptions i JOIN matches m ON m.id=i.match_id
       WHERE i.id=? LIMIT 1`,
      [inscriptionId]
    );
    if (!inscription) return res.status(404).json({ ok: false, msg: 'Inscripción no encontrada' });
    if (new Date(inscription.starts_at).getTime() > Date.now()) {
      return res.status(400).json({ ok: false, msg: 'No puedes marcar una ausencia antes de empezar el partido' });
    }
    const current = await getPlusFairPlayStatus(pool, inscription.user_id);
    if (!current.isActive) return res.status(409).json({ ok: false, msg: 'El jugador no tiene una suscripción Plus activa' });
    const status = await addPlusFairPlayWarning(pool, {
      userId: inscription.user_id,
      inscriptionId,
      matchId: inscription.match_id,
      reason: 'no_show',
      createdBy: req.user.id,
    });
    return res.json({ ok: true, msg: `Ausencia registrada. Aviso Plus ${status.warningCount}/3.`, data: status });
  } catch (error) {
    console.error('[POST no-show]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudo registrar la ausencia' });
  }
});

/**
 * Importar de forma atómica las estadísticas completas de un partido.
 * Los jugadores se identifican por su ID de usuario, aunque no tengan inscripción propia.
 */
router.post(
  '/admin/matches/:id/stats/bulk',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const matchId = Number(req.params.id);
    const entries = req.body?.entries;

    if (!Number.isInteger(matchId) || matchId <= 0) {
      return res.status(400).json({ ok: false, msg: 'ID de partido inválido' });
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ ok: false, msg: 'No hay estadísticas para importar' });
    }

    const normalized = entries.map((entry) => ({
      userId: Number(entry?.user_id),
      goals: Number(entry?.goals),
      assists: Number(entry?.assists),
      isMvp: entry?.is_mvp === true || entry?.is_mvp === 1,
      result: entry?.result,
      team: entry?.team,
    }));

    const invalidEntry = normalized.find((entry) => (
      !Number.isInteger(entry.userId) || entry.userId <= 0 ||
      !Number.isInteger(entry.goals) || entry.goals < 0 ||
      !Number.isInteger(entry.assists) || entry.assists < 0 ||
      !['win', 'loss', 'draw'].includes(entry.result) ||
      !['white', 'black'].includes(entry.team)
    ));

    if (invalidEntry) {
      return res.status(400).json({ ok: false, msg: 'Hay filas con datos inválidos' });
    }

    const uniqueUserIds = new Set(normalized.map((entry) => entry.userId));
    if (uniqueUserIds.size !== normalized.length) {
      return res.status(400).json({ ok: false, msg: 'Hay IDs de jugador duplicados' });
    }

    if (normalized.filter((entry) => entry.isMvp).length > 1) {
      return res.status(400).json({ ok: false, msg: 'Solo puede haber un MVP' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[match]] = await conn.query('SELECT id FROM matches WHERE id = ? FOR UPDATE', [matchId]);
      if (!match) {
        await conn.rollback();
        return res.status(404).json({ ok: false, msg: 'Partido no encontrado' });
      }

      const hasAssignedUser = await hasAssignedUserIdColumn();
      const [inscriptions] = await conn.query(
        hasAssignedUser
          ? `SELECT id, user_id, assigned_user_id, ticket_type
             FROM inscriptions
             WHERE match_id = ? AND status IN ('confirmed', 'paid', 'active')
             FOR UPDATE`
          : `SELECT id, user_id, NULL AS assigned_user_id, ticket_type
             FROM inscriptions
             WHERE match_id = ? AND status IN ('confirmed', 'paid', 'active')
             FOR UPDATE`,
        [matchId]
      );

      const inscriptionByUser = new Map();
      inscriptions.forEach((inscription) => {
        const statsUserId = Number(inscription.assigned_user_id || inscription.user_id);
        if (!inscriptionByUser.has(statsUserId)) inscriptionByUser.set(statsUserId, inscription);
      });

      const requestedUserIds = normalized.map((entry) => entry.userId);
      const placeholders = requestedUserIds.map(() => '?').join(', ');
      const [existingUsers] = await conn.query(
        `SELECT id FROM users WHERE id IN (${placeholders})`,
        requestedUserIds
      );
      const existingUserIds = new Set(existingUsers.map((user) => Number(user.id)));
      const missingIds = requestedUserIds.filter((userId) => !existingUserIds.has(userId));

      if (missingIds.length) {
        await conn.rollback();
        return res.status(400).json({
          ok: false,
          msg: `No existen usuarios con estos ID: ${missingIds.join(', ')}`,
        });
      }

      // Evita conservar un MVP anterior que no aparezca en la nueva acta.
      await conn.query('UPDATE match_player_stats SET is_mvp = 0 WHERE match_id = ?', [matchId]);
      await conn.query('UPDATE inscriptions SET is_mvp = 0 WHERE match_id = ?', [matchId]);

      for (const entry of normalized) {
        const inscription = inscriptionByUser.get(entry.userId);
        await conn.query(
          `INSERT INTO match_player_stats (match_id, user_id, goals, assists, is_mvp, result)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             goals = VALUES(goals),
             assists = VALUES(assists),
             is_mvp = VALUES(is_mvp),
             result = VALUES(result)`,
          [matchId, entry.userId, entry.goals, entry.assists, entry.isMvp ? 1 : 0, entry.result]
        );

        if (inscription) {
          await conn.query(
            'UPDATE inscriptions SET goals = ?, assists = ?, is_mvp = ? WHERE id = ?',
            [entry.goals, entry.assists, entry.isMvp ? 1 : 0, inscription.id]
          );
        }
      }

      await conn.commit();
      return res.json({
        ok: true,
        msg: `Estadísticas de ${normalized.length} jugadores importadas`,
        data: { match_id: matchId, updated: normalized.length },
      });
    } catch (e) {
      await conn.rollback();
      console.error('Error importando estadísticas masivas', e);
      return res.status(500).json({ ok: false, msg: 'Error importando estadísticas' });
    } finally {
      conn.release();
    }
  }
);

/**
 * Actualizar goles/asistencias/MVP de una inscripción
 * - Si is_mvp = true, se quita el MVP del resto de inscripciones de ese partido
 *   y se deja solo esta como MVP.
 */
router.patch(
  '/admin/inscriptions/:id/stats',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { goals, assists, is_mvp, assigned_user_id } = req.body || {};

      if (!Number.isInteger(id)) {
        return res.status(400).json({ ok: false, msg: 'ID de inscripción inválido' });
      }

      if (goals == null || assists == null || is_mvp == null) {
        return res
          .status(400)
          .json({ ok: false, msg: 'Faltan goles, asistencias o is_mvp' });
      }

      // Obtenemos el estado previo de esta inscripción
      const [[insc]] = await pool.query(
        `SELECT id, match_id, user_id, assigned_user_id, goals, assists, is_mvp
         FROM inscriptions
         WHERE id = ?`,
        [id]
      );

      if (!insc) {
        return res.status(404).json({ ok: false, msg: 'Inscripción no encontrada' });
      }

      const matchId = insc.match_id;
      const hasAssignedUser = await hasAssignedUserIdColumn();
      const goalsNum = Number(goals) || 0;
      const assistsNum = Number(assists) || 0;
      const isMvpFlag = is_mvp === true || is_mvp === 1 || is_mvp === '1' ? 1 : 0;

      let assignedUserId = null;

      if (assigned_user_id !== undefined && assigned_user_id !== null && assigned_user_id !== '') {
        assignedUserId = Number(assigned_user_id);

        if (!Number.isInteger(assignedUserId)) {
          return res.status(400).json({ ok: false, msg: 'assigned_user_id inválido' });
        }

        const [[userExists]] = await pool.query(
          'SELECT id FROM users WHERE id = ? LIMIT 1',
          [assignedUserId]
        );

        if (!userExists) {
          return res.status(404).json({ ok: false, msg: 'Usuario asignado no encontrado' });
        }
      }

      // Si marcamos como MVP, primero quitamos el MVP del resto del partido
      if (isMvpFlag === 1) {
        await pool.query(
          'UPDATE inscriptions SET is_mvp = 0 WHERE match_id = ?',
          [matchId]
        );
      }

      // Actualizamos las stats de esta inscripción
      if (hasAssignedUser) {
        await pool.query(
          'UPDATE inscriptions SET goals = ?, assists = ?, is_mvp = ?, assigned_user_id = ? WHERE id = ?',
          [goalsNum, assistsNum, isMvpFlag, assignedUserId, id]
        );
      } else {
        await pool.query(
          'UPDATE inscriptions SET goals = ?, assists = ?, is_mvp = ? WHERE id = ?',
          [goalsNum, assistsNum, isMvpFlag, id]
        );
      }

      const [[updatedInsc]] = await pool.query(
        `SELECT id, match_id, user_id, assigned_user_id, goals, assists, is_mvp
         FROM inscriptions
         WHERE id = ?`,
        [id]
      );

      const statsUserId = Number(updatedInsc?.assigned_user_id || updatedInsc?.user_id || 0);
      const previousStatsUserId = Number(insc?.assigned_user_id || insc?.user_id || 0);

      const beforeWasMvp = Number(insc?.is_mvp || 0) === 1;
      const afterIsMvp = Number(updatedInsc?.is_mvp || 0) === 1;

      if (statsUserId) {
        if (!beforeWasMvp && afterIsMvp) {
          console.log('Recompensa MVP pendiente: achievementsService.js no disponible');
        }

        console.log('Recalculo de logros pendiente para usuario:', statsUserId, 'partido:', matchId);
      }

      if (previousStatsUserId && previousStatsUserId !== statsUserId) {
        console.log('Recalculo de logros pendiente para usuario previo:', previousStatsUserId, 'partido:', matchId);
      }

      res.json({ ok: true, msg: 'Estadísticas actualizadas' });
    } catch (e) {
      console.error('Error actualizando estadísticas', e);
      res.status(500).json({ ok: false, msg: 'Error actualizando estadísticas' });
    }
  }
);

export default router;
