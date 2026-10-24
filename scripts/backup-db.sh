#!/usr/bin/env bash
# Create a verifiable, optionally encrypted PostgreSQL backup for EduNet.
#
# Required:
#   DATABASE_URL            postgres connection string (never printed)
# Optional:
#   BACKUP_DIR              destination directory (default: ./backups)
#   KEEP_DAYS               prune archives older than N days (default: 30, 0 disables)
#   BACKUP_PASSPHRASE_FILE  encrypt with AES-256-CBC/PBKDF2 (recommended)
#   BACKUP_LABEL            short label included in the manifest (no PII)
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/ops.sh
source "$script_dir/lib/ops.sh"

[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is required"

for command in pg_dump pg_restore sha256sum; do
  require_command "$command"
done

umask 077
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="$BACKUP_DIR/edunet-$timestamp"
plain="$base.dump"

log "writing PostgreSQL custom-format archive"
pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$plain"

log "verifying archive structure"
pg_restore --list "$plain" >/dev/null

archive="$(encrypt_archive "$plain")"
checksum="$(sha256_of "$archive")"
printf '%s\n' "$checksum" > "${archive}.sha256"

pg_version="$(pg_dump --version | tr -d '\n')"
cat > "${archive}.meta" <<META
{
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "archive": "$(basename "$archive")",
  "encrypted": $( [[ "$archive" == *.enc ]] && printf true || printf false ),
  "format": "postgres-custom",
  "bytes": $(wc -c < "$archive" | tr -d ' '),
  "sha256": "$checksum",
  "pgDumpVersion": "$pg_version",
  "label": "${BACKUP_LABEL:-}"
}
META

log "archive: $archive"
log "checksum: ${archive}.sha256"
log "manifest: ${archive}.meta"

if [[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] && (( KEEP_DAYS > 0 )); then
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'edunet-*.dump*' -mtime "+$KEEP_DAYS" -delete
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'edunet-*.sha256' -mtime "+$KEEP_DAYS" -delete
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'edunet-*.meta' -mtime "+$KEEP_DAYS" -delete
  log "pruned archives older than $KEEP_DAYS days"
fi

log "backup complete"
