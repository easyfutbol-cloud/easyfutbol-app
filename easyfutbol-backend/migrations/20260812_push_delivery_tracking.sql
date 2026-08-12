CREATE TABLE IF NOT EXISTS push_delivery_receipts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id VARCHAR(190) NULL,
  expo_push_token VARCHAR(255) NOT NULL,
  notification_type VARCHAR(64) NULL,
  status ENUM('queued','delivered','error') NOT NULL DEFAULT 'queued',
  error_code VARCHAR(80) NULL,
  error_message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_delivery_ticket (ticket_id),
  KEY idx_push_delivery_pending (status, created_at),
  KEY idx_push_delivery_created (created_at)
);
