#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY_DIR="${EASYFUTBOL_REPOSITORY_DIR:-/home/ubuntu/easyfutbol-app}"
BACKEND_DIR="$REPOSITORY_DIR/easyfutbol-backend"
PM2_APP="${EASYFUTBOL_PM2_APP:-easyfutbol-api}"
LOCAL_HEALTH_URL="${EASYFUTBOL_LOCAL_HEALTH_URL:-http://127.0.0.1:4000/api/health}"
PUBLIC_HEALTH_URL="${EASYFUTBOL_PUBLIC_HEALTH_URL:-https://api.easyfutbol.es/api/health}"

cd "$REPOSITORY_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Despliegue detenido: hay cambios versionados sin guardar en el VPS."
  git status --short
  exit 1
fi

echo "Actualizando código con avance rápido..."
git pull --ff-only origin main

cd "$BACKEND_DIR"
echo "Instalando dependencias reproducibles..."
npm ci --omit=dev

echo "Verificando código y migraciones..."
npm test
npm run migrate:verify

MIGRATION_STATUS="$(npm run migrate:status)"
echo "$MIGRATION_STATUS"
if echo "$MIGRATION_STATUS" | grep -Eq '[1-9][0-9]* migración\(es\) pendiente'; then
  echo "Despliegue detenido: aplica y revisa las migraciones antes de reiniciar PM2."
  exit 1
fi

echo "Reiniciando $PM2_APP..."
pm2 restart "$PM2_APP" --update-env

echo "Comprobando API local..."
curl --fail --silent --show-error --retry 5 --retry-delay 2 "$LOCAL_HEALTH_URL"
echo

echo "Comprobando API pública..."
curl --fail --silent --show-error --retry 5 --retry-delay 2 "$PUBLIC_HEALTH_URL"
echo

echo "Despliegue completado correctamente."

