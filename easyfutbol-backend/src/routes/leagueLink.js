// Página puente del enlace de unión a una liga pública (/liga/<código>).
// WhatsApp solo convierte en pulsable un enlace http(s), así que se comparte
// este y el botón abre la app. No enseña jugadores, solo los datos de la liga.
// Montado en la raíz (sin /api), igual que /claim/<token> y /jugador/<slug>.
import { Router } from 'express';
import { pool } from '../config/db.js';
import { isValidJoinCode } from '../services/friendLeagueRules.js';
import { PUBLIC_LINK_BASE } from '../services/profileShareService.js';

const router = Router();

const STORE_URL = 'https://easyfutbol.es';
const STATUS_LABELS = { draft: 'Empieza pronto', active: 'En juego', finished: 'Terminada' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const page = ({ title, head = '', body }) => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
${head}
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0a0a0a; color:#fff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding:20px; box-sizing:border-box; }
  .card { width:100%; max-width:380px; text-align:center; background:#15171c; border:1px solid #252830; border-radius:28px; padding:30px 22px; box-sizing:border-box; }
  .trophy { font-size:52px; }
  h1 { font-size:24px; margin:12px 0 0; }
  .status { display:inline-block; margin-top:10px; padding:4px 10px; border-radius:999px; color:#ff7a32; border:1px solid rgba(255,90,0,.45); font-size:12px; font-weight:800; }
  p { color:#aaa; font-size:14px; line-height:1.5; }
  a.button { display:block; margin-top:20px; background:#ff5a00; color:#fff; text-decoration:none; font-weight:800; padding:14px 22px; border-radius:14px; }
  a.secondary { display:block; margin-top:12px; color:#ff7a32; text-decoration:none; font-weight:700; font-size:14px; }
</style>
</head>
<body>
${body}
</body>
</html>`;

router.get('/liga/:code', async (req, res) => {
  const code = String(req.params.code || '');
  const notFound = () => res.status(404).set('Content-Type', 'text/html; charset=utf-8').send(page({
    title: 'Liga no encontrada · EasyFutbol',
    body: `<div class="card"><h1>Liga no encontrada</h1><p>Este enlace ya no es válido.</p><a class="button" href="${STORE_URL}">Conoce EasyFutbol</a></div>`,
  }));
  if (!isValidJoinCode(code)) return notFound();

  try {
    const [[league]] = await pool.query(
      `SELECT l.name, l.status, l.matches_goal,
              (SELECT COUNT(*) FROM friend_league_members m WHERE m.league_id=l.id AND m.status='accepted') AS players
       FROM friend_leagues l WHERE l.join_code=? AND l.is_public=1`,
      [code]
    );
    if (!league) return notFound();

    const players = Number(league.players);
    const summary = `${players} ${players === 1 ? 'jugador' : 'jugadores'} · ${league.matches_goal} partidos`;
    const appUrl = `easyfutbol://liga/${encodeURIComponent(code)}`;
    const head = [
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${escapeHtml(`${league.name} · Liga de EasyFutbol`)}">`,
      `<meta property="og:description" content="${escapeHtml(`Únete a la liga. ${summary}`)}">`,
      `<meta property="og:url" content="${escapeHtml(`${PUBLIC_LINK_BASE}/liga/${code}`)}">`,
      `<meta name="twitter:card" content="summary">`,
    ].join('\n');

    res.set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'public, max-age=60').send(page({
      title: `${league.name} · EasyFutbol`,
      head,
      body: `<div class="card">
  <div class="trophy">🏆</div>
  <h1>${escapeHtml(league.name)}</h1>
  <div class="status">${escapeHtml(STATUS_LABELS[league.status] || '')}</div>
  <p>${escapeHtml(summary)}</p>
  <a class="button" href="${escapeHtml(appUrl)}">${league.status === 'finished' ? 'Ver la liga en la app' : 'Unirme en la app'}</a>
  <a class="secondary" href="${STORE_URL}">¿No tienes la app? Descárgala</a>
</div>`,
    }));
  } catch (error) {
    console.error('[GET /liga/:code]', error);
    res.status(500).send('No se pudo cargar la liga');
  }
});

export default router;
