CREATE TABLE IF NOT EXISTS easypass_gifts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_key VARCHAR(80) NOT NULL,
  sender_id INT NOT NULL,
  recipient_id INT NOT NULL,
  location_id INT NOT NULL,
  amount INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_easypass_gift_request (request_key),
  KEY idx_easypass_gift_sender (sender_id, created_at),
  KEY idx_easypass_gift_recipient (recipient_id, created_at),
  CONSTRAINT chk_easypass_gift_amount CHECK (amount BETWEEN 1 AND 20),
  CONSTRAINT chk_easypass_gift_users CHECK (sender_id <> recipient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @gift_type_definition = (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'easypass_transactions' AND COLUMN_NAME = 'type' LIMIT 1
);
SET @gift_type_nullable = (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'easypass_transactions' AND COLUMN_NAME = 'type' LIMIT 1
);
SET @gift_type_default = (
  SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'easypass_transactions' AND COLUMN_NAME = 'type' LIMIT 1
);
SET @gift_type_extended = IF(
  @gift_type_definition IS NULL OR LOCATE('''gift_sent''', @gift_type_definition) > 0,
  NULL,
  CONCAT(LEFT(@gift_type_definition, LENGTH(@gift_type_definition) - 1), ',''gift_sent'',''gift_received'')')
);
SET @gift_type_statement = IF(
  @gift_type_extended IS NULL,
  'SELECT 1',
  CONCAT(
    'ALTER TABLE easypass_transactions MODIFY COLUMN type ', @gift_type_extended,
    IF(@gift_type_nullable = 'YES', ' NULL', ' NOT NULL'),
    IF(@gift_type_default IS NULL, '', CONCAT(' DEFAULT ', QUOTE(@gift_type_default)))
  )
);
PREPARE gift_type_migration FROM @gift_type_statement;
EXECUTE gift_type_migration;
DEALLOCATE PREPARE gift_type_migration;
