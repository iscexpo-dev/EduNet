#!/usr/bin/env bash
# Create a verifiable PostgreSQL backup for EduNet.
#
# Required:
#   DATABASE_URL   postgres connection string (never printed)
# Optional:
#   BACKUP_DIR     destination directory (default: ./backups)
#   KEEP_DAYS      prune backups older than N days (default: 30, 0 disables)
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "error: DATABASE_URL is required" >&2
  exit 1
fi

for command in pg_dump pg_restore sha256sum; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "error: $command is not installed" >&2
    exit 1
  fi
done

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/edunet-$timestamp.dump"

echo "writing $file"
pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$file"

echo "verifying archive"
pg_restore --list "$file" >/dev/null

sha256sum "$file" | awk '{print $1}' > "$file.sha256"
echo "checksum $file.sha256"

if [[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] && (( KEEP_DAYS > 0 )); then
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'edunet-*.dump' -mtime "+$KEEP_DAYS" -delete
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'edunet-*.dump.sha256' -mtime "+$KEEP_DAYS" -delete
  echo "pruned backups older than $KEEP_DAYS days"
fi

echo "backup complete"
