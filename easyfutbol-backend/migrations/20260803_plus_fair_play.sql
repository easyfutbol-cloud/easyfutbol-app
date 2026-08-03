CREATE TABLE IF NOT EXISTS plus_fair_play_warnings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  inscription_id BIGINT UNSIGNED NULL,
  match_id BIGINT UNSIGNED NOT NULL,
  reason ENUM('late_cancellation','no_show') NOT NULL,
  warning_month DATE NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plus_warning_event (user_id, inscription_id, match_id, reason),
  KEY idx_plus_warning_month (user_id, warning_month)
);
