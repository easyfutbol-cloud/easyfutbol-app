-- Permite anotar un gol/asistencia/parada a alguien que no tiene cuenta en
-- la app (y nunca la va a tener): se guarda solo el nombre, sin user_id.
-- No cuentan para el ranking oficial ni pueden ser MVP, porque
-- match_player_stats exige un user_id real (FK a users).

SET @sql_mle_guest_player = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_live_events' AND COLUMN_NAME = 'guest_player_name') > 0,
  'SELECT 1',
  'ALTER TABLE match_live_events ADD COLUMN guest_player_name VARCHAR(120) NULL AFTER user_id'
);
PREPARE stmt_mle_guest_player FROM @sql_mle_guest_player;
EXECUTE stmt_mle_guest_player;
DEALLOCATE PREPARE stmt_mle_guest_player;

SET @sql_mle_guest_assist = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_live_events' AND COLUMN_NAME = 'guest_assist_name') > 0,
  'SELECT 1',
  'ALTER TABLE match_live_events ADD COLUMN guest_assist_name VARCHAR(120) NULL AFTER assist_user_id'
);
PREPARE stmt_mle_guest_assist FROM @sql_mle_guest_assist;
EXECUTE stmt_mle_guest_assist;
DEALLOCATE PREPARE stmt_mle_guest_assist;
