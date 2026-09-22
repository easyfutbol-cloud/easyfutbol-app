import express from 'express';
import { pool } from '../config/db.js';

const router = express.Router();

const VALID_PLATFORMS = ['ios', 'android'];

/**
 * GET /api/app-config/version?platform=ios|android
 * Lee de `app_min_versions` (una fila por plataforma). Si no llega `platform`
 * o no hay fila para esa plataforma, se devuelven las dos URLs de tienda para
 * no romper clientes antiguos que aún no mandaban el parámetro.
 */
router.get('/version', async (req, res) => {
  try {
    const platform = VALID_PLATFORMS.includes(req.query?.platform) ? req.query.platform : null;

    const [rows] = await pool.query(
      `SELECT platform, min_version, min_build, force_update, store_url, message
       FROM app_min_versions
       ${platform ? 'WHERE platform = ?' : ''}`,
      platform ? [platform] : []
    );

    const byPlatform = Object.fromEntries(rows.map((row) => [row.platform, row]));
    const row = (platform && byPlatform[platform]) || rows[0] || null;

    return res.json({
      minVersion: row?.min_version || '1.0.0',
      minBuild: row?.min_build ?? null,
      forceUpdate: row ? Boolean(Number(row.force_update)) : true,
      message: row?.message || null,
      // Compatibilidad con clientes que no mandan `platform`: se les da la URL de cada tienda.
      androidUrl: byPlatform.android?.store_url || (platform === 'android' ? row?.store_url : null) || null,
      iosUrl: byPlatform.ios?.store_url || (platform === 'ios' ? row?.store_url : null) || null,
    });
  } catch (error) {
    console.error('Error obteniendo configuración de app:', error);
    return res.status(500).json({
      message: 'Error obteniendo configuración de app',
    });
  }
});

export default router;
