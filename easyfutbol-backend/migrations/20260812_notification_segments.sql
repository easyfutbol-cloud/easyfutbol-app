ALTER TABLE notification_campaigns
  MODIFY COLUMN target_type ENUM('city','match','user','segment') NOT NULL;
