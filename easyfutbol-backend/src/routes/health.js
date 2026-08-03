import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

router.get('/health', async (_req, res) => {
  const startedAt = Date.now();
  try {
    await pool.query('SELECT 1 AS ok');
    res.json({
      ok: true,
      msg: 'ok',
      service: 'easyfutbol-api',
      db: 'up',
      dbLatencyMs: Date.now() - startedAt,
      uptimeSeconds: Math.floor(process.uptime()),
      version: process.env.APP_VERSION || process.env.npm_package_version || 'unknown',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[HEALTH] Base de datos no disponible:', error?.message || error);
    res.status(503).json({
      ok: false,
      msg: 'Error conectando a la base de datos',
      service: 'easyfutbol-api',
      db: 'down',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
