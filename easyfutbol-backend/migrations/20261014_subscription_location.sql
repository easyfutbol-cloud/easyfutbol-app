-- Sede elegida al contratar EasyFutbol Plus. El EasyPass mensual del plan se
-- ingresa en el saldo de esa sede y los ingresos de la suscripción se
-- atribuyen a ella en los KPIs. NULL = suscripción anterior a este cambio
-- (su EasyPass mensual sigue siendo universal, como hasta ahora).

SET @sql_us_location = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_subscriptions' AND COLUMN_NAME = 'location_id') > 0,
  'SELECT 1',
  'ALTER TABLE user_subscriptions ADD COLUMN location_id INT NULL AFTER plan_id'
);
PREPARE stmt_us_location FROM @sql_us_location;
EXECUTE stmt_us_location;
DEALLOCATE PREPARE stmt_us_location;
