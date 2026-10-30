-- "Vídeo subido": el admin marca que el vídeo del partido ya está publicado y
-- se avisa a los jugadores que fueron. Guardamos cuándo para no repetir aviso.
SET @sql_matches_video = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matches' AND COLUMN_NAME = 'video_available_at') > 0,
  'SELECT 1',
  'ALTER TABLE matches ADD COLUMN video_available_at DATETIME NULL'
);
PREPARE stmt_matches_video FROM @sql_matches_video;
EXECUTE stmt_matches_video;
DEALLOCATE PREPARE stmt_matches_video;

ALTER TABLE social_notifications MODIFY type ENUM(
  'friend_request','friend_accepted','match_invitation','group_invitation',
  'match_cancelled','match_updated','easypass_gift',
  'post_match_summary','unclaimed_tickets','easypoints_reward',
  'slot_alert','reactivation','idle_balance','friend_joined','profile_reaction',
  'match_video'
) NOT NULL;
