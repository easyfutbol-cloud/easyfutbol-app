// easyfutbol-backend/src/index.js
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { assertDB, pool } from './config/db.js';

import webhookRouter from './routes/stripeWebhook.js';
import health from './routes/health.js';
import auth from './routes/auth.js';
import matches from './routes/matches.js';
import inscriptions from './routes/inscriptions.js';
import admin from './routes/admin.js';
import stats from './routes/stats.js';
import adminStats from './routes/adminStats.js';
import profile from './routes/profile.js';
import easyPass from './routes/easypass.js';
import adminNotify from './routes/adminNotify.js';
import adminMatches from './routes/adminMatches.js';
import achievements from './routes/achievements.js';
import worldcup from './routes/worldcup.js';
import appConfigRoutes from './routes/appConfigRoutes.js';
import kpis from './routes/kpis.js';
import { requireAuth } from './middlewares/auth.js';
import { sendPushNotification } from './services/pushService.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);

// Webhook de Stripe (usa express.raw dentro del router). Importante: va ANTES de express.json()
app.use('/api/stripe', webhookRouter);

// Middlewares normales
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*' }));
app.use(express.json());

// Healthcheck directo para la app (evita 404 en /api/health)
app.post('/api/push/register-token', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { pushToken, platform } = req.body || {};

    if (!userId) {
      return res.status(401).json({ ok: false, msg: 'Usuario no autenticado' });
    }

    if (!pushToken || !platform) {
      return res.status(400).json({ ok: false, msg: 'pushToken y platform son obligatorios' });
    }

    if (!['ios', 'android'].includes(platform)) {
      return res.status(400).json({ ok: false, msg: 'Platform no válida' });
    }

    await pool.query(
      `INSERT INTO push_tokens (user_id, expo_push_token, platform, is_active)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         platform = VALUES(platform),
         is_active = 1,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, pushToken, platform]
    );

    return res.json({ ok: true, msg: 'Token push registrado correctamente' });
  } catch (error) {
    console.error('Error registrando push token:', error);
    return res.status(500).json({ ok: false, msg: 'Error interno del servidor' });
  }
});

app.post('/api/push/test', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;

    const [rows] = await pool.query(
      `SELECT expo_push_token
       FROM push_tokens
       WHERE user_id = ? AND is_active = 1`,
      [userId]
    );

    const tokens = rows.map(r => r.expo_push_token).filter(Boolean);

    if (!tokens.length) {
      return res.status(404).json({
        ok: false,
        msg: 'No hay tokens push registrados para este usuario',
      });
    }

    const tickets = await sendPushNotification(tokens, {
      title: 'EasyFutbol',
      body: 'Notificación push de prueba',
      data: {
        screen: 'Home',
        type: 'test_push',
      },
    });

    return res.json({
      ok: true,
      msg: 'Push enviada',
      tokens: tokens.length,
      tickets,
    });
  } catch (error) {
    console.error('Error enviando push de prueba:', error);
    return res.status(500).json({
      ok: false,
      msg: 'Error interno del servidor',
    });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    await assertDB();
    res.json({ ok: true, msg: 'ok' });
  } catch (e) {
    console.error('Error en /api/health:', e);
    res.status(500).json({ ok: false, msg: 'Error conectando a la base de datos' });
  }
});

// Rutas API (todas bajo /api)
app.use('/api', health);
app.use('/api', auth);
app.use('/api', matches);
app.use('/api', inscriptions);
app.use('/api', admin);
app.use('/api', stats);
app.use('/api', adminStats);
app.use('/api', profile);
app.use('/api', easyPass);
app.use('/api', adminNotify);
app.use('/api/achievements', achievements);
app.use('/api/worldcup', worldcup);
app.use('/api/app-config', appConfigRoutes);
app.use('/api/kpis', kpis);
app.use('/api/admin/matches', adminMatches);

// estáticos para avatares
app.use('/uploads', express.static('uploads'));

app.get('/', (_req, res) => res.send('EasyFutbol Backend up'));

(async () => {
  try {
    await assertDB();
    app.listen(PORT, () => console.log(`✅ API http://localhost:${PORT}`));
  } catch (e) {
    console.error('❌ DB no responde:', e.message);
    process.exit(1);
  }
})();
