-- "El 8 de la semana": votación semanal de la mejor alineación (portero,
-- central, 2 laterales, 2 centrocampistas, delantero) entre candidatos que
-- elige el admin. El ciclo de apertura/cierre lo gestiona el propio backend.

CREATE TABLE IF NOT EXISTS weekly_lineup_polls (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  status ENUM('draft','open','closed') NOT NULL DEFAULT 'draft',
  opened_at DATETIME NULL,
  closed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_weekly_lineup_polls_week (week_start)
);

CREATE TABLE IF NOT EXISTS weekly_lineup_candidates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  poll_id BIGINT UNSIGNED NOT NULL,
  position ENUM('portero','central','lateral','centrocampista','delantero') NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_weekly_lineup_candidate (poll_id, position, user_id),
  KEY idx_weekly_lineup_candidates_poll (poll_id, position)
);

CREATE TABLE IF NOT EXISTS weekly_lineup_votes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  poll_id BIGINT UNSIGNED NOT NULL,
  position ENUM('portero','central','lateral','centrocampista','delantero') NOT NULL,
  candidate_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_weekly_lineup_vote (poll_id, position, user_id),
  KEY idx_weekly_lineup_votes_candidate (candidate_id)
);
