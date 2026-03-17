import express from 'express';
import Stripe from 'stripe';
import { pool } from '../config/db.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
// Permitimos comprar varias entradas en una misma sesión (controlado por metadata.quantity)
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
    const purchaseType = metadata.purchase_type || null; // 'tickets' | 'pack'
    const packEasyPassAmountFromMetadata = metadata.packEasyPassAmount ? Number(metadata.packEasyPassAmount) : null;
    const packId = metadata.pack_id ? Number(metadata.pack_id) : null;

    const matchId = metadata.match_id ? Number(metadata.match_id) : null;
    const userId = metadata.user_id ? Number(metadata.user_id) : null;
    const inscriptionId = metadata.inscription_id ? Number(metadata.inscription_id) : null;
    const rawQuantity = metadata.quantity ? Number(metadata.quantity) : 1;
    const ticketType = metadata.ticket_type || null;

    const safeQuantity = Math.max(1, Math.min(isNaN(rawQuantity) ? 1 : rawQuantity, MAX_TICKETS_PER_PURCHASE));

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Idempotencia robusta: registramos/consultamos la sesión en la tabla payments (1 fila por sesión)
      // Nota: crea la tabla `payments` en MySQL (te paso el SQL en el chat) con UNIQUE(stripe_session_id)
      const [[payRow]] = await conn.query(
        'SELECT id, status FROM payments WHERE stripe_session_id=? LIMIT 1',
        [session.id]
      );

      if (payRow && payRow.status === 'confirmed') {
        await conn.rollback();
        console.log(`↩️  Webhook repetido ignorado (session:${session.id})`);
        return res.json({ received: true });
      }

      // Si no existe, lo creamos en pending. Si existe pero no está confirmado, seguimos.
      let paymentId = payRow?.id || null;
      if (!paymentId) {
        const [insPay] = await conn.query(
          `INSERT INTO payments (stripe_session_id, match_id, user_id, quantity, ticket_type, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
          [
            session.id,
            matchId,
            userId,
            (purchaseType === 'pack' || packId) ? 1 : safeQuantity,
            (purchaseType === 'pack' || packId) ? 'pack' : ticketType,
          ]
        );
        paymentId = insPay.insertId;
      }

      // --- NUEVO: compra de packs de créditos ---
      const isPackPurchase = purchaseType === 'pack' || !!packId;

      if (isPackPurchase) {
        if (!userId || !packId) {
          console.warn('⚠️  Pack purchase sin metadata suficiente (user_id/pack_id):', session.id);
          await conn.rollback();
          return res.json({ received: true });
        }

        // Idempotencia extra por si el webhook reintenta: si ya existe un movimiento con esta session.id, no duplicar créditos
        const [[txRow]] = await conn.query(
          `SELECT id
           FROM easypass_transactions
           WHERE user_id=?
             AND type='purchase'
             AND pack_id=?
             AND payment_reference=?
           LIMIT 1`,
          [userId, packId, session.id]
        );

        if (txRow) {
          // Aseguramos que el payment quede confirmado si ya se procesó antes
          await conn.query(
            'UPDATE payments SET status="confirmed", confirmed_at=NOW() WHERE id=?',
            [paymentId]
          );
          await conn.commit();
          console.log(`↩️  Webhook pack repetido ignorado (session:${session.id})`);
          return res.json({ received: true });
        }

        const [[pack]] = await conn.query(
          'SELECT id, name, credits AS easyPassAmount, is_active FROM easypass_packs WHERE id=? LIMIT 1',
          [packId]
        );

        const easyPassAmount = Number(pack.easyPassAmount) || Number(packEasyPassAmountFromMetadata) || 0;
        if (easyPassAmount <= 0) {
          console.warn('⚠️  Pack con EasyPass inválidos:', packId);
          await conn.rollback();
          return res.json({ received: true });
        }

        // Sumamos EasyPass al usuario
        await conn.query(
          'UPDATE users SET easypass_balance = easypass_balance + ? WHERE id=?',
          [easyPassAmount, userId]
        );

        // Registramos movimiento (ledger)
        await conn.query(
          `INSERT INTO easypass_transactions (user_id, type, amount, description, pack_id, payment_reference, created_at)
           VALUES (?, 'purchase', ?, ?, ?, ?, NOW())`,
          [userId, easyPassAmount, `Compra pack ${pack.name || `#${packId}`}`, packId, session.id]
        );

        const [[updatedUser]] = await conn.query(
          'SELECT easypass_balance AS easyPassBalance FROM users WHERE id=? LIMIT 1',
          [userId]
        );

        // Guardamos en payments como confirmado
        await conn.query(
          'UPDATE payments SET status="confirmed", confirmed_at=NOW() WHERE id=?',
          [paymentId]
        );

        await conn.commit();
        console.log(
          `✅ Pack EasyPass confirmado (session:${session.id}, u:${userId}, pack:${packId}, +${easyPassAmount}, saldo:${Number(updatedUser?.easyPassBalance || 0)})`
        );
        return res.json({ received: true });
      }

      // --- FLUJO EXISTENTE: compra de entradas / inscripciones ---
      let totalTicketsConfirmed = 0;

      if (inscriptionId) {
        // Flujo nuevo: tenemos una inscripción concreta creada en pending antes del checkout
        const [upd] = await conn.query(
          'UPDATE inscriptions SET status="confirmed", stripe_session_id=?, payment_id=?, ticket_type=COALESCE(ticket_type, ?) WHERE id=? AND status="pending"',
          [session.id, paymentId, ticketType, inscriptionId]
        );
        totalTicketsConfirmed += upd.affectedRows;

        // Si el usuario compró varias entradas, creamos el resto confirmadas (permitimos varias por usuario)
        const remaining = safeQuantity - totalTicketsConfirmed;
        if (remaining > 0 && userId && matchId) {
          const values = Array.from({ length: remaining }).map(() => [matchId, userId, 'confirmed', session.id, paymentId, ticketType]);
          await conn.query(
            'INSERT INTO inscriptions (match_id, user_id, status, stripe_session_id, payment_id, ticket_type) VALUES ?',
            [values]
          );
          totalTicketsConfirmed += remaining;
        }

      } else if (userId && matchId) {
        // Flujo antiguo: confirmamos tantas pending como haya (hasta quantity)
        const [upd] = await conn.query(
          'UPDATE inscriptions SET status="confirmed", stripe_session_id=?, payment_id=?, ticket_type=COALESCE(ticket_type, ?) WHERE user_id=? AND match_id=? AND status="pending" LIMIT ?',
          [session.id, paymentId, ticketType, userId, matchId, safeQuantity]
        );
        totalTicketsConfirmed += upd.affectedRows;

        // Si faltan entradas (no había suficientes pending), las creamos confirmadas
        const remaining = safeQuantity - totalTicketsConfirmed;
        if (remaining > 0) {
          const values = Array.from({ length: remaining }).map(() => [matchId, userId, 'confirmed', session.id, paymentId, ticketType]);
          await conn.query(
            'INSERT INTO inscriptions (match_id, user_id, status, stripe_session_id, payment_id, ticket_type) VALUES ?',
            [values]
          );
          totalTicketsConfirmed += remaining;
        }

      } else {
        console.warn('⚠️  Webhook sin metadata suficiente para localizar la inscripción:', session.id);
        await conn.rollback();
        return res.json({ received: true });
      }

      // Marcar pago como confirmado
      await conn.query(
        'UPDATE payments SET status="confirmed", confirmed_at=NOW() WHERE id=?',
        [paymentId]
      );

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
