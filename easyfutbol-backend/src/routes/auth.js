import { Router } from 'express';
import { pool } from '../config/db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_EXPIRES = '7d';

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  'TU_CLIENT_ID_DE_GOOGLE.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

function sign(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

router.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, msg: 'Faltan datos' });
    }

    const [rows] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
    if (rows.length) {
      return res.status(409).json({ ok: false, msg: 'Email ya registrado' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
      [name, email, hash, 'player']
    );

    const user = { id: result.insertId, name, email, role: 'player' };
    const token = sign(user);
    return res.status(201).json({ ok: true, user, token });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Error servidor' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, msg: 'Faltan credenciales' });
    }

    const [rows] = await pool.query(
      'SELECT id, name, email, role, password_hash FROM users WHERE email=? LIMIT 1',
      [email]
    );
    if (!rows.length) {
      return res.status(401).json({ ok: false, msg: 'Credenciales inválidas' });
    }

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash || '');
    if (!ok) {
      return res.status(401).json({ ok: false, msg: 'Credenciales inválidas' });
    }

    const user = { id: u.id, name: u.name, email: u.email, role: u.role };
    const token = sign(user);
    return res.json({ ok: true, user, token });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Error servidor' });
  }
});

router.post('/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ ok: false, msg: 'Falta idToken de Google' });
    }

    // Verificar idToken con Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const email = payload?.email;
    const name = payload?.name || email;
    const picture = payload?.picture || null;

    if (!email) {
      return res.status(400).json({ ok: false, msg: 'Google no devolvió email' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // ¿Ya existe el usuario con ese email?
      const [rows] = await conn.query(
        'SELECT id, name, email, role FROM users WHERE email=? LIMIT 1',
        [email]
      );

      let user;

      if (rows.length) {
        const u = rows[0];
        user = {
          id: u.id,
          name: u.name || name,
          email: u.email,
          role: u.role,
        };

        // Opcional: actualizar nombre si está vacío o es igual al email
        if (!u.name || u.name === u.email) {
          await conn.query('UPDATE users SET name=? WHERE id=?', [name, u.id]);
        }

        // Si algún día tienes columna avatar_url podrías hacer:
        // if (picture) await conn.query('UPDATE users SET avatar_url=? WHERE id=?', [picture, u.id]);
      } else {
        // Crear usuario nuevo "player"
        const [result] = await conn.query(
          'INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)',
          [name, email, '', 'player']
        );

        user = {
          id: result.insertId,
          name,
          email,
          role: 'player',
        };
      }

      await conn.commit();

      const token = sign(user);
      return res.json({ ok: true, user, token });
    } catch (e) {
      await conn.rollback();
      console.error('Error DB login Google:', e);
      return res
        .status(500)
        .json({ ok: false, msg: 'Error servidor (DB Google)' });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('Error login Google:', e);
    return res
      .status(500)
      .json({ ok: false, msg: 'Error login con Google' });
  }
});

export default router;
