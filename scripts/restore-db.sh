#!/usr/bin/env bash
# Restore an EduNet PostgreSQL backup into an explicitly classified target.
#
# Usage:
#   CONFIRM_RESTORE=yes RESTORE_TARGET_KIND=disposable \
#     DATABASE_URL=... ./scripts/restore-db.sh backups/edunet-....dump[.enc]
#
# Production additionally requires ALLOW_PRODUCTION_RESTORE=yes and creates a
# pre-restore backup unless SKIP_PRE_RESTORE_BACKUP=yes is set.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/ops.sh
source "$script_dir/lib/ops.sh"

[[ "${CONFIRM_RESTORE:-}" == "yes" ]] || die "refusing to restore without CONFIRM_RESTORE=yes"
[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is required"
require_restore_authorization

archive="${1:-}"
[[ -n "$archive" && -f "$archive" ]] || die "usage: CONFIRM_RESTORE=yes RESTORE_TARGET_KIND=... DATABASE_URL=... $0 <archive.dump[.enc]>"

for command in pg_restore sha256sum; do
  require_command "$command"
done

verify_checksum "$archive"

cleanup() {
  if [[ -n "${decrypted:-}" && -f "$decrypted" ]]; then
    rm -f "$decrypted"
  fi
}
trap cleanup EXIT

restore_input="$archive"
if [[ "$archive" == *.enc ]]; then
  [[ -n "${BACKUP_PASSPHRASE_FILE:-}" ]] || die "BACKUP_PASSPHRASE_FILE is required for an encrypted archive"
  decrypted="$(mktemp "${TMPDIR:-/tmp}/edunet-restore-XXXXXX.dump")"
  log "decrypting archive"
  decrypt_archive "$archive" "$decrypted"
  restore_input="$decrypted"
fi

log "validating archive"
pg_restore --list "$restore_input" >/dev/null

pre_restore_backup "$script_dir"

started="$(date +%s)"
log "restoring into $RESTORE_TARGET_KIND target"
pg_restore \
  --dbname="$DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --single-transaction \
  --exit-on-error \
  "$restore_input"

log "applying migrations to the restored database"
if command -v pnpm >/dev/null 2>&1; then
  pnpm --filter @edunet/database migrate
else
  warn "pnpm not found; run migrations manually before serving traffic"
fi

if command -v psql >/dev/null 2>&1; then
  log "verifying core tables"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
    "select (select count(*) from organizations) as organizations, (select count(*) from users) as users, (select count(*) from courses) as courses, (select count(*) from enrollments) as enrollments, (select count(*) from submissions) as submissions;"
else
  warn "psql not found; verify /ready and representative tenant queries manually"
fi

finished="$(date +%s)"
log "restore complete in $((finished - started))s"
log "next: verify /ready, run smoke tests, and record the result in docs/deployment/BACKUP-RESTORE.md"
