-- El evento MVP no tiene minuto (no ocurre en un momento concreto del
-- partido), pero la columna se creó como NOT NULL — bloqueaba en silencio
-- el guardado del MVP. La dejamos opcional.
ALTER TABLE match_live_events MODIFY minute SMALLINT UNSIGNED NULL;
