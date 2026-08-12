ALTER TABLE notification_campaigns
  ADD COLUMN status ENUM('draft','scheduled','sending','sent','cancelled','failed') NOT NULL DEFAULT 'sent' AFTER body,
  ADD COLUMN scheduled_at DATETIME NULL AFTER status,
  ADD COLUMN claimed_at DATETIME NULL AFTER scheduled_at,
  ADD COLUMN sent_at DATETIME NULL AFTER claimed_at,
  ADD COLUMN failure_message VARCHAR(500) NULL AFTER rejected_count,
  ADD KEY idx_notification_campaign_schedule (status, scheduled_at);

UPDATE notification_campaigns SET sent_at=created_at WHERE status='sent' AND sent_at IS NULL;
