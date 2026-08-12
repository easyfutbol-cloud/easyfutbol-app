ALTER TABLE users
  ADD COLUMN primary_position ENUM('goalkeeper','defender','midfielder','forward') NULL AFTER preferred_location,
  ADD COLUMN secondary_position ENUM('goalkeeper','defender','midfielder','forward') NULL AFTER primary_position,
  ADD COLUMN dominant_foot ENUM('right','left','both') NULL AFTER secondary_position;
