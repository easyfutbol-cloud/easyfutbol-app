import express from 'express';
import Stripe from 'stripe';
import { pool } from '../config/db.js';
import * as authMiddleware from '../middlewares/auth.js';
import { getPlusFairPlayStatus } from '../services/plusFairPlayService.js';
import { getUserEntitlements } from '../services/subscriptionService.js';
import { createSocialNotification } from '../services/socialService.js';

const requireAuth =
  authMiddleware.default ||
  authMiddleware.requireAuth ||
  authMiddleware.auth;

if (!requireAuth) {
  throw new Error("No se pudo resolver el middleware de auth desde ../middlewares/auth.js");
}

const router = express.Router();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.FRONTEND_URL ||
  'https://easyfutbol.es';

async function getSubscriptionDiscount(userId) {
  try {
    const entitlements=await getUserEntitlements(pool,userId);
    const percent=entitlements.benefits_active ? Number(entitlements.benefits?.easypass_discount_percent || 0) : 0;
    return { percent,plan:entitlements.plan,isActive:percent>0 };
  } catch {
    const status=await getPlusFairPlayStatus(pool,userId);
    return { percent:status.eligible ? 10 : 0,plan:status.eligible ? 'plus' : null,isActive:status.eligible };
  }
}

/**
 * Sedes disponibles para EasyPass
 */
router.get('/locations', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, slug
       FROM locations
       WHERE active = 1
       ORDER BY id ASC`
    );

    return res.json({
      ok: true,
      data: rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        slug: row.slug,
      })),
    });
  } catch (e) {
    console.error('[GET /locations]', e);
    return res.status(500).json({ ok:false, msg:'Error obteniendo sedes EasyPass' });
  }
});

/**
 * Packs de EasyPass disponibles
 */
router.get('/packs', requireAuth, async (req, res) => {
  try {
    const discount = await getSubscriptionDiscount(req.user.id);
    const requestedLocationId = Number(req.query.location_id || req.query.locationId || 1);
    const locationId = Number.isInteger(requestedLocationId) && requestedLocationId > 0
      ? requestedLocationId
      : 1;

    const [[location]] = await pool.query(
      `SELECT id, name, slug
       FROM locations
       WHERE id = ?
         AND active = 1
       LIMIT 1`,
      [locationId]
    );

    if (!location) {
      return res.status(404).json({ ok:false, msg:'Sede no encontrada' });
    }

    const [rows] = await pool.query(
      `SELECT id, location_id, name, credits AS easyPassAmount, price_cents
       FROM easypass_packs
       WHERE is_active = 1
         AND location_id = ?
       ORDER BY credits ASC`,
      [locationId]
    );

    return res.json({
      ok: true,
      location: {
        id: Number(location.id),
        name: location.name,
        slug: location.slug,
      },
      is_plus: discount.isActive,
      subscription_plan:discount.plan,
      discount_percent:discount.percent,
      data: rows.map((row) => ({
        ...row,
        id: Number(row.id),
        location_id: Number(row.location_id),
        locationId: Number(row.location_id),
        easyPassAmount: Number(row.easyPassAmount || 0),
        credits: Number(row.easyPassAmount || 0),
        original_price_cents: Number(row.price_cents || 0),
        price_cents:discount.percent ? Math.round(Number(row.price_cents || 0)*(1-discount.percent/100)) : Number(row.price_cents || 0),
        plus_discount_applied:discount.isActive,
        subscription_discount_percent:discount.percent,
      })),
    });
  } catch (e) {
    console.error('[GET /packs]', e);
    return res.status(500).json({ ok:false, msg:'Error obteniendo packs EasyPass' });
  }
});

/**
 * Historial de movimientos de EasyPass del usuario autenticado
 */
router.get('/me/credits/history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT et.id,et.type,et.amount,et.description,et.event_id,et.pack_id,et.payment_reference,et.created_at,
              ep.name pack_name,ep.credits pack_credits,ep.is_active pack_active,
              COALESCE(pl.name,ml.name) location_name,COALESCE(ep.location_id,m.location_id) location_id,m.title match_title
       FROM easypass_transactions et
       LEFT JOIN easypass_packs ep ON ep.id=et.pack_id LEFT JOIN locations pl ON pl.id=ep.location_id
       LEFT JOIN matches m ON m.id=et.event_id LEFT JOIN locations ml ON ml.id=m.location_id
       WHERE et.user_id = ?
       ORDER BY et.created_at DESC
       LIMIT 100`,
      [userId]
    );

    return res.json({
      ok: true,
      data: rows.map((row) => {
        const amount=Number(row.amount||0),type=String(row.type||'');
        const copy=type==='purchase'?['Compra de EasyPass',row.pack_name||'Pack comprado']
          :type==='spend'?['Reserva de partido',row.match_title||'EasyPass utilizado para jugar']
          :type==='refund'?['Devolución',row.match_title?`Cancelación de ${row.match_title}`:'EasyPass devuelto']
          :type==='gift_sent'?['EasyPass regalado',row.description||'Transferencia enviada a un amigo']
          :type==='gift_received'?['Regalo recibido',row.description||'EasyPass recibido de un amigo']
          :type.includes('grant')?['Beneficio de suscripción','EasyPass mensual incluido en tu plan']
          :amount>0?['Bonificación','EasyPass añadido a tu cuenta']:['Ajuste de saldo','Movimiento de EasyPass'];
        return {...row,amount,easyPassAmount:amount,event_id:row.event_id?Number(row.event_id):null,pack_id:row.pack_id?Number(row.pack_id):null,
          location_id:row.location_id?Number(row.location_id):null,title:copy[0],explanation:copy[1],direction:amount>=0?'in':'out',can_repeat:Boolean(row.pack_id&&row.pack_active),
        };
      }),
    });
  } catch (e) {
    console.error('[GET /me/credits/history]', e);
    return res.status(500).json({ ok:false, msg:'Error obteniendo movimientos EasyPass' });
  }
});

/**
 * Regalar EasyPass de una sede a una amistad aceptada.
 */
router.post('/me/credits/gift', requireAuth, async (req,res) => {
  const senderId=Number(req.user.id);
  const recipientId=Number(req.body?.recipient_id);
  const locationId=Number(req.body?.location_id);
  const amount=Number(req.body?.amount);
  const requestKey=String(req.body?.request_key||'').trim().slice(0,80);
  if(!Number.isInteger(recipientId)||recipientId<=0||recipientId===senderId)return res.status(400).json({ok:false,msg:'Destinatario no válido'});
  if(!Number.isInteger(locationId)||locationId<=0)return res.status(400).json({ok:false,msg:'Sede no válida'});
  if(!Number.isInteger(amount)||amount<1||amount>20)return res.status(400).json({ok:false,msg:'Puedes regalar entre 1 y 20 EasyPass'});
  if(requestKey.length<12)return res.status(400).json({ok:false,msg:'Identificador de transferencia no válido'});

  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]]=await conn.query('SELECT id FROM easypass_gifts WHERE request_key=? AND sender_id=?',[requestKey,senderId]);
    if(existing){await conn.commit();return res.json({ok:true,already_processed:true,gift_id:Number(existing.id)});}
    const [[friendship]]=await conn.query(
      `SELECT id FROM friendships WHERE status='accepted' AND user_low_id=LEAST(?,?) AND user_high_id=GREATEST(?,?) LIMIT 1`,
      [senderId,recipientId,senderId,recipientId]
    );
    if(!friendship){await conn.rollback();return res.status(403).json({ok:false,msg:'Solo puedes regalar EasyPass a tus amigos'});}
    const [[location]]=await conn.query('SELECT id,name FROM locations WHERE id=? AND active=1 LIMIT 1',[locationId]);
    if(!location){await conn.rollback();return res.status(404).json({ok:false,msg:'Sede no encontrada'});}
    const [lockedUsers]=await conn.query('SELECT id,name FROM users WHERE id IN (?,?) ORDER BY id FOR UPDATE',[senderId,recipientId]);
    const sender=lockedUsers.find(user=>Number(user.id)===senderId);
    const recipient=lockedUsers.find(user=>Number(user.id)===recipientId);
    if(!recipient){await conn.rollback();return res.status(404).json({ok:false,msg:'Usuario no encontrado'});}
    const [[balance]]=await conn.query('SELECT balance FROM user_easypass_balances WHERE user_id=? AND location_id=? FOR UPDATE',[senderId,locationId]);
    const currentBalance=Number(balance?.balance||0);
    if(currentBalance<amount){await conn.rollback();return res.status(409).json({ok:false,msg:`No tienes ${amount} EasyPass disponibles en ${location.name}`});}

    const [giftResult]=await conn.query(
      'INSERT INTO easypass_gifts(request_key,sender_id,recipient_id,location_id,amount) VALUES (?,?,?,?,?)',
      [requestKey,senderId,recipientId,locationId,amount]
    );
    await conn.query('UPDATE user_easypass_balances SET balance=balance-? WHERE user_id=? AND location_id=?',[amount,senderId,locationId]);
    await conn.query(
      `INSERT INTO user_easypass_balances(user_id,location_id,balance) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE balance=balance+VALUES(balance)`,
      [recipientId,locationId,amount]
    );
    await conn.query('UPDATE users SET easypass_balance=GREATEST(COALESCE(easypass_balance,0)-?,0) WHERE id=?',[amount,senderId]);
    await conn.query('UPDATE users SET easypass_balance=COALESCE(easypass_balance,0)+? WHERE id=?',[amount,recipientId]);
    await conn.query(
      `INSERT INTO easypass_transactions(user_id,type,amount,description,payment_reference,created_at)
       VALUES (?,'gift_sent',?,? ,?,NOW()),(?,'gift_received',?,?,?,NOW())`,
      [senderId,-amount,`Para ${recipient.name} · ${location.name}`,`gift:${giftResult.insertId}`,recipientId,amount,`De ${sender.name} · ${location.name}`,`gift:${giftResult.insertId}`]
    );
    await conn.commit();
    try {
      await createSocialNotification(pool, {
        userId: recipientId,
        actorId: senderId,
        type: 'easypass_gift',
        entityType: 'easypass_gift',
        entityId: Number(giftResult.insertId),
        title: 'Has recibido EasyPass',
        body: `${sender.name} te ha regalado ${amount} EasyPass de ${location.name}.`,
        data: { screen: 'EasyPass', locationId, giftId: Number(giftResult.insertId) },
        dedupeKey: `easypass-gift:${giftResult.insertId}`,
      });
    } catch (notificationError) {
      console.error('[EASYPASS GIFT NOTIFICATION]', notificationError?.message || notificationError);
    }
    res.status(201).json({ok:true,gift_id:Number(giftResult.insertId),balance:currentBalance-amount,msg:`Has regalado ${amount} EasyPass a ${recipient.name}`});
  } catch(error) {
    await conn.rollback();
    if(error?.code==='ER_DUP_ENTRY')return res.json({ok:true,already_processed:true});
    console.error('[EASYPASS GIFT]',error);
    res.status(500).json({ok:false,msg:'No se pudo completar el regalo'});
  } finally { conn.release(); }
});

/**
 * Crear checkout de Stripe para comprar un pack EasyPass
 */
router.post('/packs/:id/checkout', requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ ok:false, msg:'Stripe no está configurado en el backend' });
    }

    const userId = req.user.id;
    const packId = Number(req.params.id);

    if (!Number.isInteger(packId) || packId <= 0) {
      return res.status(400).json({ ok:false, msg:'Pack inválido' });
    }

    const [[pack]] = await pool.query(
      `SELECT ep.id, ep.location_id, ep.name, ep.credits AS easyPassAmount, ep.price_cents, ep.is_active,
              l.name AS locationName, l.slug AS locationSlug
       FROM easypass_packs ep
       LEFT JOIN locations l ON l.id = ep.location_id
       WHERE ep.id = ?
       LIMIT 1`,
      [packId]
    );

    if (!pack || Number(pack.is_active) !== 1) {
      return res.status(404).json({ ok:false, msg:'Pack no encontrado' });
    }

    const discount = await getSubscriptionDiscount(userId);
    const finalPriceCents = discount.percent
      ? Math.round(Number(pack.price_cents || 0)*(1-discount.percent/100)) : Number(pack.price_cents || 0);

    const baseUrl = String(APP_BASE_URL || 'https://easyfutbol.es').replace(/\/$/, '');
    const successUrl = `${baseUrl}/pago-ok/?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/pago-cancelado/`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      allow_promotion_codes: true,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: pack.name || `${Number(pack.easyPassAmount || 0)} EasyPass`,
              description: `Pack de ${Number(pack.easyPassAmount || 0)} EasyPass - ${pack.locationName || 'EasyFutbol'}`,
            },
            unit_amount: finalPriceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: String(userId),
        packId: String(pack.id),
        packEasyPassAmount: String(Number(pack.easyPassAmount || 0)),
        locationId: String(pack.location_id || 1),
        locationSlug: String(pack.locationSlug || 'valladolid'),
        kind: 'easypass_pack',
        subscriptionPlan:discount.plan || '',
        subscriptionDiscountPercent:String(discount.percent),
        plusDiscountPercent:String(discount.percent),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return res.json({
      ok: true,
      url: session.url,
      checkout_url: session.url,
      session_id: session.id,
      pack: {
        id: Number(pack.id),
        location_id: Number(pack.location_id || 1),
        locationId: Number(pack.location_id || 1),
        locationName: pack.locationName || null,
        name: pack.name,
        easyPassAmount: Number(pack.easyPassAmount || 0),
        credits: Number(pack.easyPassAmount || 0),
        original_price_cents: Number(pack.price_cents || 0),
        price_cents: finalPriceCents,
        plus_discount_applied:discount.isActive,
        subscription_plan:discount.plan,
        subscription_discount_percent:discount.percent,
      },
    });
  } catch (e) {
    console.error('[POST /packs/:id/checkout]', e);
    return res.status(500).json({ ok:false, msg:'Error creando checkout de EasyPass' });
  }
});

/**
 * Confirmación manual temporal para pruebas sin depender del webhook de Stripe
 */
router.post('/packs/:id/confirm', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const userId = req.user.id;
    const packId = Number(req.params.id);
    const paymentReference = req.body?.payment_reference || `manual_${Date.now()}`;

    if (!Number.isInteger(packId) || packId <= 0) {
      return res.status(400).json({ ok:false, msg:'Pack inválido' });
    }

    await conn.beginTransaction();

    const [[existingTx]] = await conn.query(
      `SELECT id
       FROM easypass_transactions
       WHERE user_id=?
         AND type='purchase'
         AND pack_id=?
         AND payment_reference=?
       LIMIT 1`,
      [userId, packId, paymentReference]
    );

    if (existingTx) {
      await conn.rollback();
      return res.json({ ok:true, alreadyProcessed:true });
    }

    const [[pack]] = await conn.query(
      `SELECT ep.id, ep.location_id, ep.name, ep.credits AS easyPassAmount, ep.is_active,
              l.name AS locationName, l.slug AS locationSlug
       FROM easypass_packs ep
       LEFT JOIN locations l ON l.id = ep.location_id
       WHERE ep.id=?
       LIMIT 1`,
      [packId]
    );

    if (!pack || Number(pack.is_active) !== 1) {
      await conn.rollback();
      return res.status(404).json({ ok:false, msg:'Pack no encontrado' });
    }

    const easyPassAmount = Number(pack.easyPassAmount || 0);

    const locationId = Number(pack.location_id || 1);
    const locationName = pack.locationName || (locationId === 2 ? 'Asturias' : 'Valladolid');

    await conn.query(
      `INSERT INTO user_easypass_balances (user_id, location_id, balance)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance)`,
      [userId, locationId, easyPassAmount]
    );

    await conn.query(
      `UPDATE users
       SET easypass_balance = COALESCE(easypass_balance, 0) + ?
       WHERE id = ?`,
      [easyPassAmount, userId]
    );

    await conn.query(
      `INSERT INTO easypass_transactions
        (user_id, type, amount, description, pack_id, payment_reference, created_at)
       VALUES (?, 'purchase', ?, ?, ?, ?, NOW())`,
      [userId, easyPassAmount, `Compra pack ${pack.name || `#${packId}`} - ${locationName}`, packId, paymentReference]
    );

    const [[updatedUser]] = await conn.query(
      'SELECT easypass_balance AS easyPassBalance FROM users WHERE id=? LIMIT 1',
      [userId]
    );

    await conn.commit();

    return res.json({
      ok: true,
      alreadyProcessed: false,
      easyPassAmountAdded: easyPassAmount,
      credits_added: easyPassAmount,
      location_id: Number(pack.location_id || 1),
      locationId: Number(pack.location_id || 1),
      locationName: pack.locationName || null,
      easyPassBalance: Number(updatedUser?.easyPassBalance || 0),
      credits: Number(updatedUser?.easyPassBalance || 0),
    });
  } catch (e) {
    await conn.rollback();
    console.error('[POST /packs/:id/confirm]', e);
    return res.status(500).json({ ok:false, msg:'Error confirmando compra EasyPass' });
  } finally {
    conn.release();
  }
});

export default router;
