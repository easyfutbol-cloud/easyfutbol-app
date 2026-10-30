-- Perfil social v3: apodo, dorsal, bio, equipo favorito y color del perfil
-- (en users), y qué secciones enseña el jugador y en qué orden (en
-- user_social_privacy). NULL en profile_sections = orden por defecto, sin la
-- carta ni la evolución, que son opt-in igual que las estadísticas.
-- Idempotente: cada columna solo se añade si no existe.
SET @sql_users_nickname = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'nickname') > 0,
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN nickname VARCHAR(24) NULL, ADD COLUMN shirt_number TINYINT UNSIGNED NULL, ADD COLUMN bio VARCHAR(160) NULL, ADD COLUMN favorite_team VARCHAR(40) NULL, ADD COLUMN profile_accent VARCHAR(16) NULL'
);
PREPARE stmt_users_nickname FROM @sql_users_nickname;
EXECUTE stmt_users_nickname;
DEALLOCATE PREPARE stmt_users_nickname;

SET @sql_privacy_sections = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_social_privacy' AND COLUMN_NAME = 'profile_sections') > 0,
  'SELECT 1',
  'ALTER TABLE user_social_privacy ADD COLUMN profile_sections VARCHAR(255) NULL'
);
PREPARE stmt_privacy_sections FROM @sql_privacy_sections;
EXECUTE stmt_privacy_sections;
DEALLOCATE PREPARE stmt_privacy_sections;
