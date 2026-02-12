import { Router } from 'express';
import { pool } from '../config/db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_EXPIRES = '7d';

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  'TU_CLIENT_ID_DE_GOOGLE.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const EMAIL_OTP_TTL_MIN = Number(process.env.EMAIL_OTP_TTL_MIN || 10);
const EMAIL_OTP_SALT = process.env.EMAIL_OTP_SALT || 'dev_email_otp_salt_change_me';

// === Email (Brevo SMTP) ===
const MAIL_FROM = process.env.MAIL_FROM || 'EasyFutbol <no-reply@easyfutbol.es>';
const BREVO_SMTP_HOST = process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
const BREVO_SMTP_PORT = Number(process.env.BREVO_SMTP_PORT || 587);
const BREVO_SMTP_USER = process.env.BREVO_SMTP_USER || '';
const BREVO_SMTP_PASS = process.env.BREVO_SMTP_PASS || '';

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || 'https://easyfutbol.es';

const transporter = (BREVO_SMTP_USER && BREVO_SMTP_PASS)
  ? nodemailer.createTransport({
      host: BREVO_SMTP_HOST,
      port: BREVO_SMTP_PORT,
      secure: false,
      auth: {
        user: BREVO_SMTP_USER,
        pass: BREVO_SMTP_PASS,
      },
    })
  : null;

async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    // Fallback seguro para entorno sin SMTP configurado
    console.log('[MAIL DEV] to=', to, 'subject=', subject);
    if (text) console.log('[MAIL DEV] text=', text);
    return;
  }

  await transporter.sendMail({
    from: MAIL_FROM,
    to,
    subject,
    text,
    html,
  });
}

// === Password reset tokens (hash en BD, token raw por email) ===
const PWD_RESET_TTL_MIN = Number(process.env.PWD_RESET_TTL_MIN || 60);

function generateRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function isStrongPassword(pwd) {
  // Mínimo 6, 1 mayúscula y 1 símbolo
  return /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{6,}$/.test(String(pwd || ''));
}

function normalizeEmail(v) {
  return String(v || '').trim().toLowerCase();
}

function generateEmailOtp() {
  // 6 dígitos
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(code) {
  return crypto
    .createHash('sha256')
    .update(`${code}:${EMAIL_OTP_SALT}`)
    .digest('hex');
}

function addMinutes(date, minutes) {
  const d = new Date(date.getTime());
  d.setMinutes(d.getMinutes() + minutes);
  return d;
}

async function sendEmailOtp({ email, code }) {
  const subject = 'Tu código de verificación de EasyFutbol';
  const text = `Tu código de verificación es: ${code}. Caduca en ${EMAIL_OTP_TTL_MIN} minutos.`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.4">
      <h2 style="margin:0 0 12px">Verifica tu cuenta</h2>
      <p style="margin:0 0 8px">Tu código de verificación es:</p>
      <p style="font-size:28px;letter-spacing:4px;margin:0 0 12px"><b>${code}</b></p>
      <p style="margin:0;color:#666">Caduca en ${EMAIL_OTP_TTL_MIN} minutos.</p>
    </div>
  `;

  await sendMail({ to: email, subject, text, html });

  // Log auxiliar en dev (sin filtrar si SMTP está activo, por si se necesita debug)
  console.log(`[EMAIL OTP] Código para ${email}: ${code} (caduca en ${EMAIL_OTP_TTL_MIN} min)`);
}

function sign(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

router.post('/auth/register', async (req, res) => {
  try {
    const body = req.body || {};
    const name = body.username || body.user || body.name || body.nombre;
    const emailRaw = body.email || body.correo;
    const phone = body.phone || body.telefono || body.tel;
    const password = body.password;

    const email = normalizeEmail(emailRaw);

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ ok: false, msg: 'Faltan datos' });
    }

    // validación email básica
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ ok: false, msg: 'Email no válido' });
    }

    // validación teléfono básica (9-15 dígitos)
    const phoneDigits = String(phone).replace(/\D/g, '');
    if (phoneDigits.length < 9 || phoneDigits.length > 15) {
      return res.status(400).json({ ok: false, msg: 'Teléfono no válido' });
    }

    const [rows] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
    if (rows.length) {
      return res.status(409).json({ ok: false, msg: 'Email ya registrado' });
    }

    const hash = await bcrypt.hash(password, 10);

    // OTP
    const code = generateEmailOtp();
    const codeHash = hashOtp(code);
    const expires = addMinutes(new Date(), EMAIL_OTP_TTL_MIN);

    // Insert: intentamos guardar phone si existe la columna.
    let result;
    try {
      const [r] = await pool.query(
        'INSERT INTO users (name, email, password_hash, role, phone, email_verified, email_verify_code_hash, email_verify_expires_at) VALUES (?,?,?,?,?,?,?,?)',
        [name, email, hash, 'player', phoneDigits, 0, codeHash, expires]
      );
      result = r;
    } catch (e) {
      // Si no existe columna phone, reintentamos sin phone.
      if (e && e.code === 'ER_BAD_FIELD_ERROR') {
        const [r] = await pool.query(
          'INSERT INTO users (name, email, password_hash, role, email_verified, email_verify_code_hash, email_verify_expires_at) VALUES (?,?,?,?,?,?,?)',
          [name, email, hash, 'player', 0, codeHash, expires]
        );
        result = r;
      } else {
        throw e;
      }
    }

    // enviamos OTP
    await sendEmailOtp({ email, code });

    // ✅ No damos token hasta verificar email
    return res.status(201).json({ ok: true, needsEmailVerification: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Error servidor' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const body = req.body || {};
    const identifierRaw =
      body.identifier || body.login || body.user || body.username || body.email || body.correo;
    const password = body.password || body.pass || body.contrasena || body['contraseña'];

    const identifier = String(identifierRaw || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({ ok: false, msg: 'Faltan credenciales' });
    }

    const email = normalizeEmail(identifier);

    const [rows] = await pool.query(
      'SELECT id, name, email, role, password_hash, email_verified FROM users WHERE email=? OR name=? LIMIT 1',
      [email, identifier]
    );
    if (!rows.length) {
      return res.status(401).json({ ok: false, msg: 'Credenciales inválidas' });
    }

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash || '');
    if (!ok) {
      return res.status(401).json({ ok: false, msg: 'Credenciales inválidas' });
    }

    if (!u.email_verified) {
      return res.status(403).json({
        ok: false,
        code: 'EMAIL_NOT_VERIFIED',
        msg: 'Verifica tu correo',
        email: u.email,
      });
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
          'INSERT INTO users (name, email, password_hash, role, email_verified) VALUES (?,?,?,?,?)',
          [name, email, '', 'player', 1]
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

router.post('/auth/email/resend', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || req.body?.correo);
    if (!email) return res.status(400).json({ ok: false, msg: 'Falta email' });

    const [rows] = await pool.query(
      'SELECT id, email_verified FROM users WHERE email=? LIMIT 1',
      [email]
    );
    if (!rows.length) return res.status(404).json({ ok: false, msg: 'Usuario no encontrado' });

    if (rows[0].email_verified) {
      return res.json({ ok: true, msg: 'Email ya verificado' });
    }

    const code = generateEmailOtp();
    const codeHash = hashOtp(code);
    const expires = addMinutes(new Date(), EMAIL_OTP_TTL_MIN);

    await pool.query(
      'UPDATE users SET email_verify_code_hash=?, email_verify_expires_at=? WHERE email=?',
      [codeHash, expires, email]
    );

    await sendEmailOtp({ email, code });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Error servidor' });
  }
});

router.post('/auth/email/verify', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || req.body?.correo);
    const code = String(req.body?.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({ ok: false, msg: 'Faltan datos' });
    }

    const [rows] = await pool.query(
      'SELECT id, email_verify_code_hash, email_verify_expires_at, email_verified FROM users WHERE email=? LIMIT 1',
      [email]
    );
    if (!rows.length) return res.status(404).json({ ok: false, msg: 'Usuario no encontrado' });

    const u = rows[0];
    if (u.email_verified) return res.json({ ok: true, msg: 'Email ya verificado' });

    const exp = u.email_verify_expires_at ? new Date(u.email_verify_expires_at) : null;
    if (!exp || Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) {
      return res.status(400).json({ ok: false, msg: 'Código caducado' });
    }

    const incomingHash = hashOtp(code);
    const storedHash = String(u.email_verify_code_hash || '');

    if (!storedHash || storedHash.length !== incomingHash.length) {
      return res.status(400).json({ ok: false, msg: 'Código inválido' });
    }

    const same = crypto.timingSafeEqual(
      Buffer.from(incomingHash, 'utf8'),
      Buffer.from(storedHash, 'utf8')
    );

    if (!same) {
      return res.status(400).json({ ok: false, msg: 'Código inválido' });
    }

    await pool.query(
      'UPDATE users SET email_verified=1, email_verify_code_hash=NULL, email_verify_expires_at=NULL WHERE id=?',
      [u.id]
    );

    // Devolvemos token para que la app pueda iniciar sesión directamente
    const [uRows] = await pool.query(
      'SELECT id, name, email, role FROM users WHERE id=? LIMIT 1',
      [u.id]
    );
    const user = uRows?.[0]
      ? { id: uRows[0].id, name: uRows[0].name, email: uRows[0].email, role: uRows[0].role }
      : { id: u.id, name: '', email, role: 'player' };

    const token = sign(user);

    return res.json({ ok: true, user, token });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Error servidor' });
  }
});

// === Password reset ===
// POST /auth/password/forgot  { email }
router.post('/auth/password/forgot', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || req.body?.correo);
    if (!email) return res.status(400).json({ ok: false, msg: 'Falta email' });

    const [rows] = await pool.query('SELECT id FROM users WHERE email=? LIMIT 1', [email]);

    // Respuesta genérica (evita enumeración)
    if (!rows.length) {
      return res.json({ ok: true, msg: 'Si el email existe, enviaremos instrucciones.' });
    }

    const userId = rows[0].id;

    const raw = generateRawToken();
    const tokenHash = hashToken(raw);
    const expires = addMinutes(new Date(), PWD_RESET_TTL_MIN);

    await pool.query(
      'UPDATE users SET password_reset_token_hash=?, password_reset_expires_at=? WHERE id=?',
      [tokenHash, expires, userId]
    );

    const resetUrl = `${APP_PUBLIC_URL}/reset-password?token=${raw}`;

    const subject = 'Restablece tu contraseña (EasyFutbol)';
    const text = `Para restablecer tu contraseña, abre este enlace: ${resetUrl}. Caduca en ${PWD_RESET_TTL_MIN} minutos.`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.4">
        <h2 style="margin:0 0 12px">Restablecer contraseña</h2>
        <p style="margin:0 0 12px">Pulsa aquí para crear una nueva contraseña (caduca en ${PWD_RESET_TTL_MIN} minutos):</p>
        <p style="margin:0 0 16px"><a href="${resetUrl}">Restablecer contraseña</a></p>
        <p style="margin:0;color:#666">Si no lo solicitaste tú, ignora este correo.</p>
      </div>
    `;

    await sendMail({ to: email, subject, text, html });

    return res.json({ ok: true, msg: 'Si el email existe, enviaremos instrucciones.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Error servidor' });
  }
});

// POST /auth/password/reset  { token, newPassword }
router.post('/auth/password/reset', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || req.body?.password || '').trim();

    if (!token || !newPassword) {
      return res.status(400).json({ ok: false, msg: 'Faltan datos' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        ok: false,
        msg: 'Contraseña débil: mínimo 6 caracteres, 1 mayúscula y 1 símbolo',
      });
    }

    const tokenHash = hashToken(token);

    const [rows] = await pool.query(
      'SELECT id, password_reset_expires_at FROM users WHERE password_reset_token_hash=? LIMIT 1',
      [tokenHash]
    );

    if (!rows.length) return res.status(400).json({ ok: false, msg: 'Token inválido' });

    const u = rows[0];
    const exp = u.password_reset_expires_at ? new Date(u.password_reset_expires_at) : null;
    if (!exp || Number.isNaN(exp.getTime()) || exp.getTime() < Date.now()) {
      return res.status(400).json({ ok: false, msg: 'Token caducado' });
    }

    const hash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      'UPDATE users SET password_hash=?, password_reset_token_hash=NULL, password_reset_expires_at=NULL WHERE id=?',
      [hash, u.id]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, msg: 'Error servidor' });
  }
});

export default router;