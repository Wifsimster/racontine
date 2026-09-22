#!/usr/bin/env bash
# ===========================================================================
#  RESTAURER RACONTINE — remettre la base et les photos d'aplomb.
#
#  Le pendant de `backup.sh`, et la seule preuve qu'il servait à quelque chose :
#  une sauvegarde qu'on n'a jamais restaurée est une sauvegarde dont on ignore
#  si elle marche. Essayez-la une fois, sur une base jetable, avant d'en avoir
#  besoin pour de vrai.
#
#  CE SCRIPT DÉTRUIT. Il remplace le contenu de la base visée et le dossier
#  `uploads/` par ce que porte la sauvegarde. Il demande donc confirmation, et
#  il met d'abord de côté les photos qu'il s'apprête à écraser (`uploads.avant-
#  restauration-…`) : se tromper de sauvegarde est une erreur banale, la payer
#  d'un dossier de photos ne doit pas l'être.
#
#  USAGE
#    ./scripts/restore.sh ./backups/2026-09-17-031500
#    ./scripts/restore.sh -f docker-compose.prod.yml ./backups/…
#    ./scripts/restore.sh -y ./backups/…              # sans confirmation (cron)
#    DATABASE_URL=postgres://… ./scripts/restore.sh ./backups/…
#
#  APRÈS : redémarrez le serveur (`docker compose up -d server`). Il applique
#  les migrations au démarrage — une sauvegarde plus ancienne que le code sera
#  donc remise à niveau toute seule. L'inverse n'est pas vrai : une sauvegarde
#  PLUS RÉCENTE que le code déployé ne se restaure pas proprement, il faut
#  d'abord remettre l'image de la même version (voir `manifeste.txt`).
# ===========================================================================
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

SRC="$(cd "$SRC" && pwd)"   # avant le `cd` ci-dessous, sinon un chemin relatif se perd
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

# On relit AVANT de détruire quoi que ce soit : une archive illisible doit
# arrêter le geste tant qu'il est encore temps. Relue par le `pg_restore` qui
# va restaurer (celui de la base en mode compose) : celui de l'hôte peut
# manquer ou être trop ancien, et refusait alors toute archive.
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

# ── 1. La base ─────────────────────────────────────────────────────────────
# `--clean --if-exists` remet les objets à zéro sans exiger une base vierge.
# On NE passe PAS `--exit-on-error` : pg_restore se plaint des DROP d'objets
# absents sur une base neuve, ce qui est normal et sans conséquence. Ce qui
# compte est vérifié après coup, en comptant ce qui est réellement arrivé.
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

# ── 2. Les photos ──────────────────────────────────────────────────────────
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

# ── 3. Ce qui est revenu ───────────────────────────────────────────────────
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
