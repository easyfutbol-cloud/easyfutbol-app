import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const N8N_TOKEN = process.env.N8N_INTERNAL_TOKEN || '';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, msg: 'Sin token' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ ok: false, msg: 'Token inválido' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ ok:false, msg:'No autenticado' });
  if (req.user.role !== 'admin') return res.status(403).json({ ok:false, msg:'Solo admin' });
  return next();
}

/** Para llamadas internas desde n8n: usa cabecera `x-internal-token: <N8N_INTERNAL_TOKEN>` */
export function requireInternalToken(req, res, next) {
  const tok = req.headers['x-internal-token'];
  if (!N8N_TOKEN || tok !== N8N_TOKEN) return res.status(401).json({ ok:false, msg:'Token interno inválido' });
  return next();
}
