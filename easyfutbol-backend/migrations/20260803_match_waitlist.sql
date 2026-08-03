CREATE TABLE IF NOT EXISTS match_waitlist (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('waiting','offered','claimed','expired','cancelled') NOT NULL DEFAULT 'waiting',
  is_plus_snapshot TINYINT(1) NOT NULL DEFAULT 0,
  notifications_consent_at DATETIME NOT NULL,
  notified_at DATETIME NULL,
  offer_expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_waitlist_match_user (match_id, user_id),
  KEY idx_waitlist_queue (match_id, status, is_plus_snapshot, created_at),
  KEY idx_waitlist_expiry (status, offer_expires_at)
);
