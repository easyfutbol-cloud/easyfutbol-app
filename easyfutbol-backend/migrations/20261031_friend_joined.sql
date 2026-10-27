-- Aviso "tu amigo se ha apuntado a un partido".
ALTER TABLE social_notifications MODIFY type ENUM(
  'friend_request','friend_accepted','match_invitation','group_invitation',
  'match_cancelled','match_updated','easypass_gift',
  'post_match_summary','unclaimed_tickets','easypoints_reward',
  'slot_alert','reactivation','idle_balance','friend_joined'
) NOT NULL;
