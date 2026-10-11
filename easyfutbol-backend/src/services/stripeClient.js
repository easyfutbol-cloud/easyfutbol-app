// Cliente de Stripe compartido para tareas que no son el webhook de pagos
// (p. ej. leer importes reales para los KPIs). Devuelve null si no hay clave.
import Stripe from 'stripe';

let client;

export function getStripe() {
  if (client === undefined) {
    client = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  }
  return client;
}
