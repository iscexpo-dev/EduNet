#!/usr/bin/env bash
# Restore a backup into a disposable PostgreSQL database and verify core rows.
# Never point DRILL_DATABASE_URL at production.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$script_dir/lib/ops.sh"

archive="${1:-}"
[[ -n "$archive" && -f "$archive" ]] || die "usage: $0 <archive.dump[.enc]>"
[[ -n "${DRILL_DATABASE_URL:-}" ]] || die "DRILL_DATABASE_URL is required"
if [[ -n "${DATABASE_URL:-}" && "$DRILL_DATABASE_URL" == "$DATABASE_URL" ]]; then
  die "DRILL_DATABASE_URL must not equal DATABASE_URL"
fi

log "starting restore drill at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
CONFIRM_RESTORE=yes RESTORE_TARGET_KIND=disposable DATABASE_URL="$DRILL_DATABASE_URL" \
  "$script_dir/restore-db.sh" "$archive"
log "restore drill complete at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
