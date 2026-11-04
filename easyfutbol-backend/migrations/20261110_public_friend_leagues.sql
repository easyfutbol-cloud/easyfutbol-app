-- Ligas públicas: las crea un administrador, cualquiera puede verlas y unirse,
-- y join_code es lo que va en el enlace de unión (/liga/<código>).
ALTER TABLE friend_leagues
  ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN join_code VARCHAR(16) NULL AFTER is_public,
  ADD UNIQUE KEY uq_friend_leagues_join_code (join_code),
  ADD KEY idx_friend_leagues_public (is_public, status);
