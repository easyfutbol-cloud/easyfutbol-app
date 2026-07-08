import express from 'express';
import { pool } from '../config/db.js';

const router = express.Router();

router.get('/version', async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT setting_key, setting_value
      FROM app_settings
      WHERE setting_key IN ('min_app_version', 'android_store_url', 'ios_store_url')
    `);

    const settings = {};

    rows.forEach((row) => {
      settings[row.setting_key] = row.setting_value;
    });

    return res.json({
      minVersion: settings.min_app_version || '1.0.0',
      androidUrl: settings.android_store_url || null,
      iosUrl: settings.ios_store_url || null,
    });
  } catch (error) {
    console.error('Error obteniendo configuración de app:', error);
    return res.status(500).json({
      message: 'Error obteniendo configuración de app',
    });
  }
});

export default router;