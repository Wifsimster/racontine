#!/bin/sh
set -e

APP_USER=node
UPLOADS=/app/uploads

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$UPLOADS"
  if [ "$(stat -c %u "$UPLOADS")" != "$(id -u "$APP_USER")" ]; then
    echo "→ Reprise du dossier uploads/ pour l'utilisateur $APP_USER (une seule fois)"
    chown -R "$APP_USER:$APP_USER" "$UPLOADS"
  fi
  RUN_AS="su-exec $APP_USER"
else
  RUN_AS=""
fi

echo "→ Migrations de la base…"
$RUN_AS node dist/db/migrate.js

echo "→ Démarrage de l'API Racontine (utilisateur : $(id -un ${RUN_AS:+$APP_USER}))"
exec $RUN_AS node dist/index.js
