#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE=""
DB_SERVICE="db"
ASSUME_YES=0
SRC=""

usage() { sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    -f|--file)    COMPOSE_FILE="$2"; shift 2 ;;
    -s|--service) DB_SERVICE="$2"; shift 2 ;;
    -y|--yes)     ASSUME_YES=1; shift ;;
    -h|--help)    usage 0 ;;
    -*) echo "Option inconnue : $1" >&2; usage 1 ;;
    *) SRC="$1"; shift ;;
  esac
done

[ -n "$SRC" ] || { echo "✗ Indiquez le dossier de sauvegarde à restaurer." >&2; usage 1; }
[ -d "$SRC" ] || { echo "✗ Dossier introuvable : $SRC" >&2; exit 1; }

SRC="$(cd "$SRC" && pwd)"
cd "$(dirname "$0")/.."

DUMP="$SRC/base.dump"
PHOTOS="$SRC/uploads.tar.gz"
[ -f "$DUMP" ] || { echo "✗ Pas de base.dump dans $SRC" >&2; exit 1; }

compose() {
  if [ -n "$COMPOSE_FILE" ]; then docker compose -f "$COMPOSE_FILE" "$@"
  else docker compose "$@"; fi
}

if [ -n "${DATABASE_URL:-}" ]; then
  MODE="url"
elif command -v docker >/dev/null 2>&1 && compose ps --status running "$DB_SERVICE" 2>/dev/null | grep -q "$DB_SERVICE"; then
  MODE="compose"
else
  echo "✗ Aucune base joignable (démarrez la pile, ou posez DATABASE_URL)." >&2
  exit 1
fi

list_dump() {
  if [ "$MODE" = "url" ]; then pg_restore --list "$DUMP"
  else compose exec -T "$DB_SERVICE" pg_restore --list < "$DUMP"; fi
}
if ! LISTING=$(list_dump 2>&1); then
  echo "✗ Relecture de $DUMP impossible — on ne touche à rien :" >&2
  printf '%s\n' "$LISTING" | sed 's/^/    /' >&2
  exit 1
fi
TABLES=$(printf '%s\n' "$LISTING" | grep -c "TABLE DATA" || true)
[ "${TABLES:-0}" -ge 1 ] || { echo "✗ $DUMP est vide — on ne touche à rien." >&2; exit 1; }

echo "─────────────────────────────────────────────────────────────"
[ -f "$SRC/manifeste.txt" ] && cat "$SRC/manifeste.txt"
echo "─────────────────────────────────────────────────────────────"
echo "Cette restauration REMPLACE la base ($MODE) et le dossier uploads/."

if [ "$ASSUME_YES" -ne 1 ]; then
  printf "Taper « restaurer » pour confirmer : "
  read -r answer
  [ "$answer" = "restaurer" ] || { echo "Annulé — rien n'a été touché."; exit 0; }
fi

echo "→ Restauration de la base…"
if [ "$MODE" = "url" ]; then
  pg_restore --clean --if-exists --no-owner --no-privileges \
    --dbname="$DATABASE_URL" "$DUMP" 2>&1 | grep -v "^pg_restore: warning" || true
else
  compose exec -T "$DB_SERVICE" \
    pg_restore --clean --if-exists --no-owner --no-privileges \
      -U "${POSTGRES_USER:-racontine}" -d "${POSTGRES_DB:-racontine}" \
    < "$DUMP" 2>&1 | grep -v "^pg_restore: warning" || true
fi

if [ -f "$PHOTOS" ]; then
  if [ -d "./uploads" ]; then
    KEEP="uploads.avant-restauration-$(date +%Y%m%d-%H%M%S)"
    mv ./uploads "./$KEEP"
    echo "  · photos précédentes mises de côté dans ./$KEEP"
  fi
  echo "→ Restauration des photos…"
  tar -xzf "$PHOTOS" -C .
else
  echo "  … pas d'archive de photos dans cette sauvegarde — uploads/ est laissé tel quel"
fi

count_sql() {
  if [ "$MODE" = "url" ]; then psql -tAc "$1" "$DATABASE_URL" 2>/dev/null || echo "?"
  else compose exec -T "$DB_SERVICE" psql -tAc "$1" \
         -U "${POSTGRES_USER:-racontine}" "${POSTGRES_DB:-racontine}" 2>/dev/null || echo "?"; fi
}
ENTRIES=$(count_sql "select count(*) from entries" | tr -d '[:space:]')
CHILDREN=$(count_sql "select count(*) from children" | tr -d '[:space:]')
USERS=$(count_sql "select count(*) from \"user\"" | tr -d '[:space:]')

echo "✓ Restauré : $USERS compte(s), $CHILDREN carnet(s), $ENTRIES journée(s)"
echo "  Redémarrez le serveur pour qu'il applique les migrations :"
echo "    docker compose ${COMPOSE_FILE:+-f $COMPOSE_FILE }up -d server"
