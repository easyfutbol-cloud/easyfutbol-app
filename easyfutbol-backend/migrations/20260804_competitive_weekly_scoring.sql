CREATE TABLE IF NOT EXISTS competitive_week_scores (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  season_id BIGINT UNSIGNED NOT NULL,
  week_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  best_evaluation_id BIGINT UNSIGNED NULL,
  best_match_id BIGINT UNSIGNED NULL,
  weekly_score DECIMAL(4,1) NOT NULL DEFAULT 0,
  eligible_matches INT UNSIGNED NOT NULL DEFAULT 0,
  scored_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_competitive_week_score (week_id,user_id),
  KEY idx_competitive_week_score_rank (season_id,week_id,weekly_score)
);

CREATE TABLE IF NOT EXISTS competitive_week_rankings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  season_id BIGINT UNSIGNED NOT NULL,
  week_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  position INT UNSIGNED NOT NULL,
  previous_position INT UNSIGNED NULL,
  position_change INT NOT NULL DEFAULT 0,
  weekly_score DECIMAL(4,1) NOT NULL DEFAULT 0,
  season_score DECIMAL(5,1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_competitive_week_ranking (week_id,user_id),
  KEY idx_competitive_week_leaderboard (season_id,week_id,position)
);

CREATE TABLE IF NOT EXISTS competitive_season_standings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  season_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  position INT UNSIGNED NOT NULL,
  previous_position INT UNSIGNED NULL,
  position_change INT NOT NULL DEFAULT 0,
  total_score DECIMAL(5,1) NOT NULL DEFAULT 0,
  scored_weeks TINYINT UNSIGNED NOT NULL DEFAULT 0,
  latest_week_id BIGINT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_competitive_season_standing (season_id,user_id),
  KEY idx_competitive_season_leaderboard (season_id,position)
);
