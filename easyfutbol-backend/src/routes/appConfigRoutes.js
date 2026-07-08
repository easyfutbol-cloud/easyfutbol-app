const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/version', async (req, res) => {
  try {
    const [rows] = await db.query(`
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

module.exports = router;