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
      `SELECT i.id AS inscription_id, i.status, i.stripe_session_id, i.ticket_type,
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

    await conn.beginTransaction();

    // bloquear usuario para comprobar saldo EasyPass
    const [[user]] = await conn.query(
      'SELECT easypass_balance AS easyPassBalance FROM users WHERE id=? FOR UPDATE',
      [userId]
    );

    if (!user || Number(user.easyPassBalance || 0) < 1) {
      await conn.rollback();
      return res.status(400).json({ ok:false, msg:'No tienes EasyPass suficientes' });
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

    const [[existingInscription]] = await conn.query(
      `SELECT id, status
       FROM inscriptions
       WHERE match_id=? AND user_id=?
       LIMIT 1`,
      [matchId, userId]
    );

    if (existingInscription && existingInscription.status !== 'cancelled') {
      await conn.rollback();
      return res.status(400).json({ ok:false, msg:'Ya estás inscrito en este partido' });
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

    if (Number(match.spots_taken || 0) >= totalSpots) {
      await conn.rollback();
      return res.status(400).json({ ok:false, msg:'Partido lleno' });
    }

    // descontar EasyPass
    await conn.query(
      'UPDATE users SET easypass_balance = easypass_balance - 1 WHERE id=?',
      [userId]
    );

    // crear inscripción confirmada
    const [ins] = await conn.query(
      `INSERT INTO inscriptions (match_id, user_id, status, ticket_type)
       VALUES (?, ?, 'confirmed', 'easypass')`,
      [matchId, userId]
    );

    // aumentar plazas ocupadas
    await conn.query(
      'UPDATE matches SET spots_taken = spots_taken + 1 WHERE id=?',
      [matchId]
    );

    // registrar movimiento de EasyPass
    await conn.query(
      `INSERT INTO easypass_transactions (user_id, type, amount, description, event_id, created_at)
       VALUES (?, 'spend', -1, 'Inscripción con EasyPass', ?, NOW())`,
      [userId, matchId]
    );

    const [[updatedUser]] = await conn.query(
      'SELECT easypass_balance AS easyPassBalance FROM users WHERE id=? LIMIT 1',
      [userId]
    );

    await conn.commit();

    return res.json({
      ok:true,
      msg:'Inscripción confirmada con EasyPass',
      inscription_id: ins.insertId,
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
      `SELECT i.id AS inscription_id, i.status, i.stripe_session_id, i.ticket_type,
              m.starts_at, m.id AS match_id
       FROM inscriptions i
       JOIN matches m ON m.id = i.match_id
       WHERE i.user_id=? AND i.match_id=?
       LIMIT 1`, [userId, matchId]
    );

    if (!row) return res.status(404).json({ ok:false, msg:'No estabas inscrito' });

    // Si está pending (no pagado), borrar y liberar plaza si se había sumado (no debería)
    if (row.status === 'pending') {
      await conn.beginTransaction();
      await conn.query('DELETE FROM inscriptions WHERE id=?', [row.inscription_id]);
      // por seguridad, no tocamos spots_taken aquí (pending no suma)
      await conn.commit();
      return res.json({ ok:true, msg:'Inscripción cancelada (pendiente, sin pago)' });
    }

    // Si estaba confirmado, calcular política
    if (row.status === 'confirmed') {

      // --- Caso nuevo: inscripción pagada con EasyPass ---
      if (!row.stripe_session_id && (row.ticket_type === 'credit' || row.ticket_type === 'easypass')) {
        const pct = refundPercent(row.starts_at);
        if (pct === 0) {
          return res.status(400).json({ ok:false, msg:'Solo se devuelve el EasyPass si cancelas con más de 6 horas de antelación' });
        }

        await conn.beginTransaction();

        // devolver EasyPass
        await conn.query(
          'UPDATE users SET easypass_balance = easypass_balance + 1 WHERE id=?',
          [userId]
        );

        // registrar devolución
        await conn.query(
          `INSERT INTO easypass_transactions (user_id, type, amount, description, event_id, created_at)
           VALUES (?, 'refund', 1, 'Cancelación con devolución de EasyPass', ?, NOW())`,
          [userId, matchId]
        );

        // cancelar inscripción
        await conn.query(
          'UPDATE inscriptions SET status="cancelled" WHERE id=?',
          [row.inscription_id]
        );

        // liberar plaza
        await conn.query(
          'UPDATE matches SET spots_taken = GREATEST(spots_taken - 1, 0) WHERE id=?',
          [matchId]
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
      await conn.query('UPDATE inscriptions SET status="cancelled" WHERE id=?', [row.inscription_id]);
      await conn.query(
        'UPDATE matches SET spots_taken = GREATEST(spots_taken - 1, 0) WHERE id=?',
        [matchId]
      );

      await conn.commit();

      return res.json({ ok:true, msg:'Cancelada con reembolso', pct, refund_id: refund.id });
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
