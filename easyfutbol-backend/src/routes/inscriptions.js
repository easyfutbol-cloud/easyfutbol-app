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
  if (diffH > 24) return 100;
  if (diffH > 3) return 40;
  return 0;
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
      const pct = refundPercent(row.starts_at);
      if (pct === 0) {
        return res.status(400).json({ ok:false, msg:'Fuera de ventana de reembolso' });
      }
      if (!row.stripe_session_id) {
        return res.status(400).json({ ok:false, msg:'No se encontró el pago en Stripe' });
      }

      // Obtener charge desde la sesión
      const session = await stripe.checkout.sessions.retrieve(row.stripe_session_id, {
        expand: ['payment_intent.charges']
      });
      const charge = session?.payment_intent?.charges?.data?.[0];
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
