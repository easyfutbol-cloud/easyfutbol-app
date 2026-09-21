-- Popups que el admin puede crear desde la app y que se muestran a los
-- jugadores al abrir la app (aviso, promo, novedad...).
-- Migración idempotente: solo crea las tablas si no existen.

CREATE TABLE IF NOT EXISTS app_popups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(120) NOT NULL,
  body TEXT NULL,
  image_url VARCHAR(500) NULL,
  button_label VARCHAR(40) NULL,
  action_type ENUM('none','url','screen') NOT NULL DEFAULT 'none',
  action_value VARCHAR(500) NULL,
  -- once: una vez por jugador · daily: como mucho una vez al día · always: en cada apertura de la app
  frequency ENUM('once','daily','always') NOT NULL DEFAULT 'once',
  -- Sedes a las que va dirigido, separadas por comas (ej: 'valladolid,asturias'). NULL = todas.
  audience_locations VARCHAR(100) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  ends_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_app_popups_active (is_active, ends_at)
);

-- Cada vez que un jugador ve un popup o pulsa su botón.
CREATE TABLE IF NOT EXISTS app_popup_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  popup_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  action ENUM('view','click') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_app_popup_events_user (popup_id, user_id, action),
  KEY idx_app_popup_events_popup (popup_id, action)
);
