CREATE TABLE IF NOT EXISTS user_social_privacy (
  user_id INT NOT NULL,
  show_upcoming_to_friends TINYINT(1) NOT NULL DEFAULT 1,
  show_stats_to_friends TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_social_privacy_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_blocks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  blocker_id INT NOT NULL,
  blocked_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_block (blocker_id, blocked_id),
  KEY idx_user_blocks_blocked (blocked_id, blocker_id),
  CONSTRAINT fk_user_block_blocker FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_block_blocked FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_user_block_not_self CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS user_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporter_id INT NOT NULL,
  reported_id INT NOT NULL,
  reason ENUM('conduct','harassment','spam','identity','other') NOT NULL,
  details VARCHAR(500) NULL,
  status ENUM('open','reviewing','resolved','dismissed') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  reviewed_by INT NULL,
  PRIMARY KEY (id),
  KEY idx_user_reports_status (status, created_at),
  KEY idx_user_reports_reported (reported_id, created_at),
  CONSTRAINT fk_user_report_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_report_reported FOREIGN KEY (reported_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_report_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_user_report_not_self CHECK (reporter_id <> reported_id)
);
