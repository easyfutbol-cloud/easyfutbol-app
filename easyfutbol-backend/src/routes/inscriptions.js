import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import Stripe from 'stripe';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// --- Helper política de reembolso ---
function refundPercent(startsAtISO) {
  const starts = new Date(startsAtISO).getTime();
  const now = Date.now();
  const diffH = (starts - now) / 36e5;
  return diffH > 6 ? 100 : 0;
}


// --- Mis inscripciones (para la app) ---
router.get('/me/inscriptions', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      `SELECT i.id AS inscription_id, i.status, i.stripe_session_id, i.ticket_type, i.payment_type,
              m.id AS match_id, m.title, m.city, m.starts_at, m.duration_min,
              f.name AS field_name
       FROM inscriptions i
       JOIN matches m ON m.id = i.match_id
       JOIN fields  f ON f.id = m.field_id
       WHERE i.user_id = ?
       ORDER BY m.starts_at DESC
       LIMIT 300`, [userId]
    );

    console.log('GET /me/inscriptions', { userId, count: rows.length });

    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, msg: 'Error listando inscripciones' });
  }
});

// --- Apuntarse usando EasyPass ---
router.post('/matches/:id/join-with-easypass', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const userId = req.user.id;
    const matchId = Number(req.params.id);

    const quantity = Math.max(1, Number.parseInt(req.body?.quantity, 10) || 1);
    const shirtColorRaw = String(req.body?.ticket_type || req.body?.shirtColor || 'white').toLowerCase();
    const shirtColor = shirtColorRaw === 'black' ? 'black' : 'white';

    await conn.beginTransaction();

    // bloquear usuario para comprobar saldo EasyPass
    const [[user]] = await conn.query(
      'SELECT easypass_balance AS easyPassBalance FROM users WHERE id=? FOR UPDATE',
      [userId]
    );

    if (!user || Number(user.easyPassBalance || 0) < quantity) {
      await conn.rollback();
      return res.status(400).json({ ok:false, msg:`No tienes EasyPass suficientes para ${quantity} plaza(s)` });
    }

    // comprobar plazas
    const [[match]] = await conn.query(
      'SELECT * FROM matches WHERE id=? FOR UPDATE',
      [matchId]
    );

    if (!match) {
      await conn.rollback();
      return res.status(404).json({ ok:false, msg:'Partido no encontrado' });
    }

    const totalSpots = Number(
      match.spots_total
      ?? match.capacity
      ?? match.max_players
      ?? match.total_spots
      ?? match.plazas
      ?? match.plazas_totales
      ?? 0
    );

    if (totalSpots <= 0) {
      await conn.rollback();
      return res.status(500).json({ ok:false, msg:'No se pudo determinar la capacidad del partido' });
    }

    const currentTaken = Number(match.spots_taken || 0);
    if ((currentTaken + quantity) > totalSpots) {
      await conn.rollback();
      return res.status(400).json({ ok:false, msg:`No hay ${quantity} plaza(s) disponibles` });
    }

    // descontar EasyPass
    await conn.query(
      'UPDATE users SET easypass_balance = easypass_balance - ? WHERE id=?',
      [quantity, userId]
    );

    // crear inscripción confirmada
    const inscriptionValues = Array.from({ length: quantity }, () => [matchId, userId, 'confirmed', shirtColor, 'easypass']);
    const [ins] = await conn.query(
      `INSERT INTO inscriptions (match_id, user_id, status, ticket_type, payment_type)
       VALUES ?`,
      [inscriptionValues]
    );

    // aumentar plazas ocupadas
    await conn.query(
      'UPDATE matches SET spots_taken = spots_taken + ? WHERE id=?',
      [quantity, matchId]
    );

    // registrar movimiento de EasyPass
    await conn.query(
      `INSERT INTO easypass_transactions (user_id, type, amount, description, event_id, created_at)
       VALUES (?, 'spend', ?, ?, ?, NOW())`,
      [userId, -quantity, `Compra de ${quantity} plaza(s) con EasyPass`, matchId]
    );

    const [[updatedUser]] = await conn.query(
      'SELECT easypass_balance AS easyPassBalance FROM users WHERE id=? LIMIT 1',
      [userId]
    );

    await conn.commit();

    return res.json({
      ok:true,
      msg:`${quantity} plaza(s) confirmada(s) con EasyPass`,
      inscription_id: ins.insertId,
      quantity,
      easyPassBalance: Number(updatedUser?.easyPassBalance || 0),
    });

  } catch (e) {
    await conn.rollback();
    console.error(e);
    return res.status(500).json({ ok:false, msg:'Error al usar EasyPass' });
  } finally {
    conn.release();
  }
});

// --- Cancelar (con posible reembolso) ---
router.post('/matches/:id/cancel', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const userId = req.user.id;
    const matchId = Number(req.params.id);

    // Traer inscripción + datos de partido
    const [[row]] = await conn.query(
      `SELECT COUNT(*) AS inscription_count,
              MIN(i.id) AS inscription_id,
              MAX(i.status) AS status,
              MAX(i.stripe_session_id) AS stripe_session_id,
              MAX(i.ticket_type) AS ticket_type,
              MAX(i.payment_type) AS payment_type,
              m.starts_at, m.id AS match_id
       FROM inscriptions i
       JOIN matches m ON m.id = i.match_id
       WHERE i.user_id=? AND i.match_id=? AND i.status != 'cancelled'`,
      [userId, matchId]
    );

    if (!row) return res.status(404).json({ ok:false, msg:'No estabas inscrito' });

    const inscriptionCount = Number(row.inscription_count || 0);
    if (inscriptionCount <= 0) return res.status(404).json({ ok:false, msg:'No estabas inscrito' });

    // Si está pending (no pagado), borrar y liberar plaza si se había sumado (no debería)
    if (row.status === 'pending') {
      await conn.beginTransaction();
      await conn.query('DELETE FROM inscriptions WHERE user_id=? AND match_id=? AND status="pending"', [userId, matchId]);
      // por seguridad, no tocamos spots_taken aquí (pending no suma)
      await conn.commit();
      return res.json({ ok:true, msg:'Inscripción cancelada (pendiente, sin pago)' });
    }

    // Si estaba confirmado, calcular política
    if (row.status === 'confirmed') {

      // --- Caso nuevo: inscripción pagada con EasyPass ---
      if (!row.stripe_session_id && (row.payment_type === 'easypass' || row.ticket_type === 'credit' || row.ticket_type === 'easypass')) {
        const pct = refundPercent(row.starts_at);
        if (pct === 0) {
          return res.status(400).json({ ok:false, msg:'Solo se devuelve el EasyPass si cancelas con más de 6 horas de antelación' });
        }

        await conn.beginTransaction();

        // devolver EasyPass
        await conn.query(
          'UPDATE users SET easypass_balance = easypass_balance + ? WHERE id=?',
          [inscriptionCount, userId]
        );

        // registrar devolución
        await conn.query(
          `INSERT INTO easypass_transactions (user_id, type, amount, description, event_id, created_at)
           VALUES (?, 'refund', ?, ?, ?, NOW())`,
          [userId, inscriptionCount, `Cancelación con devolución de ${inscriptionCount} EasyPass`, matchId]
        );

        // cancelar inscripción
        await conn.query(
          'UPDATE inscriptions SET status="cancelled" WHERE user_id=? AND match_id=? AND status!="cancelled"',
          [userId, matchId]
        );

        // liberar plaza
        await conn.query(
          'UPDATE matches SET spots_taken = GREATEST(spots_taken - ?, 0) WHERE id=?',
          [inscriptionCount, matchId]
        );

        const [[updatedUser]] = await conn.query(
          'SELECT easypass_balance AS easyPassBalance FROM users WHERE id=? LIMIT 1',
          [userId]
        );

        await conn.commit();

        return res.json({
          ok:true,
          msg:'Cancelada y EasyPass devuelto',
          pct,
          easyPassBalance: Number(updatedUser?.easyPassBalance || 0),
        });
      }

      const pct = refundPercent(row.starts_at);
      if (pct === 0) {
        return res.status(400).json({ ok:false, msg:'Solo se devuelve el pago si cancelas con más de 6 horas de antelación' });
      }
      if (!row.stripe_session_id) {
        return res.status(400).json({ ok:false, msg:'No se encontró el pago en Stripe' });
      }

      // Obtener charge desde la sesión
      const session = await stripe.checkout.sessions.retrieve(row.stripe_session_id, {
        expand: ['payment_intent.latest_charge']
      });
      const charge = session?.payment_intent?.latest_charge;
      if (!charge) return res.status(400).json({ ok:false, msg:'Pago no localizable' });

      const refundAmount = Math.round((charge.amount_captured || 0) * (pct/100));

      await conn.beginTransaction();

      // Crear reembolso en Stripe
      const refund = await stripe.refunds.create({ charge: charge.id, amount: refundAmount });

      // Marcar cancelada y liberar plaza
      await conn.query('UPDATE inscriptions SET status="cancelled" WHERE user_id=? AND match_id=? AND status!="cancelled"', [userId, matchId]);
      await conn.query(
        'UPDATE matches SET spots_taken = GREATEST(spots_taken - ?, 0) WHERE id=?',
        [inscriptionCount, matchId]
      );

      await conn.commit();

      return res.json({ ok:true, msg:`Canceladas ${inscriptionCount} plaza(s) con reembolso`, pct, refund_id: refund.id });
    }

    // Ya estaba cancelada
    return res.status(400).json({ ok:false, msg:'Ya estaba cancelada' });

  } catch (e) {
    await conn.rollback();
    console.error(e);
    return res.status(500).json({ ok:false, msg:'Error al cancelar' });
  } finally {
    conn.release();
  }
});

export default router;
