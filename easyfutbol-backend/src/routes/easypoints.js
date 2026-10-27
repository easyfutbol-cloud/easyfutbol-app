// Racha, retos y tienda de personalizables pagados con EasyPoints.
// Montado en /api/easypoints
import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import { getEasyPointsBalance, syncEngagement } from '../services/engagementService.js';
import { COSMETICS, equippedCosmetics, findCosmetic } from '../services/engagementRules.js';

const router = Router();
router.use(requireAuth);

const fail = (res, code, msg) => res.status(code).json({ ok: false, msg });
const EQUIP_COLUMN = { frame: 'equipped_frame', title: 'equipped_title' };

async function getEquipped(db, userId) {
  const [[row]] = await db.query('SELECT equipped_frame, equipped_title FROM users WHERE id = ?', [userId]);
  return equippedCosmetics(row?.equipped_frame, row?.equipped_title);
}

/** GET /api/easypoints/me — racha, retos del periodo, saldo y últimos movimientos */
router.get('/me', async (req, res) => {
  try {
    const userId = req.user.id;
    const { streak, challenges, awarded } = await syncEngagement(userId);
    const [history] = await pool.query(
      `SELECT amount, source_type, description, created_at
       FROM easypoints_ledger WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 15`,
      [userId]
    );
    res.json({
      ok: true,
      balance: await getEasyPointsBalance(pool, userId),
      streak,
      challenges,
      just_awarded: awarded.map(({ amount, description }) => ({ amount, description })),
      history,
      equipped: await getEquipped(pool, userId),
    });
  } catch (error) {
    console.error('[GET /easypoints/me]', error);
    fail(res, 500, 'No se pudieron cargar tus retos');
  }
});

/** GET /api/easypoints/shop — catálogo con lo que ya tienes y lo que llevas puesto */
router.get('/shop', async (req, res) => {
  try {
    const userId = req.user.id;
    const [owned] = await pool.query('SELECT item_code FROM user_cosmetics WHERE user_id = ?', [userId]);
    const ownedCodes = new Set(owned.map((row) => row.item_code));
    const equipped = await getEquipped(pool, userId);
    res.json({
      ok: true,
      balance: await getEasyPointsBalance(pool, userId),
      equipped,
      items: COSMETICS.map((item) => ({
        ...item,
        owned: ownedCodes.has(item.code),
        equipped: equipped.frame?.code === item.code || equipped.title?.code === item.code,
      })),
    });
  } catch (error) {
    console.error('[GET /easypoints/shop]', error);
    fail(res, 500, 'No se pudo cargar la tienda');
  }
});

/** POST /api/easypoints/shop/:code/buy — canjea y se lo pone directamente */
router.post('/shop/:code/buy', async (req, res) => {
  const item = findCosmetic(req.params.code);
  if (!item) return fail(res, 404, 'Ese artículo no existe');

  const userId = req.user.id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Bloquea al usuario para que dos canjes a la vez no gasten el mismo saldo.
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    const [[already]] = await conn.query('SELECT 1 AS owned FROM user_cosmetics WHERE user_id = ? AND item_code = ?', [userId, item.code]);
    if (already) {
      await conn.rollback();
      return fail(res, 409, 'Ya lo tienes');
    }
    const balance = await getEasyPointsBalance(conn, userId);
    if (balance < item.price) {
      await conn.rollback();
      return fail(res, 400, `Te faltan ${item.price - balance} EasyPoints`);
    }
    await conn.query('INSERT INTO user_cosmetics (user_id, item_code) VALUES (?, ?)', [userId, item.code]);
    await conn.query(
      `INSERT INTO easypoints_ledger (user_id, amount, source_type, source_key, description)
       VALUES (?, ?, 'purchase', ?, ?)`,
      [userId, -item.price, `purchase:${item.code}`, `Canje: ${item.name}`]
    );
    await conn.query(`UPDATE users SET ${EQUIP_COLUMN[item.type]} = ? WHERE id = ?`, [item.code, userId]);
    await conn.commit();
    res.json({ ok: true, balance: balance - item.price, equipped: await getEquipped(pool, userId) });
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error('[POST /easypoints/shop/:code/buy]', error);
    fail(res, 500, 'No se pudo completar el canje');
  } finally {
    conn.release();
  }
});

/** POST /api/easypoints/equip — { type: 'frame'|'title', code: string|null } */
router.post('/equip', async (req, res) => {
  try {
    const userId = req.user.id;
    const type = req.body?.type;
    const code = req.body?.code || null;
    if (!EQUIP_COLUMN[type]) return fail(res, 400, 'Tipo no válido');
    if (code) {
      const item = findCosmetic(code);
      if (!item || item.type !== type) return fail(res, 400, 'Artículo no válido');
      const [[owned]] = await pool.query('SELECT 1 AS owned FROM user_cosmetics WHERE user_id = ? AND item_code = ?', [userId, code]);
      if (!owned) return fail(res, 403, 'Todavía no lo tienes');
    }
    await pool.query(`UPDATE users SET ${EQUIP_COLUMN[type]} = ? WHERE id = ?`, [code, userId]);
    res.json({ ok: true, equipped: await getEquipped(pool, userId) });
  } catch (error) {
    console.error('[POST /easypoints/equip]', error);
    fail(res, 500, 'No se pudo cambiar');
  }
});

export default router;
