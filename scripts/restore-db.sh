#!/usr/bin/env bash
# Restore an EduNet PostgreSQL backup.
#
# Usage:
#   CONFIRM_RESTORE=yes DATABASE_URL=... ./scripts/restore-db.sh backups/edunet-....dump
#
# The target database is dropped and recreated from the archive. Never run this
# against a shared or production database without a tested change record.
set -euo pipefail

if [[ "${CONFIRM_RESTORE:-}" != "yes" ]]; then
  echo "refusing to restore without CONFIRM_RESTORE=yes" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "error: DATABASE_URL is required" >&2
  exit 1
fi

archive="${1:-}"
if [[ -z "$archive" || ! -f "$archive" ]]; then
  echo "usage: CONFIRM_RESTORE=yes DATABASE_URL=... $0 <archive.dump>" >&2
  exit 1
fi

for command in pg_restore sha256sum; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "error: $command is not installed" >&2
    exit 1
  fi
done

checksum_file="$archive.sha256"
if [[ -f "$checksum_file" ]]; then
  expected="$(tr -d '[:space:]' < "$checksum_file")"
  actual="$(sha256sum "$archive" | awk '{print $1}')"
  if [[ "$expected" != "$actual" ]]; then
    echo "error: checksum mismatch for $archive" >&2
    exit 1
  fi
  echo "checksum verified"
else
  echo "warning: no checksum file found for $archive" >&2
fi

echo "restoring $archive"
pg_restore \
  --dbname="$DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "$archive"

echo "running migration check"
if command -v pnpm >/dev/null 2>&1; then
  pnpm --filter @edunet/database migrate
else
  echo "warning: pnpm not found; run migrations manually" >&2
fi

echo "restore complete; verify /ready and a sample tenant query"
