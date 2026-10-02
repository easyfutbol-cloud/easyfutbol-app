-- El ENUM de social_notifications.type se quedó corto: varios tipos que ya
-- usa el código (match_cancelled, match_updated, easypass_gift) no estaban
-- en la lista original, así que esas notificaciones fallaban o se guardaban
-- con el tipo vacío según el sql_mode del servidor, y de paso se saltaban la
-- preferencia del usuario (createSocialNotification solo la comprueba si
-- reconoce el tipo). Se amplía con esos tres y con los dos nuevos de esta
-- entrega (resumen tras el partido, entradas sin asignar).
ALTER TABLE social_notifications MODIFY type ENUM(
  'friend_request','friend_accepted','match_invitation','group_invitation',
  'match_cancelled','match_updated','easypass_gift',
  'post_match_summary','unclaimed_tickets'
) NOT NULL;
