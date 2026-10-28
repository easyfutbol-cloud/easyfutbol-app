-- referralService inserta movimientos 'referral_reward' al llegar a 5 referidos,
-- pero el ENUM nunca lo incluyó: el INSERT fallaba y tumbaba el webhook entero,
-- dejando sin acreditar la compra del referido que alcanzaba el hito.
SET @referral_type_definition = (
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'easypass_transactions' AND COLUMN_NAME = 'type' LIMIT 1
);
SET @referral_type_nullable = (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'easypass_transactions' AND COLUMN_NAME = 'type' LIMIT 1
);
SET @referral_type_default = (
  SELECT COLUMN_DEFAULT FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'easypass_transactions' AND COLUMN_NAME = 'type' LIMIT 1
);
SET @referral_type_extended = IF(
  @referral_type_definition IS NULL
    OR LEFT(@referral_type_definition, 5) <> 'enum('
    OR LOCATE('''referral_reward''', @referral_type_definition) > 0,
  NULL,
  CONCAT(LEFT(@referral_type_definition, LENGTH(@referral_type_definition) - 1), ',''referral_reward'')')
);
SET @referral_type_statement = IF(
  @referral_type_extended IS NULL,
  'SELECT 1',
  CONCAT(
    'ALTER TABLE easypass_transactions MODIFY COLUMN type ', @referral_type_extended,
    IF(@referral_type_nullable = 'YES', ' NULL', ' NOT NULL'),
    IF(@referral_type_default IS NULL, '', CONCAT(' DEFAULT ', QUOTE(@referral_type_default)))
  )
);
PREPARE referral_type_migration FROM @referral_type_statement;
EXECUTE referral_type_migration;
DEALLOCATE PREPARE referral_type_migration;
