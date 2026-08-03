SET @has_referral_code = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='referral_code'
);
SET @add_referral_code = IF(
  @has_referral_code=0,
  'ALTER TABLE users ADD COLUMN referral_code VARCHAR(20) NULL',
  'SELECT 1'
);
PREPARE add_referral_code_stmt FROM @add_referral_code;
EXECUTE add_referral_code_stmt;
DEALLOCATE PREPARE add_referral_code_stmt;

UPDATE users
SET referral_code = CONCAT('EF', UPPER(LPAD(CONV(id, 10, 36), 6, '0')))
WHERE referral_code IS NULL OR referral_code = '';

SET @has_referral_index = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND INDEX_NAME='uq_users_referral_code'
);
SET @add_referral_index = IF(
  @has_referral_index=0,
  'ALTER TABLE users ADD UNIQUE KEY uq_users_referral_code (referral_code)',
  'SELECT 1'
);
PREPARE add_referral_index_stmt FROM @add_referral_index;
EXECUTE add_referral_index_stmt;
DEALLOCATE PREPARE add_referral_index_stmt;

CREATE TABLE IF NOT EXISTS user_referrals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  referrer_user_id BIGINT UNSIGNED NOT NULL,
  referred_user_id BIGINT UNSIGNED NOT NULL,
  referral_code VARCHAR(20) NOT NULL,
  status ENUM('registered','qualified') NOT NULL DEFAULT 'registered',
  qualified_payment_reference VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  qualified_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_referrals_referred_user (referred_user_id),
  UNIQUE KEY uq_referrals_payment (qualified_payment_reference),
  KEY idx_referrals_referrer_status (referrer_user_id, status)
);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  milestone INT NOT NULL,
  easypass_awarded INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_referral_reward_milestone (user_id, milestone)
);
