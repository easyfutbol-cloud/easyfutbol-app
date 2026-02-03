import { Router } from 'express';
import { pool } from '../config/db.js';
import { requireAuth } from '../middlewares/auth.js';
import bcrypt from 'bcrypt';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { Expo } from 'expo-server-sdk';

const router = Router();
const expo = new Expo();

// carpeta de uploads
const uploadDir = path.join(process.cwd(), 'uploads/avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `user-${req.user.id}${ext}`);
  }
});
const upload = multer({ storage });

/**
 * Perfil + stats
 */
router.get('/me/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [[user]] = await pool.query(
      'SELECT id, name, email, role, created_at, avatar_url, push_token FROM users WHERE id=? LIMIT 1',
      [userId]
    );
    if (!user) return res.status(404).json({ ok:false, msg:'Usuario no encontrado' });

    const [[stats]] = await pool.query(
      `SELECT 
         COUNT(*) AS matches_played,
         SUM(goals) AS goals,
         SUM(assists) AS assists,
         SUM(goals + assists) AS total
       FROM inscriptions
       WHERE user_id=? AND status='confirmed'`,
      [userId]
    );

    res.json({
      ok: true,
      data: {
        user,
        stats: {
          matches_played: stats.matches_played || 0,
          goals: stats.goals || 0,
          assists: stats.assists || 0,
          total: stats.total || 0
        }
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error obteniendo perfil' });
  }
});

/**
 * Actualizar perfil
 */
router.patch('/me/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, password } = req.body || {};

    if (!name && !email && !password) {
      return res.status(400).json({ ok:false, msg:'Nada que actualizar' });
    }

    const fields = [];
    const values = [];

    if (name) {
      fields.push('name=?');
      values.push(name);
    }
    if (email) {
      fields.push('email=?');
      values.push(email);
    }
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      fields.push('password=?');
      values.push(hashed);
    }
    values.push(userId);

    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id=?`, values);

    res.json({ ok:true, msg:'Perfil actualizado' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error actualizando perfil' });
  }
});

/**
 * Subir foto de perfil
 */
router.post('/me/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    const fileUrl = `/uploads/avatars/${req.file.filename}`;
    await pool.query('UPDATE users SET avatar_url=? WHERE id=?', [fileUrl, req.user.id]);
    res.json({ ok:true, avatar_url: fileUrl });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error subiendo avatar' });
  }
});

/**
 * Guardar token push
 */
router.post('/me/push-token', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!Expo.isExpoPushToken(token)) {
      return res.status(400).json({ ok:false, msg:'Token inválido' });
    }
    await pool.query('UPDATE users SET push_token=? WHERE id=?', [token, req.user.id]);
    res.json({ ok:true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok:false, msg:'Error guardando push token' });
  }
});

export default router;
