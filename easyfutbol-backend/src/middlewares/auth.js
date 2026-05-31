import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const N8N_TOKEN = process.env.N8N_INTERNAL_TOKEN || '';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const rawToken =
    header.startsWith('Bearer ')
      ? header.slice(7)
      : header || req.headers['x-access-token'] || req.query?.token || '';

  const token = String(rawToken || '').trim().replace(/^"|"$/g, '');

  if (!token || token === 'null' || token === 'undefined') {
    console.log('AUTH ERROR 401 - Sin token', {
      path: req.originalUrl,
      method: req.method,
      authorizationHeader: header ? 'present' : 'missing',
      xAccessToken: req.headers['x-access-token'] ? 'present' : 'missing',
      queryToken: req.query?.token ? 'present' : 'missing',
    });
    return res.status(401).json({ ok: false, msg: 'Sin token' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    if (!req.user?.id && req.user?.userId) {
      req.user.id = req.user.userId;
    }

    if (!req.user?.id && req.user?.sub) {
      req.user.id = req.user.sub;
    }

    return next();
  } catch (error) {
    console.log('AUTH ERROR 401 - Token inválido', {
      path: req.originalUrl,
      method: req.method,
      message: error?.message,
      name: error?.name,
      tokenStart: token ? token.slice(0, 12) : null,
    });
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
