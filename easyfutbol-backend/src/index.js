// easyfutbol-backend/src/index.js
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { assertDB } from './config/db.js';

import webhookRouter from './routes/stripeWebhook.js';
import health from './routes/health.js';
import auth from './routes/auth.js';
import matches from './routes/matches.js';
import inscriptions from './routes/inscriptions.js';
import admin from './routes/admin.js';
import stats from './routes/stats.js';
import adminStats from './routes/adminStats.js';
import profile from './routes/profile.js';
import adminNotify from './routes/adminNotify.js';

const app = express();
const PORT = Number(process.env.PORT || 4000);

// Webhook (usa express.raw)
app.use('/api', webhookRouter);

// Middlewares normales
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*' }));
app.use(express.json());

// Healthcheck directo para la app (evita 404 en /api/health)
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
app.use('/api', adminNotify);

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
