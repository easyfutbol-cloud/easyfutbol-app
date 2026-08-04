CREATE TABLE IF NOT EXISTS friendships (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  requester_id INT NOT NULL,
  addressee_id INT NOT NULL,
  user_low_id INT GENERATED ALWAYS AS (LEAST(requester_id, addressee_id)) STORED,
  user_high_id INT GENERATED ALWAYS AS (GREATEST(requester_id, addressee_id)) STORED,
  status ENUM('pending','accepted','rejected','cancelled') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_friendship_pair (user_low_id, user_high_id),
  KEY idx_friendship_requester_status (requester_id, status, updated_at),
  KEY idx_friendship_addressee_status (addressee_id, status, updated_at),
  -- MySQL no permite CASCADE sobre columnas base usadas por columnas generadas.
  -- RESTRICT conserva la integridad y la pareja normalizada evita duplicados invertidos.
  CONSTRAINT fk_friendship_requester FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_friendship_addressee FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_friendship_not_self CHECK (requester_id <> addressee_id)
);

CREATE TABLE IF NOT EXISTS friend_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  image_url VARCHAR(255) NULL,
  owner_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_friend_group_owner (owner_id, updated_at),
  CONSTRAINT fk_friend_group_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS friend_group_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  role ENUM('owner','admin','member') NOT NULL DEFAULT 'member',
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_friend_group_member (group_id, user_id),
  KEY idx_friend_group_member_user (user_id, joined_at),
  CONSTRAINT fk_friend_group_member_group FOREIGN KEY (group_id) REFERENCES friend_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_friend_group_member_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_invitations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id INT NOT NULL,
  sender_id INT NOT NULL,
  receiver_id INT NOT NULL,
  group_id BIGINT UNSIGNED NULL,
  status ENUM('pending','viewed','accepted','declined','expired') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_invitation_sender_receiver (match_id, sender_id, receiver_id),
  KEY idx_match_invitation_receiver (receiver_id, status, updated_at),
  KEY idx_match_invitation_match (match_id, status),
  CONSTRAINT fk_match_invitation_match FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_invitation_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_invitation_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_match_invitation_group FOREIGN KEY (group_id) REFERENCES friend_groups(id) ON DELETE SET NULL,
  CONSTRAINT chk_match_invitation_not_self CHECK (sender_id <> receiver_id)
);

CREATE TABLE IF NOT EXISTS social_notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  actor_id INT NULL,
  type ENUM('friend_request','friend_accepted','match_invitation','group_invitation') NOT NULL,
  entity_type ENUM('user','friendship','match','group') NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(255) NOT NULL,
  data JSON NULL,
  dedupe_key VARCHAR(190) NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_social_notification_dedupe (dedupe_key),
  KEY idx_social_notification_user (user_id, read_at, created_at),
  CONSTRAINT fk_social_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_social_notification_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS trg_social_invitation_accepted_insert;
CREATE TRIGGER trg_social_invitation_accepted_insert
AFTER INSERT ON inscriptions FOR EACH ROW
UPDATE match_invitations
SET status='accepted', updated_at=NOW()
WHERE match_id=NEW.match_id AND receiver_id=NEW.user_id
  AND NEW.status IN ('pending','confirmed') AND status IN ('pending','viewed');

DROP TRIGGER IF EXISTS trg_social_invitation_accepted_update;
CREATE TRIGGER trg_social_invitation_accepted_update
AFTER UPDATE ON inscriptions FOR EACH ROW
UPDATE match_invitations
SET status='accepted', updated_at=NOW()
WHERE match_id=NEW.match_id AND receiver_id=NEW.user_id
  AND NEW.status IN ('pending','confirmed') AND status IN ('pending','viewed');

-- Rollback manual (solo si nunca se desplegaron datos sociales):
-- DROP TABLE social_notifications;
-- DROP TABLE match_invitations;
-- DROP TABLE friend_group_members;
-- DROP TABLE friend_groups;
-- DROP TABLE friendships;
