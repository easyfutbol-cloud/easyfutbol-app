-- Unifica "apuntar eventos": los goles/paradas/MVP se registran sobre
-- jugadores reales (no texto libre) y alimentan directamente las
-- estadísticas oficiales (match_player_stats + inscriptions), incluida
-- una nueva estadística de paradas que antes no existía.

-- match_live_events: jugador real (user_id) y asistencia opcional
SET @sql_mle_user = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_live_events' AND COLUMN_NAME = 'user_id') > 0,
  'SELECT 1',
  'ALTER TABLE match_live_events ADD COLUMN user_id INT NULL AFTER minute'
);
PREPARE stmt_mle_user FROM @sql_mle_user;
EXECUTE stmt_mle_user;
DEALLOCATE PREPARE stmt_mle_user;

SET @sql_mle_assist = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_live_events' AND COLUMN_NAME = 'assist_user_id') > 0,
  'SELECT 1',
  'ALTER TABLE match_live_events ADD COLUMN assist_user_id INT NULL AFTER user_id'
);
PREPARE stmt_mle_assist FROM @sql_mle_assist;
EXECUTE stmt_mle_assist;
DEALLOCATE PREPARE stmt_mle_assist;

ALTER TABLE match_live_events MODIFY type ENUM('goal','save','mvp') NOT NULL;

SET @sql_mle_user_idx = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_live_events' AND INDEX_NAME = 'idx_match_live_events_user') > 0,
  'SELECT 1',
  'ALTER TABLE match_live_events ADD INDEX idx_match_live_events_user (match_id, user_id)'
);
PREPARE stmt_mle_user_idx FROM @sql_mle_user_idx;
EXECUTE stmt_mle_user_idx;
DEALLOCATE PREPARE stmt_mle_user_idx;

-- match_player_stats / inscriptions: nueva estadística de paradas
SET @sql_mps_saves = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_player_stats' AND COLUMN_NAME = 'saves') > 0,
  'SELECT 1',
  'ALTER TABLE match_player_stats ADD COLUMN saves TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER assists'
);
PREPARE stmt_mps_saves FROM @sql_mps_saves;
EXECUTE stmt_mps_saves;
DEALLOCATE PREPARE stmt_mps_saves;

SET @sql_insc_saves = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inscriptions' AND COLUMN_NAME = 'saves') > 0,
  'SELECT 1',
  'ALTER TABLE inscriptions ADD COLUMN saves INT NULL DEFAULT 0 AFTER assists'
);
PREPARE stmt_insc_saves FROM @sql_insc_saves;
EXECUTE stmt_insc_saves;
DEALLOCATE PREPARE stmt_insc_saves;
