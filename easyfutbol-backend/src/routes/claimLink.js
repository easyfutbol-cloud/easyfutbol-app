// Página puente para los enlaces de "voy yo / enviar enlace" de las entradas.
// WhatsApp (y la mayoría de apps de mensajería) solo convierte en pulsable un
// enlace http(s), nunca un esquema personalizado como "easyfutbol://", así que
// el enlace que se comparte apunta aquí y esta página abre la app.
// Montado en la raíz (sin /api) para que la URL sea corta y quede bien en el mensaje.
import { Router } from 'express';

const router = Router();

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

router.get('/claim/:token', (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!/^[a-f0-9]+$/i.test(token)) return res.status(400).send('Enlace inválido');

  const appUrl = `easyfutbol://claim/${encodeURIComponent(token)}`;
  const storeUrl = 'https://easyfutbol.es';

  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Únete al partido · EasyFutbol</title>
<meta http-equiv="refresh" content="0; url=${escapeHtml(appUrl)}">
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0a0a0a; color:#fff; font-family:-apple-system,Roboto,sans-serif; padding:24px; box-sizing:border-box; }
  .card { max-width:360px; text-align:center; }
  h1 { font-size:20px; margin-bottom:10px; }
  p { color:#aaa; font-size:14px; line-height:1.5; }
  a.button { display:inline-block; margin-top:18px; background:#ff5a00; color:#fff; text-decoration:none; font-weight:700; padding:13px 22px; border-radius:12px; }
</style>
</head>
<body>
  <div class="card">
    <h1>⚽ Te han invitado a jugar</h1>
    <p>Abriendo la app EasyFutbol… Si no se abre sola, necesitas tener la app instalada y la sesión iniciada.</p>
    <a class="button" href="${escapeHtml(appUrl)}">Abrir en la app</a>
  </div>
  <script>window.location.href = ${JSON.stringify(appUrl)};</script>
</body>
</html>`);
});

export default router;
