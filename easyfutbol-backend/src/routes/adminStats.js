// src/routes/adminStats.js
import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth, requireAdmin } from '../middlewares/auth.js';

const router = Router();

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

      const [rows] = await pool.query(
        `SELECT 
            i.id   AS inscription_id,
            i.match_id,
            u.id   AS user_id,
            u.name,
            u.email,
            i.goals,
            i.assists,
            i.status,
            i.is_mvp
         FROM inscriptions i
         JOIN users u ON u.id = i.user_id
         WHERE i.match_id = ? AND i.status = 'confirmed'
         ORDER BY i.is_mvp DESC, u.name ASC`,
        [matchId]
      );

      // Normalizamos is_mvp a boolean para el front
      const data = rows.map(r => ({
        ...r,
        is_mvp: !!r.is_mvp,
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
      const { goals, assists, is_mvp } = req.body || {};

      if (!Number.isInteger(id)) {
        return res.status(400).json({ ok: false, msg: 'ID de inscripción inválido' });
      }

      if (goals == null || assists == null || is_mvp == null) {
        return res
          .status(400)
          .json({ ok: false, msg: 'Faltan goles, asistencias o is_mvp' });
      }

      // Obtenemos el partido de esta inscripción
      const [[insc]] = await pool.query(
        'SELECT match_id FROM inscriptions WHERE id = ?',
        [id]
      );

      if (!insc) {
        return res.status(404).json({ ok: false, msg: 'Inscripción no encontrada' });
      }

      const matchId = insc.match_id;
      const goalsNum = Number(goals) || 0;
      const assistsNum = Number(assists) || 0;
      const isMvpFlag = is_mvp ? 1 : 0;

      // Si marcamos como MVP, primero quitamos el MVP del resto del partido
      if (isMvpFlag === 1) {
        await pool.query(
          'UPDATE inscriptions SET is_mvp = 0 WHERE match_id = ?',
          [matchId]
        );
      }

      // Actualizamos las stats de esta inscripción
      await pool.query(
        'UPDATE inscriptions SET goals = ?, assists = ?, is_mvp = ? WHERE id = ?',
        [goalsNum, assistsNum, isMvpFlag, id]
      );

      res.json({ ok: true, msg: 'Estadísticas actualizadas' });
    } catch (e) {
      console.error('Error actualizando estadísticas', e);
      res.status(500).json({ ok: false, msg: 'Error actualizando estadísticas' });
    }
  }
);

export default router;