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

