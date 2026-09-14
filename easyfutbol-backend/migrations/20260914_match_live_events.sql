-- Registro en directo de goles y paradas durante un partido, para que el
-- organizador pueda anotar el minuto y marcar candidatos a gol/parada de la
-- semana sin salir de la app. El resumen final sirve de guía para los recortes.

CREATE TABLE IF NOT EXISTS match_live_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id BIGINT UNSIGNED NOT NULL,
  type ENUM('goal','save') NOT NULL,
  minute SMALLINT UNSIGNED NOT NULL,
  player_name VARCHAR(120) NULL,
  team_color ENUM('white','black') NULL,
  is_candidate TINYINT(1) NOT NULL DEFAULT 0,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_match_live_events_match (match_id, minute)
);
