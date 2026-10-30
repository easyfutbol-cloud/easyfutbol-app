-- Reacciones en el perfil (sustituyen a los comentarios): cada jugador puede
-- dar cada emoji una vez a otro perfil, y quitarlo. Los comentarios antiguos
-- se quedan en su tabla pero la API ya no los devuelve.
CREATE TABLE IF NOT EXISTS player_profile_reactions (
  profile_user_id INT NOT NULL,
  reactor_user_id INT NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (profile_user_id, reactor_user_id, emoji),
  KEY idx_player_profile_reactions_recent (profile_user_id, created_at),
  CONSTRAINT fk_player_profile_reactions_profile FOREIGN KEY (profile_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_player_profile_reactions_reactor FOREIGN KEY (reactor_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Aviso "X ha reaccionado a tu perfil" (máximo uno por persona y día).
ALTER TABLE social_notifications MODIFY type ENUM(
  'friend_request','friend_accepted','match_invitation','group_invitation',
  'match_cancelled','match_updated','easypass_gift',
  'post_match_summary','unclaimed_tickets','easypoints_reward',
  'slot_alert','reactivation','idle_balance','friend_joined','profile_reaction'
) NOT NULL;
