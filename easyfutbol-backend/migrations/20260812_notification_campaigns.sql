CREATE TABLE IF NOT EXISTS notification_campaigns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_by INT NULL,
  target_type ENUM('city','match','user') NOT NULL,
  target_id VARCHAR(100) NOT NULL,
  target_name VARCHAR(190) NOT NULL,
  title VARCHAR(65) NOT NULL,
  body VARCHAR(220) NOT NULL,
  token_count INT UNSIGNED NOT NULL DEFAULT 0,
  accepted_count INT UNSIGNED NOT NULL DEFAULT 0,
  rejected_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notification_campaign_created (created_at),
  CONSTRAINT fk_notification_campaign_admin FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE push_delivery_receipts
  ADD COLUMN campaign_id BIGINT UNSIGNED NULL AFTER id,
  ADD KEY idx_push_delivery_campaign (campaign_id),
  ADD CONSTRAINT fk_push_delivery_campaign FOREIGN KEY (campaign_id) REFERENCES notification_campaigns(id) ON DELETE SET NULL;
