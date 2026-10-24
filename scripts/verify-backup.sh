#!/usr/bin/env bash
# Verify a database backup without restoring it.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/ops.sh
source "$script_dir/lib/ops.sh"

archive="${1:-}"
[[ -n "$archive" && -f "$archive" ]] || die "usage: $0 <archive.dump[.enc]>"
require_command pg_restore
verify_checksum "$archive"

cleanup() { [[ -n "${decrypted:-}" && -f "$decrypted" ]] && rm -f "$decrypted"; }
trap cleanup EXIT

input="$archive"
if [[ "$archive" == *.enc ]]; then
  [[ -n "${BACKUP_PASSPHRASE_FILE:-}" ]] || die "BACKUP_PASSPHRASE_FILE is required"
  decrypted="$(mktemp "${TMPDIR:-/tmp}/edunet-verify-XXXXXX.dump")"
  decrypt_archive "$archive" "$decrypted"
  input="$decrypted"
fi

pg_restore --list "$input" >/dev/null
log "archive structure verified"
