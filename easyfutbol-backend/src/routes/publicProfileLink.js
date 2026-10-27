// Página pública del perfil para compartir fuera de la app
// (…/jugador/<slug>). Con las etiquetas Open Graph, WhatsApp e Instagram
// enseñan la foto y el nombre en la vista previa; el botón abre la app o,
// si no la tiene, lleva a descargarla. Solo enseña lo que el jugador ya
// hace público dentro de la app, y pide a los buscadores que no la indexen.
// Montado en la raíz (sin /api), igual que /claim/<token>.
import { Router } from 'express';
import { pool } from '../config/db.js';
import { equippedCosmetics } from '../services/engagementRules.js';
import { PUBLIC_LINK_BASE, getProfileStreak, getSeasonStats, isValidSlug } from '../services/profileShareService.js';

const router = Router();

const STORE_URL = 'https://easyfutbol.es';
const STAT_LABELS = {
  matches_played: 'Partidos',
  goals: 'Goles',
  assists: 'Asistencias',
  saves: 'Paradas',
  mvp_count: 'MVP',
  win_rate: '% victorias',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const absoluteUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${PUBLIC_LINK_BASE}${raw.startsWith('/') ? '' : '/'}${raw}`;
};

const page = ({ title, head = '', body }) => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
${head}
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0a0a0a; color:#fff; font-family:-apple-system,Roboto,sans-serif; padding:24px; box-sizing:border-box; }
  .card { width:100%; max-width:380px; text-align:center; background:#15171c; border:1px solid #252830; border-radius:28px; padding:30px 22px; box-sizing:border-box; }
  .ring { width:132px; height:132px; margin:0 auto; border-radius:50%; padding:6px; box-sizing:border-box; background:#ff5a00; }
  .avatar { width:100%; height:100%; border-radius:50%; object-fit:cover; background:#222; display:flex; align-items:center; justify-content:center; font-size:48px; font-weight:900; }
  h1 { font-size:24px; margin:16px 0 0; }
  .title { display:inline-block; margin-top:8px; padding:4px 10px; border-radius:999px; color:#ff7a32; border:1px solid rgba(255,90,0,.45); background:rgba(255,90,0,.14); font-size:11px; font-weight:900; letter-spacing:1px; }
  .streak { color:#ff7a32; font-weight:800; font-size:14px; margin-top:12px; }
  .stats { display:flex; flex-wrap:wrap; justify-content:center; gap:10px; margin-top:20px; }
  .stat { min-width:86px; background:#1e2026; border-radius:16px; padding:12px 8px; }
  .stat b { display:block; font-size:22px; }
  .stat span { color:#8d9097; font-size:10px; font-weight:800; text-transform:uppercase; }
  p { color:#aaa; font-size:14px; line-height:1.5; }
  a.button { display:block; margin-top:20px; background:#ff5a00; color:#fff; text-decoration:none; font-weight:800; padding:14px 22px; border-radius:14px; }
  a.secondary { display:block; margin-top:12px; color:#ff7a32; text-decoration:none; font-weight:700; font-size:14px; }
</style>
</head>
<body>
${body}
</body>
</html>`;

router.get('/jugador/:slug', async (req, res) => {
  const slug = String(req.params.slug || '');
  const notFound = () => res.status(404).set('Content-Type', 'text/html; charset=utf-8').send(page({
    title: 'Perfil no encontrado · EasyFutbol',
    body: `<div class="card"><h1>Perfil no encontrado</h1><p>Este enlace ya no es válido.</p><a class="button" href="${STORE_URL}">Conoce EasyFutbol</a></div>`,
  }));
  if (!isValidSlug(slug)) return notFound();

  try {
    const [[user]] = await pool.query(
      `SELECT u.id, u.name, u.avatar_url, u.equipped_frame, u.equipped_title, p.visible_stats
       FROM users u LEFT JOIN user_social_privacy p ON p.user_id = u.id
       WHERE u.public_slug = ?`,
      [slug]
    );
    if (!user) return notFound();

    const visible = String(user.visible_stats || '').split(',').map((s) => s.trim()).filter((s) => STAT_LABELS[s]);
    const season = visible.length ? await getSeasonStats(pool, user.id) : {};
    const streak = await getProfileStreak(pool, user.id);
    const { frame, title } = equippedCosmetics(user.equipped_frame, user.equipped_title);
    const avatar = absoluteUrl(user.avatar_url);
    const name = user.name || 'Jugador EasyFutbol';
    const appUrl = `easyfutbol://jugador/${slug}`;

    const statsHtml = visible.map((key) => `<div class="stat"><b>${escapeHtml(season[key] ?? 0)}${key === 'win_rate' ? '%' : ''}</b><span>${escapeHtml(STAT_LABELS[key])}</span></div>`).join('');
    const summary = visible.length
      ? visible.slice(0, 3).map((key) => `${season[key] ?? 0}${key === 'win_rate' ? '%' : ''} ${STAT_LABELS[key].toLowerCase()}`).join(' · ')
      : 'Juega al fútbol cerca de ti con EasyFutbol';
    const ringStyle = frame ? ` style="background:linear-gradient(135deg,${frame.colors.map(escapeHtml).join(',')})"` : '';

    const head = [
      `<meta property="og:type" content="profile">`,
      `<meta property="og:title" content="${escapeHtml(`${name} · EasyFutbol`)}">`,
      `<meta property="og:description" content="${escapeHtml(summary)}">`,
      `<meta property="og:url" content="${escapeHtml(`${PUBLIC_LINK_BASE}/jugador/${slug}`)}">`,
      avatar ? `<meta property="og:image" content="${escapeHtml(avatar)}">` : '',
      `<meta name="twitter:card" content="summary">`,
    ].filter(Boolean).join('\n');

    res.set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'public, max-age=300').send(page({
      title: `${name} · EasyFutbol`,
      head,
      body: `<div class="card">
  <div class="ring"${ringStyle}>${avatar ? `<img class="avatar" src="${escapeHtml(avatar)}" alt="">` : `<div class="avatar">${escapeHtml(name.charAt(0).toUpperCase())}</div>`}</div>
  <h1>${escapeHtml(name)}</h1>
  ${title ? `<div class="title">${escapeHtml(title.label.toUpperCase())}</div>` : ''}
  ${streak.current >= 2 ? `<div class="streak">🔥 ${escapeHtml(streak.current)} semanas seguidas jugando</div>` : ''}
  ${statsHtml ? `<div class="stats">${statsHtml}</div>` : '<p>Jugador de EasyFutbol</p>'}
  <a class="button" href="${escapeHtml(appUrl)}">Ver perfil en la app</a>
  <a class="secondary" href="${STORE_URL}">¿No tienes la app? Descárgala</a>
</div>`,
    }));
  } catch (error) {
    console.error('[GET /jugador/:slug]', error);
    res.status(500).send('No se pudo cargar el perfil');
  }
});

export default router;
