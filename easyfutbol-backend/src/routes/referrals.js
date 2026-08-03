import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { buildReferralCode } from '../services/referralService.js';

const router = Router();

router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    let [[user]] = await pool.query('SELECT referral_code FROM users WHERE id=? LIMIT 1', [userId]);
    if (!user?.referral_code) {
      const code = buildReferralCode(userId);
      await pool.query('UPDATE users SET referral_code=? WHERE id=? AND referral_code IS NULL', [code, userId]);
      user = { referral_code: code };
    }
    const [[totals]] = await pool.query(
      `SELECT COUNT(*) AS registered,
              SUM(CASE WHEN status='qualified' THEN 1 ELSE 0 END) AS qualified
       FROM user_referrals WHERE referrer_user_id=?`,
      [userId]
    );
    const qualified = Number(totals?.qualified || 0);
    const points = qualified % 5;
    return res.json({
      ok: true,
      data: {
        referral_code: user.referral_code,
        registered_referrals: Number(totals?.registered || 0),
        qualified_referrals: qualified,
        points,
        points_to_reward: points === 0 && qualified > 0 ? 5 : 5 - points,
        rewards_earned: Math.floor(qualified / 5),
      },
    });
  } catch (error) {
    console.error('[GET /referrals/me]', error);
    return res.status(500).json({ ok: false, msg: 'No se pudieron cargar tus referidos' });
  }
});

export default router;
