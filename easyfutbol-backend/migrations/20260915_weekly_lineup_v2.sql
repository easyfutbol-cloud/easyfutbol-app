-- "El 8 de la semana" v2: la posición "defensa" sustituye a central+lateral
-- (5 candidatos, se eligen 3, sin distinguir central de lateral), votación
-- multi-selección por posición (portero 1, defensa 3, centrocampista 2,
-- delantero 2 = 8), y ventana horaria fija (lunes 19:00 - miércoles 19:00).

-- 1) Ampliamos el enum de forma temporal para poder reasignar los datos existentes.
ALTER TABLE weekly_lineup_candidates
  MODIFY position ENUM('portero','central','lateral','defensa','centrocampista','delantero') NOT NULL;
ALTER TABLE weekly_lineup_votes
  MODIFY position ENUM('portero','central','lateral','defensa','centrocampista','delantero') NOT NULL;

-- 2) Migramos central/lateral -> defensa.
UPDATE weekly_lineup_candidates SET position='defensa' WHERE position IN ('central','lateral');
UPDATE weekly_lineup_votes SET position='defensa' WHERE position IN ('central','lateral');

-- 3) Dejamos el enum final, ya sin central/lateral.
ALTER TABLE weekly_lineup_candidates
  MODIFY position ENUM('portero','defensa','centrocampista','delantero') NOT NULL;
ALTER TABLE weekly_lineup_votes
  MODIFY position ENUM('portero','defensa','centrocampista','delantero') NOT NULL;

-- 4) Ventana horaria concreta de cada votación (antes solo teníamos la fecha del día).
ALTER TABLE weekly_lineup_polls
  ADD COLUMN scheduled_open_at DATETIME NULL AFTER week_end,
  ADD COLUMN scheduled_close_at DATETIME NULL AFTER scheduled_open_at;

-- 5) Ahora cada persona puede elegir varios candidatos por posición (antes solo uno),
-- así que el voto único pasa a ser por candidato, no por posición.
ALTER TABLE weekly_lineup_votes DROP INDEX uq_weekly_lineup_vote;
ALTER TABLE weekly_lineup_votes
  ADD UNIQUE KEY uq_weekly_lineup_vote (poll_id, position, user_id, candidate_id);
