# Sistema social de EasyFutbol

## Despliegue

1. Haz una copia de seguridad de MySQL.
2. Ejecuta `npm run migrate:dry-run` y comprueba que `20260804_social_system.sql` aparece pendiente.
3. Ejecuta `npm run migrate`.
4. Reinicia la API con sus variables actuales y consulta `/api/health`.
5. Publica una compilación móvil que incluya las nuevas rutas `Social`, `PlayerSocialProfile` y `FriendGroupDetail`.

La migración crea amistades, grupos, miembros, invitaciones y notificaciones. Dos triggers marcan una invitación como aceptada cuando aparece o se confirma la inscripción correspondiente.

## API

Todas las rutas usan JWT y cuelgan de `/api/social`:

- `GET /summary`, `/friends`, `/requests/received`, `/requests/sent`
- `POST /requests`; `PATCH /requests/:id/accept|reject`; `DELETE /requests/:id`, `/friends/:userId`
- `GET /users/search`, `/users/:id/status`, `/users/:id/stats`, `/best-teammates`, `/frequent-players`
- CRUD de `/groups` y miembros; `POST /groups/:id/invite-match/:matchId`
- `GET /matches/:id/friends`; `POST /matches/:id/invitations`; `GET /match-invitations`
- `GET /notifications`; `PATCH /notifications/:id/read`

Los lotes admiten un máximo de 30 destinatarios. El servidor comprueba amistad, inscripción previa, fecha, estado y aforo del partido.

## Estadísticas

La compatibilidad utiliza resultados compartidos, volumen, actualidad, rachas y antigüedad de amistad. Aplica una corrección de confianza para no presentar un porcentaje extremo con pocos partidos. No utiliza goles ni asistencias. Cuando no existe información fiable de equipos, el encuentro cuenta como compartido pero queda clasificado como `unknown_team`.

## Rollback

Solo si el sistema social no contiene datos que deban conservarse, ejecuta manualmente `migrations/rollback/20260804_social_system.rollback.sql`. El rollback elimina exclusivamente objetos sociales.
