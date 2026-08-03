# Despliegue seguro del backend

Los directorios `uploads/` y `backups/` son datos persistentes del VPS y están
ignorados por Git. No deben guardarse con `git stash --include-untracked` ni
eliminarse durante un despliegue.

## Recuperar los avatares del stash actual

Desde la raíz del repositorio del VPS, inspecciona primero el contenido:

```bash
git stash list
git stash show --include-untracked --name-only 'stash@{0}'
```

Si `stash@{0}` es `respaldo-vps-antes-de-actualizar`, recupera solamente los
datos persistentes guardados como archivos no versionados:

```bash
git restore --source='stash@{0}^3' -- easyfutbol-backend/uploads easyfutbol-backend/backups
```

Comprueba que los avatares han vuelto antes de eliminar el stash:

```bash
find easyfutbol-backend/uploads/avatars -type f | wc -l
git status --short
```

No ejecutes `git stash pop`: también recuperaría código antiguo y migraciones.
Conserva el stash hasta verificar visualmente varios avatares en la aplicación.

## Desplegar

```bash
cd /home/ubuntu/easyfutbol-app/easyfutbol-backend
./scripts/deploy-production.sh
```

El script se detiene si encuentra cambios versionados, pruebas fallidas,
migraciones pendientes o un healthcheck incorrecto. Las migraciones pendientes
se aplican deliberadamente por separado con `npm run migrate`, después de tener
una copia de seguridad válida.

## Copias de seguridad

Prueba manualmente la copia antes de programarla:

```bash
cd /home/ubuntu/easyfutbol-app/easyfutbol-backend
npm run ops:backup
gzip -t backups/database/$(ls -1t backups/database | head -1)
```

Por defecto conserva 14 días. Se puede cambiar con `BACKUP_RETENTION_DAYS` y
guardar fuera del repositorio con `BACKUP_DIR`. Para ejecutarla cada madrugada:

```cron
15 3 * * * cd /home/ubuntu/easyfutbol-app/easyfutbol-backend && /usr/bin/npm run ops:backup >> /home/ubuntu/easyfutbol-backups.log 2>&1
```

Una copia en el mismo VPS no protege frente a la pérdida completa del servidor.
Debe sincronizarse además con un almacenamiento externo cifrado.

## Monitorización

El endpoint `/api/health` comprueba MySQL y los programadores de recordatorios,
lista de espera, publicación de partidos y clasificación competitiva.

```bash
npm run ops:monitor
```

Para ejecutarlo cada cinco minutos:

```cron
*/5 * * * * cd /home/ubuntu/easyfutbol-app/easyfutbol-backend && /usr/bin/npm run ops:monitor >> /home/ubuntu/easyfutbol-monitor.log 2>&1
```

Si se configura `MONITOR_ALERT_WEBHOOK_URL`, los fallos también se envían por
HTTP al webhook indicado.
