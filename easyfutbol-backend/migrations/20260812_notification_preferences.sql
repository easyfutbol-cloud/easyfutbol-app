CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id INT NOT NULL,
  social_enabled TINYINT(1) NOT NULL DEFAULT 1,
  match_updates_enabled TINYINT(1) NOT NULL DEFAULT 1,
  match_reminders_enabled TINYINT(1) NOT NULL DEFAULT 1,
  easypass_enabled TINYINT(1) NOT NULL DEFAULT 1,
  news_enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_notification_preferences_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
