-- Racha, retos y EasyPoints: los retos completados dan EasyPoints, que se
-- canjean por personalizables del perfil (marco del avatar y título). Son
-- una moneda aparte de users.achievement_points (el ranking de logros), para
-- que canjear nunca haga bajar a nadie en la clasificación. Idempotente.

-- Movimientos de EasyPoints: + por retos y rachas, - por canjes. source_key
-- es único por usuario (p. ej. "challenge:ASSISTS_2_MATCH:2026-10-26"), así
-- que volver a evaluar un reto o repetir una compra nunca suma dos veces.
CREATE TABLE IF NOT EXISTS easypoints_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  amount INT NOT NULL,
  source_type ENUM('challenge','streak','purchase','admin') NOT NULL,
  source_key VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_easypoints_user_source (user_id, source_key),
  KEY idx_easypoints_user_created (user_id, created_at),
  CONSTRAINT fk_easypoints_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Personalizables que tiene cada jugador (el catálogo vive en el código).
CREATE TABLE IF NOT EXISTS user_cosmetics (
  user_id INT NOT NULL,
  item_code VARCHAR(40) NOT NULL,
  acquired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_code),
  CONSTRAINT fk_user_cosmetics_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

SET @sql_users_frame = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'equipped_frame') > 0,
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN equipped_frame VARCHAR(40) NULL'
);
PREPARE stmt_users_frame FROM @sql_users_frame;
EXECUTE stmt_users_frame;
DEALLOCATE PREPARE stmt_users_frame;

SET @sql_users_title = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'equipped_title') > 0,
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN equipped_title VARCHAR(40) NULL'
);
PREPARE stmt_users_title FROM @sql_users_title;
EXECUTE stmt_users_title;
DEALLOCATE PREPARE stmt_users_title;

-- Aviso de "reto completado" tras publicar el acta.
ALTER TABLE social_notifications MODIFY type ENUM(
  'friend_request','friend_accepted','match_invitation','group_invitation',
  'match_cancelled','match_updated','easypass_gift',
  'post_match_summary','unclaimed_tickets','easypoints_reward'
) NOT NULL;
