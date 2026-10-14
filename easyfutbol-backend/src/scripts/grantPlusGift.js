// Regala EasyFutbol Plus a una lista de usuarios: empieza hoy y termina el mismo día
// del mes siguiente a las 23:59:59 (hora de Madrid). No pasa por Stripe ni da EasyPass.
// Es idempotente por referencia: repetirlo con el mismo --ref no duplica nada.
//
//   npm run plus:gift -- --users=39,904,37 --ref=gift:2026-10-13 --dry-run
//   npm run plus:gift -- --users=39,904,37 --ref=gift:2026-10-13
import 'dotenv/config';
import { pool } from '../config/db.js';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const dryRun = process.argv.includes('--dry-run');
const reference = arg('ref');
const userIds = [...new Set(String(arg('users') || '').split(',').map((v) => Number(v.trim())).filter((v) => Number.isInteger(v) && v > 0))];

const TZ = 'Europe/Madrid';

// Convierte una fecha/hora "de pared" en Madrid a su instante UTC.
function madridWallTimeToUtc(year, month, day, h, m, s) {
  const guess = new Date(Date.UTC(year, month - 1, day, h, m, s));
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(guess).map((p) => [p.type, p.value])
  );
  const asMadrid = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess.getTime() - (asMadrid - guess.getTime()));
}

function giftPeriod(now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now).split('-').map(Number);
  const start = madridWallTimeToUtc(y, m, d, 0, 0, 0);
  const endMonth = m === 12 ? 1 : m + 1;
  const endYear = m === 12 ? y + 1 : y;
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  const end = madridWallTimeToUtc(endYear, endMonth, Math.min(d, lastDay), 23, 59, 59);
  return { start, end };
}

if (!userIds.length || !reference) {
  console.error('Uso: npm run plus:gift -- --users=1,2,3 --ref=gift:AAAA-MM-DD [--dry-run]');
  process.exit(1);
}

const conn = await pool.getConnection();
try {
  const { start, end } = giftPeriod();
  const fmt = (d) => d.toLocaleString('es-ES', { timeZone: TZ });
  console.log(`Periodo: ${fmt(start)} → ${fmt(end)} (Madrid) · ref ${reference}${dryRun ? ' · DRY RUN' : ''}`);

  const [[plan]] = await conn.query("SELECT id FROM subscription_plans WHERE code='plus' LIMIT 1");
  if (!plan) throw new Error('No existe el plan plus en subscription_plans');

  const [users] = await conn.query('SELECT id, name FROM users WHERE id IN (?)', [userIds]);
  const found = new Map(users.map((u) => [Number(u.id), u]));

  await conn.beginTransaction();
  const summary = { granted: [], skipped: [] };
  for (const userId of userIds) {
    const user = found.get(userId);
    if (!user) { summary.skipped.push({ userId, reason: 'no existe' }); continue; }

    // Quien ya tiene Plus/Pro activo (de pago o regalado) se queda como está.
    const [[active]] = await conn.query(
      `SELECT stripe_subscription_id FROM user_subscriptions
       WHERE user_id=? AND status IN ('active','trialing') AND (current_period_end IS NULL OR current_period_end > NOW())
       UNION ALL
       SELECT stripe_subscription_id FROM user_plus_subscriptions
       WHERE user_id=? AND status IN ('active','trialing') AND (current_period_end IS NULL OR current_period_end > NOW())
       LIMIT 1`,
      [userId, userId]
    );
    if (active) {
      summary.skipped.push({ userId, name: user.name, reason: active.stripe_subscription_id ? 'ya paga Plus' : 'ya tiene Plus regalado' });
      continue;
    }

    if (!dryRun) {
      await conn.query(
        `INSERT INTO user_subscriptions
           (user_id, plan_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end, cancel_at_period_end, started_at)
         VALUES (?, ?, NULL, NULL, 'active', ?, ?, 1, ?)`,
        [userId, plan.id, start, end, start]
      );
      // user_plus_subscriptions tiene una fila por usuario: se conserva su stripe_customer_id si lo tenía.
      await conn.query(
        `INSERT INTO user_plus_subscriptions
           (user_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end, cancel_at_period_end)
         VALUES (?, NULL, NULL, 'active', ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           stripe_subscription_id = NULL, status = 'active',
           current_period_start = VALUES(current_period_start),
           current_period_end = VALUES(current_period_end),
           cancel_at_period_end = 1`,
        [userId, start, end]
      );
      await conn.query(
        `INSERT INTO subscription_entitlements (user_id, entitlement_code, source_type, source_reference, starts_at, ends_at)
         VALUES (?, 'plus', 'reward', ?, ?, ?)
         ON DUPLICATE KEY UPDATE source_reference=VALUES(source_reference), starts_at=VALUES(starts_at), ends_at=VALUES(ends_at), revoked_at=NULL`,
        [userId, reference, start, end]
      );
    }
    summary.granted.push({ userId, name: user.name });
  }

  if (dryRun) await conn.rollback();
  else await conn.commit();

  console.log(`${dryRun ? 'Se regalaría' : 'Regalado'} Plus a ${summary.granted.length}:`);
  for (const u of summary.granted) console.log(`  ✓ ${u.userId} ${u.name}`);
  if (summary.skipped.length) {
    console.log(`Omitidos ${summary.skipped.length}:`);
    for (const u of summary.skipped) console.log(`  – ${u.userId} ${u.name || ''} (${u.reason})`);
  }
} catch (error) {
  await conn.rollback().catch(() => {});
  console.error('❌', error.message);
  process.exitCode = 1;
} finally {
  conn.release();
  await pool.end();
}
