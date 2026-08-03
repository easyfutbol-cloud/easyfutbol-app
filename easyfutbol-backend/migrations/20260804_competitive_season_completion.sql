CREATE TABLE IF NOT EXISTS competitive_season_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  season_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  division_id BIGINT UNSIGNED NOT NULL,
  next_division_id BIGINT UNSIGNED NOT NULL,
  division_position INT UNSIGNED NOT NULL,
  total_score DECIMAL(5,1) NOT NULL DEFAULT 0,
  outcome ENUM('promoted','maintained','relegated','champion') NOT NULL DEFAULT 'maintained',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_competitive_season_result (season_id,user_id),
  KEY idx_competitive_result_history (user_id,season_id),
  KEY idx_competitive_result_division (season_id,location_id,division_id,division_position)
);

CREATE TABLE IF NOT EXISTS competitive_badges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(220) NOT NULL,
  icon VARCHAR(50) NOT NULL,
  color_hex CHAR(7) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_competitive_badge_code (code)
);

CREATE TABLE IF NOT EXISTS competitive_user_badges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  badge_id BIGINT UNSIGNED NOT NULL,
  season_id BIGINT UNSIGNED NOT NULL,
  awarded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_competitive_user_badge (user_id,badge_id,season_id),
  KEY idx_competitive_badges_user (user_id,awarded_at)
);

CREATE TABLE IF NOT EXISTS competitive_rewards (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  season_id BIGINT UNSIGNED NOT NULL,
  reward_code VARCHAR(50) NOT NULL,
  title VARCHAR(100) NOT NULL,
  description VARCHAR(240) NOT NULL,
  status ENUM('locked','available','claimed','expired') NOT NULL DEFAULT 'available',
  claimed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_competitive_reward (user_id,season_id,reward_code),
  KEY idx_competitive_reward_user (user_id,status,created_at)
);

INSERT INTO competitive_badges (code,name,description,icon,color_hex) VALUES
  ('division_champion','Campeón de división','Terminaste primero en tu división y ciudad.','trophy','#FFD45A'),
  ('promoted','Ascenso','Conseguiste ascender de división.','arrow-up-circle','#55D68B'),
  ('season_complete','Temporada completada','Completaste una temporada competitiva.','ribbon','#62B6FF')
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description),icon=VALUES(icon),color_hex=VALUES(color_hex);
