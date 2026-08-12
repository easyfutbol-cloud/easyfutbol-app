CREATE TABLE IF NOT EXISTS user_match_preferences (
  user_id INT NOT NULL,
  available_days JSON NOT NULL,
  time_slots JSON NOT NULL,
  location_ids JSON NOT NULL,
  positions JSON NOT NULL,
  recommendations_enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_match_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
