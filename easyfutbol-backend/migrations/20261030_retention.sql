-- Valoración rápida del partido (equipos igualados, organizador, campo) y
-- tipos de aviso nuevos: alerta de hueco, reactivación y saldo sin usar.
CREATE TABLE IF NOT EXISTS match_feedback (
  match_id INT NOT NULL,
  user_id INT NOT NULL,
  teams_balance ENUM('balanced','so_so','unbalanced') NULL,
  organizer_rating TINYINT UNSIGNED NULL,
  field_rating TINYINT UNSIGNED NULL,
  comment VARCHAR(500) NULL,
  -- "Ahora no": no se vuelve a pedir para este partido, sin contar como respuesta.
  dismissed TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (match_id, user_id),
  KEY idx_match_feedback_created (created_at),
  CONSTRAINT fk_match_feedback_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE social_notifications MODIFY type ENUM(
  'friend_request','friend_accepted','match_invitation','group_invitation',
  'match_cancelled','match_updated','easypass_gift',
  'post_match_summary','unclaimed_tickets','easypoints_reward',
  'slot_alert','reactivation','idle_balance'
) NOT NULL;
