// src/routes/adminStats.js
import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';
import { checkAndUnlockAchievements, awardReward } from '../services/achievementsService.js';


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
            i.status,
            i.is_mvp
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
            i.status,
            i.is_mvp
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
          await awardReward(
            statsUserId,
            'MATCH_MVP',
            matchId,
            null,
            null,
            req.user?.id || null,
            'MVP asignado desde panel admin'
          );
        }

        await checkAndUnlockAchievements(statsUserId, matchId);
      }

      if (previousStatsUserId && previousStatsUserId !== statsUserId) {
        await checkAndUnlockAchievements(previousStatsUserId, matchId);
      }

      res.json({ ok: true, msg: 'Estadísticas actualizadas' });
    } catch (e) {
      console.error('Error actualizando estadísticas', e);
      res.status(500).json({ ok: false, msg: 'Error actualizando estadísticas' });
    }
  }
);

export default router;