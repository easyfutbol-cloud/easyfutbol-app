-- Enlace público del perfil (easyfutbol…/jugador/<slug>). El slug es
-- aleatorio en vez del id para que no se puedan recorrer todos los perfiles
-- probando números. Se crea la primera vez que el jugador comparte. Idempotente.
SET @sql_users_slug = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'public_slug') > 0,
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN public_slug VARCHAR(16) NULL, ADD UNIQUE KEY uq_users_public_slug (public_slug)'
);
PREPARE stmt_users_slug FROM @sql_users_slug;
EXECUTE stmt_users_slug;
DEALLOCATE PREPARE stmt_users_slug;
