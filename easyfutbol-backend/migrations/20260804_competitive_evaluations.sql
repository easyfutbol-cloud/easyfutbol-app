CREATE TABLE IF NOT EXISTS competitive_match_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  season_id BIGINT UNSIGNED NOT NULL,
  week_id BIGINT UNSIGNED NOT NULL,
  match_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','partial','completed') NOT NULL DEFAULT 'pending',
  eligible_players INT UNSIGNED NOT NULL DEFAULT 0,
  resolved_players INT UNSIGNED NOT NULL DEFAULT 0,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_competitive_match_review (match_id),
  KEY idx_competitive_review_queue (season_id, week_id, status)
);

CREATE TABLE IF NOT EXISTS competitive_match_evaluations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  review_id BIGINT UNSIGNED NOT NULL,
  season_id BIGINT UNSIGNED NOT NULL,
  week_id BIGINT UNSIGNED NOT NULL,
  match_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  inscription_id BIGINT UNSIGNED NULL,
  player_role ENUM('outfield','goalkeeper') NOT NULL DEFAULT 'outfield',
  status ENUM('pending','completed','not_evaluable') NOT NULL DEFAULT 'pending',
  criterion_1 TINYINT UNSIGNED NULL,
  criterion_2 TINYINT UNSIGNED NULL,
  criterion_3 TINYINT UNSIGNED NULL,
  criterion_4 TINYINT UNSIGNED NULL,
  criterion_5 TINYINT UNSIGNED NULL,
  computed_score DECIMAL(3,1) NULL,
  manual_score DECIMAL(3,1) NULL,
  manual_reason VARCHAR(500) NULL,
  final_score DECIMAL(3,1) NULL,
  observations TEXT NULL,
  evaluated_by BIGINT UNSIGNED NULL,
  evaluated_at DATETIME NULL,
  revision_number INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_competitive_match_player (match_id, user_id),
  KEY idx_competitive_evaluation_review (review_id, status),
  KEY idx_competitive_evaluation_player (season_id, user_id, week_id)
);

CREATE TABLE IF NOT EXISTS competitive_evaluation_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  evaluation_id BIGINT UNSIGNED NOT NULL,
  revision_number INT UNSIGNED NOT NULL,
  snapshot JSON NOT NULL,
  changed_by BIGINT UNSIGNED NOT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_competitive_evaluation_revision (evaluation_id, revision_number),
  KEY idx_competitive_revision_history (evaluation_id, changed_at)
);
