-- Amplía la tabla `fields` para poder gestionar desde la app la ubicación,
-- la foto y las indicaciones de llegada de cada campo (multi-ciudad).
-- Migración idempotente: se puede ejecutar aunque alguna columna ya exista.

-- address (por si en algún entorno no existiera)
SET @sql_fields_address = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fields' AND COLUMN_NAME = 'address') > 0,
  'SELECT 1',
  'ALTER TABLE fields ADD COLUMN address VARCHAR(190) NULL'
);
PREPARE stmt_fields_address FROM @sql_fields_address;
EXECUTE stmt_fields_address;
DEALLOCATE PREPARE stmt_fields_address;

-- maps_url: enlace directo de Google Maps / Apple Maps del campo
SET @sql_fields_maps_url = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fields' AND COLUMN_NAME = 'maps_url') > 0,
  'SELECT 1',
  'ALTER TABLE fields ADD COLUMN maps_url VARCHAR(500) NULL AFTER address'
);
PREPARE stmt_fields_maps_url FROM @sql_fields_maps_url;
EXECUTE stmt_fields_maps_url;
DEALLOCATE PREPARE stmt_fields_maps_url;

-- image_url: foto del campo (subida desde la app o URL externa)
SET @sql_fields_image_url = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fields' AND COLUMN_NAME = 'image_url') > 0,
  'SELECT 1',
  'ALTER TABLE fields ADD COLUMN image_url VARCHAR(500) NULL AFTER maps_url'
);
PREPARE stmt_fields_image_url FROM @sql_fields_image_url;
EXECUTE stmt_fields_image_url;
DEALLOCATE PREPARE stmt_fields_image_url;

-- arrival_instructions: indicaciones de llegada para el jugador
SET @sql_fields_arrival = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fields' AND COLUMN_NAME = 'arrival_instructions') > 0,
  'SELECT 1',
  'ALTER TABLE fields ADD COLUMN arrival_instructions VARCHAR(600) NULL AFTER image_url'
);
PREPARE stmt_fields_arrival FROM @sql_fields_arrival;
EXECUTE stmt_fields_arrival;
DEALLOCATE PREPARE stmt_fields_arrival;

-- is_active: permite ocultar campos que ya no se usan sin borrarlos
SET @sql_fields_is_active = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fields' AND COLUMN_NAME = 'is_active') > 0,
  'SELECT 1',
  'ALTER TABLE fields ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER arrival_instructions'
);
PREPARE stmt_fields_is_active FROM @sql_fields_is_active;
EXECUTE stmt_fields_is_active;
DEALLOCATE PREPARE stmt_fields_is_active;

-- updated_at: control de últimos cambios
SET @sql_fields_updated_at = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fields' AND COLUMN_NAME = 'updated_at') > 0,
  'SELECT 1',
  'ALTER TABLE fields ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
);
PREPARE stmt_fields_updated_at FROM @sql_fields_updated_at;
EXECUTE stmt_fields_updated_at;
DEALLOCATE PREPARE stmt_fields_updated_at;

-- Índice para el listado por ciudad
SET @sql_fields_idx_city = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fields' AND INDEX_NAME = 'idx_fields_city_active') > 0,
  'SELECT 1',
  'ALTER TABLE fields ADD INDEX idx_fields_city_active (city, is_active, name)'
);
PREPARE stmt_fields_idx_city FROM @sql_fields_idx_city;
EXECUTE stmt_fields_idx_city;
DEALLOCATE PREPARE stmt_fields_idx_city;

-- Traspaso de los datos que hasta ahora estaban escritos a mano en la app (MatchScreen.js).
-- Solo rellena lo que esté vacío, nunca sobrescribe lo que ya se haya editado desde la app.
UPDATE fields
SET image_url = COALESCE(image_url, 'https://easyfutbol.es/wp-content/uploads/2025/08/RIBERA-DE-CASTILLA.jpeg'),
    arrival_instructions = COALESCE(arrival_instructions, 'El partido se juega en Ribera de Castilla. Recomendamos llegar 10 minutos antes para organizar equipos y camisetas.')
WHERE name LIKE '%Ribera de Castilla%';

UPDATE fields
SET image_url = COALESCE(image_url, 'https://easyfutbol.es/wp-content/uploads/2025/08/CANTERAC.jpeg'),
    arrival_instructions = COALESCE(arrival_instructions, 'El acceso al campo de Canterac se realiza por la entrada principal del complejo. Recomendamos llegar 10 minutos antes para organizar equipos y camisetas.')
WHERE name LIKE '%Canterac%';

UPDATE fields
SET arrival_instructions = COALESCE(arrival_instructions, 'El partido se juega en La Rondilla. Entra por el acceso principal y busca la zona de campos de fútbol. Recomendamos llegar con unos minutos de margen.')
WHERE name LIKE '%Rondilla%';
