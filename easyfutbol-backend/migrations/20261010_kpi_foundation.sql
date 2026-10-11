-- Base para los KPIs de negocio (retención, MAU, frecuencia, CAC y precio
-- efectivo por EasyPass). Migración idempotente.
--
-- 1) revenue_events: libro de ingresos reales cobrados por Stripe. El importe
--    que realmente paga el jugador (con descuento Plus o código promocional)
--    solo existía en Stripe: easypass_transactions guarda cuántos EasyPass
--    entran, no cuánto dinero se cobró. Se rellena con una sincronización
--    (histórico incluido) que lee Stripe; no toca el webhook de pagos.
-- 2) marketing_spend: gasto de marketing que se introduce a mano desde la app
--    para poder calcular el CAC.

CREATE TABLE IF NOT EXISTS revenue_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  stripe_ref VARCHAR(190) NOT NULL,
  kind ENUM('easypass_pack','subscription') NOT NULL,
  -- paid: cuenta como ingreso · test: pago en modo prueba · unavailable: Stripe ya no lo encuentra
  status ENUM('paid','test','unavailable') NOT NULL DEFAULT 'paid',
  user_id INT NULL,
  location_id INT NULL,
  pack_id INT NULL,
  credits INT NULL,
  plan_code VARCHAR(32) NULL,
  list_cents INT NULL,
  plus_discount_cents INT NOT NULL DEFAULT 0,
  promo_discount_cents INT NOT NULL DEFAULT 0,
  paid_cents INT NOT NULL DEFAULT 0,
  refunded_cents INT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  paid_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_revenue_events_ref (stripe_ref),
  KEY idx_revenue_events_paid (status, paid_at),
  KEY idx_revenue_events_user (user_id, paid_at)
);

CREATE TABLE IF NOT EXISTS marketing_spend (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  month DATE NOT NULL,
  channel VARCHAR(60) NOT NULL DEFAULT 'general',
  -- 0 = gasto general de todas las sedes
  location_id INT NOT NULL DEFAULT 0,
  amount_cents INT UNSIGNED NOT NULL,
  notes VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_marketing_spend (month, channel, location_id)
);
