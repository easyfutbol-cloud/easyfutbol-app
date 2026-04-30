const express = require('express');
const router = express.Router();
const db = require('../db'); // tu conexión mysql

router.get('/dashboard', async (req, res) => {
  try {
    // 📅 Semana actual
    const [usuarios] = await db.query(`
      SELECT COUNT(DISTINCT user_id) as total
      FROM inscriptions
      WHERE status = 'confirmed'
      AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
    `);

    const [frecuencia] = await db.query(`
      SELECT COUNT(*) / COUNT(DISTINCT user_id) as frecuencia
      FROM inscriptions
      WHERE status = 'confirmed'
      AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
    `);

    const [repeat] = await db.query(`
      SELECT COUNT(*) as repetidores FROM (
        SELECT user_id
        FROM inscriptions
        WHERE status = 'confirmed'
        AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
        GROUP BY user_id
        HAVING COUNT(*) >= 2
      ) t
    `);

    const [totalUsuarios] = await db.query(`
      SELECT COUNT(DISTINCT user_id) as total
      FROM inscriptions
      WHERE status = 'confirmed'
      AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
    `);

    const repeatRate = totalUsuarios[0].total > 0
      ? (repeat[0].repetidores / totalUsuarios[0].total)
      : 0;

    const [ocupacion] = await db.query(`
      SELECT AVG(jugadores) as ocupacion FROM (
        SELECT match_id, COUNT(*) as jugadores
        FROM inscriptions
        WHERE status = 'confirmed'
        AND YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)
        GROUP BY match_id
      ) t
    `);

    const [topJugadores] = await db.query(`
      SELECT u.id, u.name, COUNT(*) as partidos
      FROM inscriptions i
      JOIN users u ON u.id = i.user_id
      WHERE i.status = 'confirmed'
      AND YEARWEEK(i.created_at, 1) = YEARWEEK(CURDATE(), 1)
      GROUP BY u.id
      ORDER BY partidos DESC
      LIMIT 10
    `);

    res.json({
      usuarios_unicos: usuarios[0].total,
      frecuencia_media: frecuencia[0].frecuencia || 0,
      repeat_rate: repeatRate,
      ocupacion_media: ocupacion[0].ocupacion || 0,
      top_jugadores: topJugadores
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo KPIs' });
  }
});

module.exports = router;