-- "Organizado por": lista propia de organizadores (nombre, primer apellido y
-- foto) que gestiona el admin, y el organizador de cada partido.
CREATE TABLE IF NOT EXISTS match_organizers (
  id INT NOT NULL AUTO_INCREMENT,
  first_name VARCHAR(60) NOT NULL,
  last_name VARCHAR(60) NOT NULL,
  photo_url VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_match_organizers_active (is_active, first_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @sql_matches_organizer = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'organizer_id') > 0,
  'SELECT 1',
  'ALTER TABLE matches ADD COLUMN organizer_id INT NULL, ADD CONSTRAINT fk_matches_organizer FOREIGN KEY (organizer_id) REFERENCES match_organizers(id) ON DELETE SET NULL'
);
PREPARE stmt_matches_organizer FROM @sql_matches_organizer;
EXECUTE stmt_matches_organizer;
DEALLOCATE PREPARE stmt_matches_organizer;

-- Los partidos programados lo copian al publicarse.
SET @sql_scheduled_organizer = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scheduled_match_publications' AND COLUMN_NAME = 'organizer_id') > 0,
  'SELECT 1',
  'ALTER TABLE scheduled_match_publications ADD COLUMN organizer_id INT NULL'
);
PREPARE stmt_scheduled_organizer FROM @sql_scheduled_organizer;
EXECUTE stmt_scheduled_organizer;
DEALLOCATE PREPARE stmt_scheduled_organizer;
