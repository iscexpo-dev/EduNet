#!/usr/bin/env bash
# Exercises backup/restore orchestration without PostgreSQL or Docker.
# The pg tools are stubbed; encryption, checksums, authorization gates,
# manifest generation and argument handling are real.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/edunet-ops-test-XXXXXX")"
trap 'rm -rf "$work"' EXIT

bin="$work/bin"
backups="$work/backups"
media="$work/media"
mkdir -p "$bin" "$media"
printf 'media-bytes' > "$media/file.bin"
printf 'correct horse battery staple\n' > "$work/passphrase"
export PATH="$bin:$PATH"

cat > "$bin/pg_dump" <<'FAKE'
#!/usr/bin/env bash
if [[ "${1:-}" == "--version" ]]; then echo "pg_dump (PostgreSQL) 16.0"; exit 0; fi
file=""
for arg in "$@"; do
  case "$arg" in --file=*) file="${arg#--file=}";; esac
done
[[ -n "$file" ]] || { echo "fake pg_dump: missing --file" >&2; exit 1; }
printf 'FAKE-CUSTOM-DUMP\n' > "$file"
FAKE
cat > "$bin/pg_restore" <<'FAKE'
#!/usr/bin/env bash
if [[ "${1:-}" == "--list" ]]; then exit 0; fi
printf '%s\n' "$*" > "$FAKE_RESTORE_LOG"
FAKE
cat > "$bin/pnpm" <<'FAKE'
#!/usr/bin/env bash
printf 'fake pnpm %s\n' "$*" >> "$FAKE_PNPM_LOG"
FAKE
chmod +x "$bin/pg_dump" "$bin/pg_restore" "$bin/pnpm"
export FAKE_RESTORE_LOG="$work/restore.log"
export FAKE_PNPM_LOG="$work/pnpm.log"

echo "== backup without encryption =="
DATABASE_URL='postgres://user:secret@db.invalid/edunet' BACKUP_DIR="$backups" \
  "$script_dir/backup-db.sh"
plain_archive="$(find "$backups" -name 'edunet-*.dump' | head -1)"
[[ -f "$plain_archive" ]] || { echo "FAIL: plain archive missing" >&2; exit 1; }
[[ -f "${plain_archive}.sha256" && -f "${plain_archive}.meta" ]] || { echo "FAIL: sidecars missing" >&2; exit 1; }
grep -q '"encrypted": false' "${plain_archive}.meta" || { echo "FAIL: manifest encrypted flag" >&2; exit 1; }

echo "== encrypted backup =="
rm -rf "$backups"; mkdir -p "$backups"
DATABASE_URL='postgres://user:secret@db.invalid/edunet' BACKUP_DIR="$backups" \
  BACKUP_PASSPHRASE_FILE="$work/passphrase" "$script_dir/backup-db.sh"
enc_archive="$(find "$backups" -name 'edunet-*.dump.enc' | head -1)"
[[ -f "$enc_archive" ]] || { echo "FAIL: encrypted archive missing" >&2; exit 1; }
[[ -z "$(find "$backups" -name 'edunet-*.dump' ! -name '*.enc' | head -1)" ]] || { echo "FAIL: plaintext archive retained" >&2; exit 1; }
grep -q '"encrypted": true' "${enc_archive}.meta" || { echo "FAIL: manifest encrypted flag" >&2; exit 1; }
BACKUP_PASSPHRASE_FILE="$work/passphrase" "$script_dir/verify-backup.sh" "$enc_archive"

echo "== encrypted restore =="
CONFIRM_RESTORE=yes RESTORE_TARGET_KIND=disposable DATABASE_URL='postgres://user:secret@db.invalid/edunet' \
  BACKUP_PASSPHRASE_FILE="$work/passphrase" "$script_dir/restore-db.sh" "$enc_archive"
grep -q -- '--single-transaction' "$FAKE_RESTORE_LOG" || { echo "FAIL: restore not atomic" >&2; exit 1; }
grep -q -- 'migrate' "$FAKE_PNPM_LOG" || { echo "FAIL: migrations not invoked" >&2; exit 1; }

echo "== authorization gates =="
if DATABASE_URL='postgres://x/y' "$script_dir/restore-db.sh" "$enc_archive" >/dev/null 2>&1; then
  echo "FAIL: restore without confirmation succeeded" >&2; exit 1
fi
if CONFIRM_RESTORE=yes RESTORE_TARGET_KIND=production DATABASE_URL='postgres://x/y' \
  BACKUP_PASSPHRASE_FILE="$work/passphrase" "$script_dir/restore-db.sh" "$enc_archive" >/dev/null 2>&1; then
  echo "FAIL: production restore without explicit allow succeeded" >&2; exit 1
fi
if CONFIRM_RESTORE=yes RESTORE_TARGET_KIND=disposable DATABASE_URL='postgres://x/y' \
  BACKUP_PASSPHRASE_FILE="$work/passphrase" "$script_dir/restore-db.sh" "$plain_archive" >/dev/null 2>&1; then
  echo "FAIL: restore without explicit target kind should require a classification" >&2; exit 1
fi

echo "== checksum tamper detection =="
cp "$enc_archive" "$work/tampered.dump.enc"
printf '0%.0s' {1..64} > "$work/tampered.dump.enc.sha256"
if BACKUP_PASSPHRASE_FILE="$work/passphrase" "$script_dir/verify-backup.sh" "$work/tampered.dump.enc" >/dev/null 2>&1; then
  echo "FAIL: tampered archive passed verification" >&2; exit 1
fi

echo "== media backup =="
MEDIA_STORAGE_PATH="$media" BACKUP_DIR="$backups" BACKUP_PASSPHRASE_FILE="$work/passphrase" \
  "$script_dir/backup-media.sh"
media_archive="$(find "$backups" -name 'edunet-media-*.tar.gz.enc' | head -1)"
[[ -f "$media_archive" ]] || { echo "FAIL: media archive missing" >&2; exit 1; }
[[ -f "${media_archive}.sha256" ]] || { echo "FAIL: media checksum missing" >&2; exit 1; }

echo "OPERATIONS TEST: PASS"
