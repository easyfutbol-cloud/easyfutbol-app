const healthUrl = process.env.EASYFUTBOL_HEALTH_URL || 'https://api.easyfutbol.es/api/health';
const alertUrl = process.env.MONITOR_ALERT_WEBHOOK_URL || '';
const expectedSchedulers = new Set([
  'match-reminders',
  'waitlist',
  'scheduled-match-publisher',
  'competitive-scoring',
]);

async function notify(message) {
  if (!alertUrl) return;
  await fetch(alertUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: message, content: message }),
    signal: AbortSignal.timeout(8000),
  });
}

try {
  const response = await fetch(healthUrl, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json().catch(() => ({}));
  const downSchedulers = Array.isArray(payload.schedulers)
    ? payload.schedulers.filter((scheduler) => scheduler.status === 'down')
    : [];
  const reportedSchedulers = new Set((payload.schedulers || []).map((scheduler) => scheduler.name));
  const missingSchedulers = [...expectedSchedulers].filter((name) => !reportedSchedulers.has(name));
  if (!response.ok || payload.ok !== true || payload.db !== 'up' || downSchedulers.length || missingSchedulers.length) {
    throw new Error(`Healthcheck incorrecto (${response.status}): ${JSON.stringify(payload).slice(0, 1200)}`);
  }
  console.log(JSON.stringify({ ok: true, url: healthUrl, dbLatencyMs: payload.dbLatencyMs, schedulers: payload.schedulers?.length || 0 }));
} catch (error) {
  const message = `[EasyFutbol] ALERTA producción: ${error.message}`;
  console.error(message);
  await notify(message).catch((notifyError) => console.error(`[EasyFutbol] Falló también la alerta: ${notifyError.message}`));
  process.exitCode = 1;
}
