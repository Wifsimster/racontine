#!/usr/bin/env bash
# ===========================================================================
#  SAUVEGARDER RACONTINE — la base ET les photos, en une commande.
#
#  Le carnet d'un enfant tient dans DEUX endroits, et il faut les deux :
#
#    · la BASE — les journées, les récits, le cercle, les abonnements. Sans
#      elle, les photos sont un dossier de JPEG sans date et sans nom.
#    · les PHOTOS (`uploads/`) — les pages du carnet. Sans elles, la base
#      décrit des journées dont la source a disparu ; la route des pièces
#      jointes répond « fichier absent », définitivement.
#
#  Sauvegarder l'une sans l'autre, c'est ne rien sauvegarder. Elles partent
#  donc ensemble, dans le même dossier daté, avec un manifeste qui dit ce
#  qu'il contient et de quelle version il vient.
#
#  POURQUOI MAINTENANT. Les migrations s'appliquent AU DÉMARRAGE du serveur,
#  donc à chaque déploiement, donc à chaque merge sur `main`. Une migration
#  qui se passe mal sur une base non sauvegardée, c'est le journal de
#  l'enfance de quelqu'un, perdu — il n'y a pas de corbeille et pas de
#  deuxième exemplaire.
#
#  UNE SAUVEGARDE NON VÉRIFIÉE N'EST PAS UNE SAUVEGARDE. Ce script relit donc
#  toujours ce qu'il vient d'écrire (`pg_restore --list`, `tar -t`) et échoue
#  bruyamment si l'archive est illisible — le moment de le découvrir, c'est
#  maintenant, pas le jour où on restaure.
#
#  USAGE
#    ./scripts/backup.sh                      # → ./backups/AAAA-MM-JJ-HHMMSS/
#    ./scripts/backup.sh -o /mnt/nas/racontine
#    ./scripts/backup.sh -k 30                # garder 30 jours (défaut : 14)
#    ./scripts/backup.sh -f docker-compose.prod.yml
#    DATABASE_URL=postgres://… ./scripts/backup.sh   # sans Docker (dev)
#
#  CRON (homelab) — tous les jours à 3h15, avant que personne ne se lève :
#    15 3 * * * cd /opt/docker/racontine && ./scripts/backup.sh -o /mnt/nas/racontine >> /var/log/racontine-backup.log 2>&1
#
#  CE QU'IL NE FAIT PAS : partir de la machine. Une sauvegarde qui dort sur le
#  disque qu'elle sauvegarde ne survit pas à ce disque. Donnez-lui `-o` vers un
#  montage distant, ou recopiez le dossier ailleurs après coup.
# ===========================================================================
set -euo pipefail

OUT_DIR="./backups"
KEEP_DAYS=14
COMPOSE_FILE=""
DB_SERVICE="db"

usage() { sed -n '2,45p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    -o|--out)     OUT_DIR="$2"; shift 2 ;;
    -k|--keep)    KEEP_DAYS="$2"; shift 2 ;;
    -f|--file)    COMPOSE_FILE="$2"; shift 2 ;;
    -s|--service) DB_SERVICE="$2"; shift 2 ;;
    -h|--help)    usage 0 ;;
    *) echo "Option inconnue : $1" >&2; usage 1 ;;
  esac
done

case "$KEEP_DAYS" in
  ''|*[!0-9]*) echo "✗ --keep attend un nombre de jours (reçu : $KEEP_DAYS)" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."

# ── Comment joindre la base ────────────────────────────────────────────────
# Deux mondes, et on ne devine pas : si DATABASE_URL est posée, on s'en sert
# telle quelle (développement, ou base hors du compose) ; sinon on parle au
# service `db` du compose, qui est le cas du homelab. Dans les deux cas, c'est
# `pg_dump` DE LA BASE qui travaille — jamais celui de la machine hôte, dont la
# version peut être plus ancienne que le serveur et produire un dump refusé.
compose() {
  if [ -n "$COMPOSE_FILE" ]; then docker compose -f "$COMPOSE_FILE" "$@"
  else docker compose "$@"; fi
}

if [ -n "${DATABASE_URL:-}" ]; then
  MODE="url"
elif command -v docker >/dev/null 2>&1 && compose ps --status running "$DB_SERVICE" 2>/dev/null | grep -q "$DB_SERVICE"; then
  MODE="compose"
else
  echo "✗ Aucune base joignable." >&2
  echo "  Démarrez la pile (docker compose up -d db) ou posez DATABASE_URL." >&2
  exit 1
fi

STAMP="$(date +%Y-%m-%d-%H%M%S)"
DEST="$OUT_DIR/$STAMP"
mkdir -p "$DEST"

echo "→ Sauvegarde Racontine dans $DEST (source : $MODE)"

# ── 1. La base ─────────────────────────────────────────────────────────────
# Format « custom » (-Fc) et non du SQL brut : il est compressé, il se relit
# avec `pg_restore --list` (c'est notre vérification), et il permet de
# restaurer une seule table le jour où c'est une seule table qu'on a perdue.
DUMP="$DEST/base.dump"
if [ "$MODE" = "url" ]; then
  pg_dump --format=custom --no-owner --no-privileges --file="$DUMP" "$DATABASE_URL"
else
  # `exec -T` : pas de TTY, sinon Docker injecte des retours chariot dans le
  # flux binaire et le dump devient illisible — une panne qui ne se voit qu'à
  # la restauration.
  compose exec -T "$DB_SERVICE" \
    pg_dump --format=custom --no-owner --no-privileges \
      -U "${POSTGRES_USER:-racontine}" "${POSTGRES_DB:-racontine}" > "$DUMP"
fi

# ── 2. Les photos ──────────────────────────────────────────────────────────
# `uploads/` peut peser des gigaoctets : on tarre en flux, sans copie
# intermédiaire. Absent (instance neuve) n'est pas une erreur.
PHOTOS="$DEST/uploads.tar.gz"
if [ -d "./uploads" ]; then
  tar -czf "$PHOTOS" -C . uploads
else
  echo "  … aucun dossier uploads/ — rien à archiver de ce côté"
  PHOTOS=""
fi

# ── 3. La vérification, sans laquelle rien de tout cela ne vaut ────────────
echo "→ Relecture de ce qui vient d'être écrit"
# Relu par le `pg_restore` DE LA BASE, comme il a été écrit par son `pg_dump` :
# celui de l'hôte peut manquer, ou être trop ancien pour lire l'en-tête d'un
# dump récent — et la sauvegarde, parfaitement valide, était alors SUPPRIMÉE.
list_dump() {
  if [ "$MODE" = "url" ]; then pg_restore --list "$DUMP"
  else compose exec -T "$DB_SERVICE" pg_restore --list < "$DUMP"; fi
}
if ! LISTING=$(list_dump 2>"$DEST/relecture.err"); then
  # L'outil de relecture a échoué : on ne sait RIEN du dump. On le garde (il
  # est peut-être bon) et on échoue bruyamment plutôt que de l'effacer.
  echo "✗ Relecture impossible — la sauvegarde est CONSERVÉE mais NON VÉRIFIÉE :" >&2
  sed 's/^/    /' "$DEST/relecture.err" >&2
  exit 1
fi
rm -f "$DEST/relecture.err"
TABLES=$(printf '%s\n' "$LISTING" | grep -c "TABLE DATA" || true)
if [ "${TABLES:-0}" -lt 1 ]; then
  echo "✗ Le dump ne contient aucune table : sauvegarde INVALIDE, elle est supprimée." >&2
  rm -rf "$DEST"
  exit 1
fi
echo "  ✓ base : $TABLES tables relues dans le dump"

FILES=0
if [ -n "$PHOTOS" ]; then
  FILES=$(tar -tzf "$PHOTOS" | grep -c '\.jpg$' || true)
  echo "  ✓ photos : $FILES fichiers relus dans l'archive"
fi

# ── 4. Le manifeste ────────────────────────────────────────────────────────
# Une archive sans étiquette est une archive qu'on n'ose pas restaurer. Celle-ci
# dit d'où elle vient et ce qu'elle contient.
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "inconnue")
if [ -n "$PHOTOS" ]; then
  PHOTOS_LINE="uploads.tar.gz ($(du -h "$PHOTOS" | cut -f1))"
else
  PHOTOS_LINE="absent"
fi
cat > "$DEST/manifeste.txt" <<EOF
Racontine — sauvegarde
date        : $(date -Iseconds)
version     : $VERSION
source      : $MODE
machine     : $(hostname)
tables      : $TABLES
photos      : $FILES
base        : base.dump ($(du -h "$DUMP" | cut -f1))
uploads     : $PHOTOS_LINE

Restauration : ./scripts/restore.sh $DEST
EOF

# ── 5. La rétention ────────────────────────────────────────────────────────
# On ne supprime QUE des dossiers qui portent la forme d'un horodatage produit
# ici : `-o` peut pointer un montage partagé, et un script de sauvegarde n'a
# aucune excuse pour effacer ce qu'il n'a pas écrit.
if [ "$KEEP_DAYS" -gt 0 ]; then
  PURGED=0
  while IFS= read -r old; do
    rm -rf "$old"
    PURGED=$((PURGED + 1))
  done < <(find "$OUT_DIR" -mindepth 1 -maxdepth 1 -type d \
             -name '20[0-9][0-9]-[0-1][0-9]-[0-3][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]' \
             -mtime "+$KEEP_DAYS" 2>/dev/null || true)
  [ "$PURGED" -gt 0 ] && echo "  · $PURGED sauvegarde(s) de plus de $KEEP_DAYS jours retirée(s)"
fi

echo "✓ Sauvegarde terminée : $DEST ($(du -sh "$DEST" | cut -f1))"
