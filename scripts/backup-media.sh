#!/usr/bin/env bash
# Archive the private media volume. Media is not part of the database dump.
#
# Required:
#   MEDIA_STORAGE_PATH
# Optional:
#   BACKUP_DIR, KEEP_DAYS, BACKUP_PASSPHRASE_FILE
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/ops.sh
source "$script_dir/lib/ops.sh"

[[ -n "${MEDIA_STORAGE_PATH:-}" ]] || die "MEDIA_STORAGE_PATH is required"
[[ -d "$MEDIA_STORAGE_PATH" ]] || die "MEDIA_STORAGE_PATH is not a directory"
for command in tar sha256sum; do require_command "$command"; done

umask 077
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="$BACKUP_DIR/edunet-media-$timestamp"
plain="$base.tar.gz"

log "archiving media from $MEDIA_STORAGE_PATH"
tar -C "$MEDIA_STORAGE_PATH" -czf "$plain" .

archive="$(encrypt_archive "$plain")"
checksum="$(sha256_of "$archive")"
printf '%s\n' "$checksum" > "${archive}.sha256"
log "archive: $archive"
log "checksum: ${archive}.sha256"

if [[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] && (( KEEP_DAYS > 0 )); then
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'edunet-media-*.tar.gz*' -mtime "+$KEEP_DAYS" -delete
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'edunet-media-*.sha256' -mtime "+$KEEP_DAYS" -delete
fi

log "media backup complete"
