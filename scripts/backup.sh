#!/usr/bin/env bash
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

DUMP="$DEST/base.dump"
if [ "$MODE" = "url" ]; then
  pg_dump --format=custom --no-owner --no-privileges --file="$DUMP" "$DATABASE_URL"
else
  compose exec -T "$DB_SERVICE" \
    pg_dump --format=custom --no-owner --no-privileges \
      -U "${POSTGRES_USER:-racontine}" "${POSTGRES_DB:-racontine}" > "$DUMP"
fi

PHOTOS="$DEST/uploads.tar.gz"
if [ -d "./uploads" ]; then
  tar -czf "$PHOTOS" -C . uploads
else
  echo "  … aucun dossier uploads/ — rien à archiver de ce côté"
  PHOTOS=""
fi

echo "→ Relecture de ce qui vient d'être écrit"
list_dump() {
  if [ "$MODE" = "url" ]; then pg_restore --list "$DUMP"
  else compose exec -T "$DB_SERVICE" pg_restore --list < "$DUMP"; fi
}
if ! LISTING=$(list_dump 2>"$DEST/relecture.err"); then
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
