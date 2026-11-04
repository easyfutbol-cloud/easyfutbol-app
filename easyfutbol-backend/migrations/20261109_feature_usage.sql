-- Qué apartados de la app abre cada jugador: una fila por jugador, apartado y
-- día, así el panel cuenta personas y días de uso, no recargas. "app" es
-- cualquier apertura y sirve de base para los porcentajes.
CREATE TABLE IF NOT EXISTS feature_usage_daily (
  user_id INT NOT NULL,
  feature VARCHAR(32) NOT NULL,
  used_on DATE NOT NULL,
  PRIMARY KEY (user_id, feature, used_on),
  KEY idx_feature_usage_day (used_on, feature),
  CONSTRAINT fk_feature_usage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
