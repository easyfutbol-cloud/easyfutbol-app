// Rellena revenue_events con el dinero real que Stripe cobró en cada compra,
// histórico incluido. Es idempotente: se puede repetir sin duplicar nada.
//
//   npm run kpis:sync-revenue                  # sincroniza todo lo pendiente
//   npm run kpis:sync-revenue -- --dry-run     # solo cuenta lo pendiente, sin llamar a Stripe
//   npm run kpis:sync-revenue -- --no-subscriptions
import 'dotenv/config';
import { pool } from '../config/db.js';
import { countUnsyncedPurchases, syncRevenue } from '../services/revenueSyncService.js';
import { getStripe } from '../services/stripeClient.js';

const dryRun = process.argv.includes('--dry-run');
const includeSubscriptions = !process.argv.includes('--no-subscriptions');
const BATCH = 200;
const MAX_ROUNDS = 100;

try {
  const pending = await countUnsyncedPurchases(pool);
  console.log(`Compras de packs pendientes de sincronizar: ${pending}`);
  if (dryRun) process.exit(0);

  const stripe = getStripe();
  if (!stripe) throw new Error('Falta STRIPE_SECRET_KEY en el .env');

  let round = 0;
  let subscriptionsDone = false;
  while (round < MAX_ROUNDS) {
    round += 1;
    const result = await syncRevenue({ db: pool, stripe, limit: BATCH, includeSubscriptions: includeSubscriptions && !subscriptionsDone });
    subscriptionsDone = true;
    console.log(`Pasada ${round}:`, JSON.stringify(result));
    if (result.remaining === 0) break;
    // Si no se avanza (todo fallando), se para en vez de repetir sin fin.
    if (result.packs.inserted + result.packs.unavailable === 0) {
      console.warn('No se pudo avanzar con el resto; revisa los errores de arriba y vuelve a ejecutarlo.');
      break;
    }
  }
  console.log(`Pendientes al terminar: ${await countUnsyncedPurchases(pool)}`);
} catch (error) {
  console.error('Sincronización detenida:', error?.message || error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
