-- Hora real (UTC) en la que pasó el gol o la parada: la captura el móvil o el
-- reloj al pulsar el botón, aunque el reloj la suba más tarde al recuperar la
-- conexión. Los eventos antiguos se quedan en NULL y siguen usando el minuto.

SET @sql_mle_occurred_at = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'match_live_events' AND COLUMN_NAME = 'occurred_at') > 0,
  'SELECT 1',
  'ALTER TABLE match_live_events ADD COLUMN occurred_at DATETIME NULL AFTER minute'
);
PREPARE stmt_mle_occurred_at FROM @sql_mle_occurred_at;
EXECUTE stmt_mle_occurred_at;
DEALLOCATE PREPARE stmt_mle_occurred_at;
