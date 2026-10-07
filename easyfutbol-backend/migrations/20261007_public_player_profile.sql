-- Perfil de jugador más público: foto de portada, estadísticas que el
-- jugador elige mostrar, galería de fotos de partidos y comentarios
-- (solo de jugadores con al menos 5 partidos jugados, para frenar cuentas
-- falsas). Migración idempotente.

SET @sql_users_banner = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'banner_url') > 0,
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN banner_url VARCHAR(500) NULL'
);
PREPARE stmt_users_banner FROM @sql_users_banner;
EXECUTE stmt_users_banner;
DEALLOCATE PREPARE stmt_users_banner;

-- Lista separada por comas de qué estadísticas enseña en su perfil público
-- (goals,assists,saves,mvp_count,matches_played,win_rate). NULL = ninguna.
SET @sql_privacy_visible_stats = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_social_privacy' AND COLUMN_NAME = 'visible_stats') > 0,
  'SELECT 1',
  'ALTER TABLE user_social_privacy ADD COLUMN visible_stats VARCHAR(255) NULL'
);
PREPARE stmt_privacy_visible_stats FROM @sql_privacy_visible_stats;
EXECUTE stmt_privacy_visible_stats;
DEALLOCATE PREPARE stmt_privacy_visible_stats;

SET @sql_privacy_comments = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_social_privacy' AND COLUMN_NAME = 'comments_enabled') > 0,
  'SELECT 1',
  'ALTER TABLE user_social_privacy ADD COLUMN comments_enabled TINYINT(1) NOT NULL DEFAULT 1'
);
PREPARE stmt_privacy_comments FROM @sql_privacy_comments;
EXECUTE stmt_privacy_comments;
DEALLOCATE PREPARE stmt_privacy_comments;

CREATE TABLE IF NOT EXISTS player_profile_photos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  match_id INT NULL,
  image_url VARCHAR(500) NOT NULL,
  caption VARCHAR(140) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_player_profile_photos_user (user_id, created_at),
  CONSTRAINT fk_player_profile_photos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_player_profile_photos_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS player_profile_comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  profile_user_id INT NOT NULL,
  author_user_id INT NOT NULL,
  body VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_player_profile_comments_profile (profile_user_id, created_at),
  CONSTRAINT fk_player_profile_comments_profile FOREIGN KEY (profile_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_player_profile_comments_author FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
);
