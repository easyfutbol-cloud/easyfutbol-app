import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { ACHIEVEMENT_CATALOG, getAchievementProgress } from '../services/achievementCatalog.js';

const router = Router();

router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [[userRow]] = await pool.query(
      `SELECT achievement_points
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    const [unlockedRows] = await pool.query(
      `SELECT a.code
       FROM user_achievements ua
       JOIN achievements a ON a.id = ua.achievement_id
       WHERE ua.user_id = ?`,
      [userId]
    );

    const unlockedSet = new Set(unlockedRows.map((row) => row.code));

    const progressByType = await getAchievementProgress(pool, userId);

    const achievements = ACHIEVEMENT_CATALOG.map((item) => {
      const rawProgress = progressByType[item.type] || 0;
      const progress = Math.min(rawProgress, item.target);

      return {
        code: item.code,
        title: item.title,
        description: item.description,
        points: item.points,
        target: item.target,
        progress,
        unlocked: unlockedSet.has(item.code),
      };
    });

    const [specialAwards] = await pool.query(
      `SELECT
         rt.code,
         rt.name,
         rt.points,
         ur.awarded_at,
         ur.week_label,
         ur.month_label
       FROM user_rewards ur
       JOIN reward_types rt ON rt.id = ur.reward_type_id
       WHERE ur.user_id = ?
         AND rt.category = 'special_award'
       ORDER BY ur.awarded_at DESC`,
      [userId]
    );

    const points = Number(userRow?.achievement_points || 0);

    res.json({
      ok: true,
      points,
      points_to_next_easypass: Math.max(500 - (points % 500 || 0), 0),
      achievements,
      specialAwards,
    });
  } catch (error) {
    console.error('Error loading achievements', error);
    res.status(500).json({ ok: false, msg: 'Error cargando logros' });
  }
});

export default router;