-- Permite, al comprar entradas, decidir quién juega cada una: "voy yo" la
-- asigna al momento, o se manda un enlace para que otra persona enlace su
-- perfil (assigned_user_id). Si nadie la reclama, la entrada sigue sin
-- jugador asignado y esa persona no cuenta en las estadísticas.
-- assigned_user_id ya se usaba de forma defensiva en adminMatches.js/adminStats.js
-- (comprobando information_schema); esta migración lo deja fijo en el esquema.

SET @sql_insc_assigned = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inscriptions' AND COLUMN_NAME = 'assigned_user_id') > 0,
  'SELECT 1',
  'ALTER TABLE inscriptions ADD COLUMN assigned_user_id INT NULL AFTER user_id'
);
PREPARE stmt_insc_assigned FROM @sql_insc_assigned;
EXECUTE stmt_insc_assigned;
DEALLOCATE PREPARE stmt_insc_assigned;

SET @sql_insc_claim_token = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inscriptions' AND COLUMN_NAME = 'claim_token') > 0,
  'SELECT 1',
  'ALTER TABLE inscriptions ADD COLUMN claim_token CHAR(32) NULL AFTER assigned_user_id'
);
PREPARE stmt_insc_claim_token FROM @sql_insc_claim_token;
EXECUTE stmt_insc_claim_token;
DEALLOCATE PREPARE stmt_insc_claim_token;

SET @sql_insc_assigned_idx = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inscriptions' AND INDEX_NAME = 'idx_inscriptions_assigned_user') > 0,
  'SELECT 1',
  'ALTER TABLE inscriptions ADD INDEX idx_inscriptions_assigned_user (assigned_user_id)'
);
PREPARE stmt_insc_assigned_idx FROM @sql_insc_assigned_idx;
EXECUTE stmt_insc_assigned_idx;
DEALLOCATE PREPARE stmt_insc_assigned_idx;

SET @sql_insc_claim_idx = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inscriptions' AND INDEX_NAME = 'uq_inscriptions_claim_token') > 0,
  'SELECT 1',
  'ALTER TABLE inscriptions ADD UNIQUE KEY uq_inscriptions_claim_token (claim_token)'
);
PREPARE stmt_insc_claim_idx FROM @sql_insc_claim_idx;
EXECUTE stmt_insc_claim_idx;
DEALLOCATE PREPARE stmt_insc_claim_idx;
