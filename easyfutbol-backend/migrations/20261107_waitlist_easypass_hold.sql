-- Lista de espera con EasyPass retenido: al entrar se retiene el EasyPass y, si
-- se libera plaza, la entrada es automática. held_easypass > 0 significa que aún
-- hay saldo retenido por devolver o convertir; las filas anteriores quedan a 0 y
-- siguen el flujo antiguo de oferta de 30 minutos.
SET @sql_waitlist_held = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_waitlist' AND COLUMN_NAME = 'held_easypass') > 0,
  'SELECT 1',
  'ALTER TABLE match_waitlist
     ADD COLUMN held_easypass INT NOT NULL DEFAULT 0,
     ADD COLUMN held_from_location INT NOT NULL DEFAULT 0,
     ADD COLUMN held_location_id INT NULL,
     ADD COLUMN preferred_ticket_type ENUM(''white'',''black'') NULL'
);
PREPARE stmt_waitlist_held FROM @sql_waitlist_held;
EXECUTE stmt_waitlist_held;
DEALLOCATE PREPARE stmt_waitlist_held;

-- Partido extra: oculto al público hasta que el admin decida abrirlo.
SET @sql_matches_private = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'is_private') > 0,
  'SELECT 1',
  'ALTER TABLE matches
     ADD COLUMN is_private TINYINT(1) NOT NULL DEFAULT 0,
     ADD COLUMN waitlist_source_match_id BIGINT UNSIGNED NULL'
);
PREPARE stmt_matches_private FROM @sql_matches_private;
EXECUTE stmt_matches_private;
DEALLOCATE PREPARE stmt_matches_private;

CREATE TABLE IF NOT EXISTS match_extra_invitations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  extra_match_id BIGINT UNSIGNED NOT NULL,
  source_match_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('invited','accepted','declined') NOT NULL DEFAULT 'invited',
  is_plus_snapshot TINYINT(1) NOT NULL DEFAULT 0,
  available_from DATETIME NOT NULL,
  notified_at DATETIME NULL,
  responded_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_extra_invitation (extra_match_id, user_id),
  KEY idx_extra_invitation_user (user_id, source_match_id, status),
  KEY idx_extra_invitation_dispatch (status, notified_at, available_from)
);
