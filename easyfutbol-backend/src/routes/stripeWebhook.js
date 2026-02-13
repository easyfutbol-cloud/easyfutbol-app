import express from 'express';
import Stripe from 'stripe';
import { pool } from '../config/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const MAX_TICKETS_PER_PURCHASE = 8;

const webhookRouter = express.Router();

// OJO: este router usa express.raw(), por eso se monta antes del express.json() global
webhookRouter.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('⚠️  Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Seguridad extra: solo procesar pagos realmente completados
    if (session.payment_status && session.payment_status !== 'paid') {
      console.log('⚠️  Sesión completada pero payment_status != paid, se ignora:', session.id);
      return res.json({ received: true });
    }

    const metadata = session.metadata || {};
    const matchId = metadata.match_id ? Number(metadata.match_id) : null;
    const userId = metadata.user_id ? Number(metadata.user_id) : null;
    const inscriptionId = metadata.inscription_id ? Number(metadata.inscription_id) : null;
    const rawQuantity = metadata.quantity ? Number(metadata.quantity) : 1;
    const ticketType = metadata.ticket_type || null;

    const safeQuantity = Math.max(1, Math.min(isNaN(rawQuantity) ? 1 : rawQuantity, MAX_TICKETS_PER_PURCHASE));

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let totalTicketsConfirmed = 0;

      if (inscriptionId) {
        // Nuevo flujo: tenemos la inscripción concreta en metadata
        const [upd] = await conn.query(
          'UPDATE inscriptions SET status="confirmed", stripe_session_id=?, ticket_type=COALESCE(ticket_type, ?) WHERE id=? AND status="pending"',
          [session.id, ticketType, inscriptionId]
        );
        totalTicketsConfirmed += upd.affectedRows;

        // Si se ha confirmado 1 inscripción y la cantidad es mayor, creamos inscripciones extra confirmadas
        const remaining = safeQuantity - totalTicketsConfirmed;
        if (remaining > 0 && userId && matchId) {
          for (let i = 0; i < remaining; i += 1) {
            await conn.query(
              'INSERT INTO inscriptions (user_id, match_id, status, ticket_type, stripe_session_id) VALUES (?, ?, "confirmed", ?, ?)',
              [userId, matchId, ticketType, session.id]
            );
            totalTicketsConfirmed += 1;
          }
        }
      } else if (userId && matchId) {
        // Flujo antiguo: buscamos por usuario+partido en estado pending
        const [upd] = await conn.query(
          'UPDATE inscriptions SET status="confirmed", stripe_session_id=?, ticket_type=COALESCE(ticket_type, ?) WHERE user_id=? AND match_id=? AND status="pending"',
          [session.id, ticketType, userId, matchId]
        );
        totalTicketsConfirmed += upd.affectedRows;

        // Si hay menos filas pending que la cantidad deseada, creamos inscripciones extra
        const remaining = safeQuantity - totalTicketsConfirmed;
        if (remaining > 0) {
          for (let i = 0; i < remaining; i += 1) {
            await conn.query(
              'INSERT INTO inscriptions (user_id, match_id, status, ticket_type, stripe_session_id) VALUES (?, ?, "confirmed", ?, ?)',
              [userId, matchId, ticketType, session.id]
            );
            totalTicketsConfirmed += 1;
          }
        }
      } else {
        console.warn('⚠️  Webhook sin metadata suficiente para localizar la inscripción:', session.id);
        await conn.rollback();
        return res.json({ received: true });
      }

      if (matchId && totalTicketsConfirmed > 0) {
        await conn.query(
          'UPDATE matches SET spots_taken = spots_taken + ? WHERE id=?',
          [totalTicketsConfirmed, matchId]
        );
      }

      await conn.commit();
      console.log(
        `✅ Pago confirmado (session:${session.id}, inscription:${inscriptionId || 'n/a'}, u:${userId || 'n/a'}, m:${matchId || 'n/a'})`
      );
    } catch (e) {
      await conn.rollback();
      console.error('DB error en webhook:', e);
    } finally {
      conn.release();
    }
  }

  res.json({ received: true });
});

export default webhookRouter;
