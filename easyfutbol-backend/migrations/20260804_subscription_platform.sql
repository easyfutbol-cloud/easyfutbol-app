CREATE TABLE IF NOT EXISTS subscription_plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(100) NOT NULL,
  price_cents INT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  billing_interval ENUM('month','year') NOT NULL DEFAULT 'month',
  stripe_price_id VARCHAR(255) NULL,
  benefits JSON NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subscription_plan_code (code),
  UNIQUE KEY uq_subscription_plan_stripe_price (stripe_price_id)
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NOT NULL,
  stripe_customer_id VARCHAR(255) NULL,
  stripe_subscription_id VARCHAR(255) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'inactive',
  current_period_start DATETIME NULL,
  current_period_end DATETIME NULL,
  cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
  started_at DATETIME NULL,
  ended_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_subscription_stripe (stripe_subscription_id),
  KEY idx_user_subscription_active (user_id, status, current_period_end),
  KEY idx_user_subscription_plan (plan_id, status)
);

CREATE TABLE IF NOT EXISTS subscription_entitlements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  entitlement_code VARCHAR(64) NOT NULL,
  source_type ENUM('subscription','plus_trial','admin','reward') NOT NULL,
  source_reference VARCHAR(255) NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NULL,
  revoked_at DATETIME NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_entitlement_once (user_id, entitlement_code, source_type),
  KEY idx_entitlement_active (user_id, entitlement_code, starts_at, ends_at, revoked_at)
);

CREATE TABLE IF NOT EXISTS subscription_monthly_grants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  subscription_id BIGINT UNSIGNED NULL,
  plan_code VARCHAR(32) NOT NULL,
  stripe_reference VARCHAR(255) NOT NULL,
  easypass_amount INT NOT NULL,
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subscription_grant_reference (stripe_reference),
  KEY idx_subscription_grant_user (user_id, granted_at)
);

INSERT INTO subscription_plans
  (code, name, price_cents, currency, billing_interval, stripe_price_id, benefits, display_order, is_active)
VALUES
  ('plus', 'EasyFutbol Plus', 999, 'EUR', 'month', NULL,
   JSON_OBJECT('monthly_easypass',1,'easypass_discount_percent',10,'early_match_booking',false,'waitlist_priority',true,'cancellation_deadline_hours',4,'tournament_early_access',true,'golden_name',true,'competitive_access','first_season_trial'),
   10, 1),
  ('pro', 'EasyFutbol Pro', 2999, 'EUR', 'month', NULL,
   JSON_OBJECT('monthly_easypass',4,'easypass_discount_percent',15,'early_match_booking',true,'waitlist_priority',true,'cancellation_deadline_hours',4,'tournament_early_access',true,'golden_name',true,'competitive_access','active_subscription'),
   20, 1)
ON DUPLICATE KEY UPDATE
  name=VALUES(name), price_cents=VALUES(price_cents), benefits=VALUES(benefits), display_order=VALUES(display_order);

INSERT IGNORE INTO user_subscriptions
  (user_id, plan_id, stripe_customer_id, stripe_subscription_id, status, current_period_start, current_period_end, cancel_at_period_end, started_at, created_at, updated_at)
SELECT ups.user_id, sp.id, ups.stripe_customer_id, ups.stripe_subscription_id, ups.status,
       ups.current_period_start, ups.current_period_end, ups.cancel_at_period_end, ups.created_at, ups.created_at, ups.updated_at
FROM user_plus_subscriptions ups
JOIN subscription_plans sp ON sp.code='plus'
WHERE ups.stripe_subscription_id IS NOT NULL;
