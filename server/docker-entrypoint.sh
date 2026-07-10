#!/bin/sh
set -e

# Applique les migrations avant de démarrer l'API (idempotent).
echo "→ Migrations de la base…"
node dist/db/migrate.js

echo "→ Démarrage de l'API Racontine"
exec node dist/index.js
