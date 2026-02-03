import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

router.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1 AS ok');
    res.json({ ok: true, service: 'API EasyFutbol v0', db: 'up' });
  } catch {
    res.status(500).json({ ok: false, service: 'API EasyFutbol v0', db: 'down' });
  }
});

export default router;
