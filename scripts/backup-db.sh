#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
set -a
source "$ROOT_DIR/.env"
set +a

: "${DB_PORT:?DB_PORT is required}"
: "${DB_NAME:?DB_NAME is required}"
: "${DB_MIGRATOR_USER:?DB_MIGRATOR_USER is required}"
: "${DB_MIGRATOR_PASSWORD:?DB_MIGRATOR_PASSWORD is required}"

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT="$BACKUP_DIR/${DB_NAME}_${STAMP}.sql"

MYSQL_PWD="$DB_MIGRATOR_PASSWORD" mysqldump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_MIGRATOR_USER" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  "$DB_NAME" > "$OUTPUT"

chmod 600 "$OUTPUT"
printf 'Backup dibuat: %s\n' "$OUTPUT"
