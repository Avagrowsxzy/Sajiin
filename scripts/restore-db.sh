#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
set -a
source "$ROOT_DIR/.env"
set +a

: "${DB_HOST:?DB_HOST is required}"
: "${DB_PORT:?DB_PORT is required}"
: "${DB_NAME:?DB_NAME is required}"
: "${DB_MIGRATOR_USER:?DB_MIGRATOR_USER is required}"
: "${DB_MIGRATOR_PASSWORD:?DB_MIGRATOR_PASSWORD is required}"

if [[ "${1:-}" == "" || ! -f "$1" ]]; then
  printf 'Usage: %s <backup.sql>\n' "$0" >&2
  exit 2
fi

MYSQL_PWD="$DB_MIGRATOR_PASSWORD" mysql \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_MIGRATOR_USER" \
  "$DB_NAME" < "$1"

printf 'Restore selesai dari: %s\n' "$1"
