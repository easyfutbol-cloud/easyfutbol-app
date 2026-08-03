CREATE TABLE IF NOT EXISTS competitive_seasons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  status ENUM('draft','upcoming','active','scoring','completed','cancelled') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NOT NULL,
  activated_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_competitive_season_code (code),
  KEY idx_competitive_season_status (status, starts_at, ends_at)
);

CREATE TABLE IF NOT EXISTS competitive_weeks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  season_id BIGINT UNSIGNED NOT NULL,
  week_number TINYINT UNSIGNED NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  status ENUM('upcoming','active','pending_scoring','scored','closed') NOT NULL DEFAULT 'upcoming',
  scored_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_competitive_season_week (season_id, week_number),
  KEY idx_competitive_week_window (starts_at, ends_at, status)
);

CREATE TABLE IF NOT EXISTS competitive_divisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(60) NOT NULL,
  tier TINYINT UNSIGNED NOT NULL,
  color_hex CHAR(7) NOT NULL,
  icon VARCHAR(50) NULL,
  group_capacity INT NOT NULL DEFAULT 20,
  promotion_slots INT NOT NULL DEFAULT 4,
  relegation_slots INT NOT NULL DEFAULT 4,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_competitive_division_code (code),
  UNIQUE KEY uq_competitive_division_tier (tier)
);

CREATE TABLE IF NOT EXISTS competitive_division_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  season_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  group_number INT NOT NULL DEFAULT 1,
  capacity INT NOT NULL DEFAULT 20,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_competitive_group (season_id, division_id, location_id, group_number),
  KEY idx_competitive_group_lookup (season_id, location_id, division_id)
);

CREATE TABLE IF NOT EXISTS competitive_season_players (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  season_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  group_id BIGINT UNSIGNED NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  access_source ENUM('pro','plus_trial','admin') NOT NULL,
  access_entitlement_id BIGINT UNSIGNED NULL,
  status ENUM('provisional','active','inactive','withdrawn','disqualified') NOT NULL DEFAULT 'provisional',
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at DATETIME NULL,
  final_position INT NULL,
  final_points DECIMAL(7,2) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_competitive_season_player (season_id, user_id),
  KEY idx_competitive_player_group (season_id, group_id, status),
  KEY idx_competitive_player_user (user_id, season_id)
);

INSERT INTO competitive_divisions
  (code, name, tier, color_hex, icon, group_capacity, promotion_slots, relegation_slots)
VALUES
  ('bronze','Bronce',1,'#CD7F32','shield-outline',20,4,0),
  ('silver','Plata',2,'#C0C0C0','shield-half-outline',20,4,4),
  ('gold','Oro',3,'#FFD700','shield-checkmark-outline',20,4,4),
  ('platinum','Platino',4,'#71D5D8','diamond-outline',20,4,4),
  ('diamond','Diamante',5,'#62B6FF','diamond',20,0,4)
ON DUPLICATE KEY UPDATE name=VALUES(name), color_hex=VALUES(color_hex), icon=VALUES(icon),
  group_capacity=VALUES(group_capacity), promotion_slots=VALUES(promotion_slots), relegation_slots=VALUES(relegation_slots);
