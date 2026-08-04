SET @easypass_type_definition = (
  SELECT COLUMN_TYPE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'easypass_transactions'
    AND COLUMN_NAME = 'type'
  LIMIT 1
);

SET @easypass_type_nullable = (
  SELECT IS_NULLABLE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'easypass_transactions'
    AND COLUMN_NAME = 'type'
  LIMIT 1
);

SET @easypass_type_default = (
  SELECT COLUMN_DEFAULT
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'easypass_transactions'
    AND COLUMN_NAME = 'type'
  LIMIT 1
);

SET @easypass_type_with_subscription = IF(
  @easypass_type_definition IS NULL OR LOCATE('''plus_grant''', @easypass_type_definition) > 0,
  NULL,
  CONCAT(
    LEFT(@easypass_type_definition, LENGTH(@easypass_type_definition) - 1),
    ',''plus_grant'')'
  )
);

SET @easypass_type_migration = IF(
  @easypass_type_with_subscription IS NULL,
  'SELECT 1',
  CONCAT(
    'ALTER TABLE easypass_transactions MODIFY COLUMN type ',
    @easypass_type_with_subscription,
    IF(@easypass_type_nullable = 'YES', ' NULL', ' NOT NULL'),
    IF(@easypass_type_default IS NULL, '', CONCAT(' DEFAULT ', QUOTE(@easypass_type_default)))
  )
);

PREPARE easypass_type_statement FROM @easypass_type_migration;
EXECUTE easypass_type_statement;
DEALLOCATE PREPARE easypass_type_statement;
