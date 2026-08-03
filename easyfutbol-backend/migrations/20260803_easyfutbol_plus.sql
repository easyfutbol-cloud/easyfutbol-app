CREATE TABLE IF NOT EXISTS user_plus_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  stripe_customer_id VARCHAR(255) NULL,
  stripe_subscription_id VARCHAR(255) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'inactive',
  current_period_start DATETIME NULL,
  current_period_end DATETIME NULL,
  cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plus_user (user_id),
  UNIQUE KEY uq_plus_customer (stripe_customer_id),
  UNIQUE KEY uq_plus_subscription (stripe_subscription_id)
);

CREATE TABLE IF NOT EXISTS plus_monthly_grants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  stripe_reference VARCHAR(255) NOT NULL,
  amount INT NOT NULL DEFAULT 1,
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plus_grant_reference (stripe_reference),
  KEY idx_plus_grants_user (user_id)
);
