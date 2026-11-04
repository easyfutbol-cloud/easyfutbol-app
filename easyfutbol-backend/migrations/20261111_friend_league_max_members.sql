-- Máximo de jugadores de cada liga: 20 para usuarios y el que elija el
-- administrador en las suyas. Las ligas de administradores que ya existen
-- conservan los 100 que tenían.
ALTER TABLE friend_leagues
  ADD COLUMN max_members SMALLINT UNSIGNED NOT NULL DEFAULT 20 AFTER team_size;

UPDATE friend_leagues l
JOIN users u ON u.id = l.owner_id
SET l.max_members = 100
WHERE u.role = 'admin' OR l.is_public = 1;
