-- Ligas privadas entre amigos: compiten con sus partidos reales de EasyFutbol.
-- Los puntos no se guardan: se calculan desde match_player_stats, así una
-- corrección del organizador actualiza la clasificación sola.
CREATE TABLE IF NOT EXISTS friend_leagues (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(60) NOT NULL,
  owner_id INT NOT NULL,
  team_size TINYINT UNSIGNED NOT NULL DEFAULT 1,
  matches_goal SMALLINT UNSIGNED NOT NULL,
  duration_days SMALLINT UNSIGNED NOT NULL,
  -- Valor de cada estadística y si se duplica ganar a un rival de la liga.
  rules JSON NOT NULL,
  status ENUM('draft','active','finished') NOT NULL DEFAULT 'draft',
  started_at DATETIME NULL,
  ends_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_friend_leagues_status (status, ends_at),
  KEY idx_friend_leagues_owner (owner_id, status),
  CONSTRAINT fk_friend_leagues_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS friend_league_members (
  league_id INT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('invited','accepted') NOT NULL DEFAULT 'invited',
  -- Pareja o trío dentro de la liga; se fija al empezar (NULL si es individual).
  team_no TINYINT UNSIGNED NULL,
  -- Último puesto avisado, para detectar quién te ha adelantado.
  last_rank SMALLINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (league_id, user_id),
  KEY idx_friend_league_members_user (user_id, status),
  CONSTRAINT fk_friend_league_members_league FOREIGN KEY (league_id) REFERENCES friend_leagues(id) ON DELETE CASCADE,
  CONSTRAINT fk_friend_league_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE social_notifications MODIFY type ENUM(
  'friend_request','friend_accepted','match_invitation','group_invitation',
  'match_cancelled','match_updated','easypass_gift',
  'post_match_summary','unclaimed_tickets','easypoints_reward',
  'slot_alert','reactivation','idle_balance','friend_joined','profile_reaction',
  'match_video','friend_league'
) NOT NULL;

-- 'easypass_gift' ya lo usa el código y faltaba en la lista original.
ALTER TABLE social_notifications MODIFY entity_type ENUM('user','friendship','match','group','easypass_gift','friend_league') NOT NULL;
