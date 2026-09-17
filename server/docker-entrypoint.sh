#!/bin/sh
set -e

# ===========================================================================
#  DÉMARRAGE DU SERVEUR — migrations, puis abandon des privilèges.
#
#  Le conteneur DÉMARRE root, et ne le reste pas. Ce n'est pas une facilité :
#  c'est le seul moyen d'ajuster un volume que l'hôte nous impose.
#
#  `uploads/` est monté depuis l'hôte. Sur une instance installée avant cette
#  version, il appartient à root — parce que le conteneur tournait root. Passer
#  l'application en utilisateur ordinaire sans rien faire d'autre casserait
#  l'envoi de photos au premier déploiement, silencieusement et en production.
#  On corrige donc la propriété du volume si besoin, puis on rend la main.
#
#  POURQUOI CELA COMPTE : c'est ce processus qui décode des images fournies par
#  l'extérieur (sharp/libheif, dont l'historique de CVE n'est pas vide). Qu'il
#  tourne sans privilèges change ce qu'une faille de décodeur permet d'atteindre.
#
#  `exec su-exec` REMPLACE le processus : node devient PID 1 et reçoit donc
#  SIGTERM directement, ce qui préserve l'arrêt propre écrit dans `index.ts`
#  (un `su` ordinaire aurait interposé un shell, et les requêtes en vol
#  seraient à nouveau coupées net au déploiement).
# ===========================================================================

APP_USER=node
UPLOADS=/app/uploads

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$UPLOADS"
  # Comparer AVANT de chown : `uploads/` peut contenir des dizaines de milliers
  # de photos, et un chown récursif à chaque démarrage retarderait le service
  # pour rien. On ne paie ce prix qu'une fois, à la migration.
  if [ "$(stat -c %u "$UPLOADS")" != "$(id -u "$APP_USER")" ]; then
    echo "→ Reprise du dossier uploads/ pour l'utilisateur $APP_USER (une seule fois)"
    chown -R "$APP_USER:$APP_USER" "$UPLOADS"
  fi
  RUN_AS="su-exec $APP_USER"
else
  # Déjà non-root (compose avec `user:`, ou un orchestrateur qui l'impose) :
  # on ne cherche pas à reprendre le volume, on s'en remet à l'hôte.
  RUN_AS=""
fi

echo "→ Migrations de la base…"
$RUN_AS node dist/db/migrate.js

echo "→ Démarrage de l'API Racontine (utilisateur : $(id -un ${RUN_AS:+$APP_USER}))"
exec $RUN_AS node dist/index.js
