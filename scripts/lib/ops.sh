#!/usr/bin/env bash
# Shared helpers for EduNet operational scripts.
# Never echo a connection string or passphrase.

set -euo pipefail

log() { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is not installed"
}

require_file() {
  [[ -r "$1" ]] || die "cannot read $1"
}

sha256_of() {
  sha256sum "$1" | awk '{print $1}'
}

encryption_tool_for_encrypt() {
  if [[ -n "${BACKUP_ENCRYPTION_TOOL:-}" ]]; then
    printf '%s' "$BACKUP_ENCRYPTION_TOOL"
  elif command -v openssl >/dev/null 2>&1; then
    printf 'openssl'
  elif command -v gpg >/dev/null 2>&1; then
    printf 'gpg'
  else
    die "BACKUP_PASSPHRASE_FILE is set but neither openssl nor gpg is installed"
  fi
}

# Openssl output begins with the ASCII salt header; anything else is treated as
# an OpenPGP symmetric message. BACKUP_ENCRYPTION_TOOL overrides detection.
encryption_tool_for_decrypt() {
  local input="$1"
  if [[ -n "${BACKUP_ENCRYPTION_TOOL:-}" ]]; then
    printf '%s' "$BACKUP_ENCRYPTION_TOOL"
    return 0
  fi
  if head -c 8 "$input" | grep -q '^Salted__'; then
    printf 'openssl'
  else
    printf 'gpg'
  fi
}

# Encrypts an archive when BACKUP_PASSPHRASE_FILE is set.
# Prints the resulting path (the plaintext is removed after successful encryption).
encrypt_archive() {
  local input="$1"
  if [[ -z "${BACKUP_PASSPHRASE_FILE:-}" ]]; then
    printf '%s' "$input"
    return 0
  fi
  require_file "$BACKUP_PASSPHRASE_FILE"
  local output="${input}.enc"
  local tool
  tool="$(encryption_tool_for_encrypt)"
  case "$tool" in
    openssl)
      openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
        -in "$input" -out "$output" -pass "file:${BACKUP_PASSPHRASE_FILE}"
      ;;
    gpg)
      gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 \
        --passphrase-file "$BACKUP_PASSPHRASE_FILE" -o "$output" "$input"
      ;;
    *) die "unsupported BACKUP_ENCRYPTION_TOOL: $tool" ;;
  esac
  rm -f "$input"
  printf '%s' "$output"
}

decrypt_archive() {
  local input="$1"
  local output="$2"
  require_file "$BACKUP_PASSPHRASE_FILE"
  local tool
  tool="$(encryption_tool_for_decrypt "$input")"
  case "$tool" in
    openssl)
      openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
        -in "$input" -out "$output" -pass "file:${BACKUP_PASSPHRASE_FILE}"
      ;;
    gpg)
      gpg --batch --yes --quiet --pinentry-mode loopback --decrypt \
        --passphrase-file "$BACKUP_PASSPHRASE_FILE" -o "$output" "$input"
      ;;
    *) die "unsupported BACKUP_ENCRYPTION_TOOL: $tool" ;;
  esac
}

verify_checksum() {
  local archive="$1"
  local checksum_file="${archive}.sha256"
  if [[ ! -f "$checksum_file" ]]; then
    warn "no checksum sidecar for $archive"
    return 0
  fi
  local expected actual
  expected="$(tr -d '[:space:]' < "$checksum_file")"
  actual="$(sha256_of "$archive")"
  [[ "$expected" == "$actual" ]] || die "checksum mismatch for $archive"
  log "checksum verified"
}

# A restore must state its target class. Production restores need an explicit
# second confirmation because the procedure drops and recreates objects.
require_restore_authorization() {
  local kind="${RESTORE_TARGET_KIND:-}"
  case "$kind" in
    disposable) ;;
    production)
      [[ "${ALLOW_PRODUCTION_RESTORE:-}" == "yes" ]] || \
        die "production restore requires ALLOW_PRODUCTION_RESTORE=yes"
      ;;
    *)
      die "RESTORE_TARGET_KIND must be 'disposable' or 'production'"
      ;;
  esac
}

# Runs a pre-restore backup of the current target. This is the only automated
# protection against restoring the wrong archive over live data.
pre_restore_backup() {
  local script_dir="$1"
  if [[ "${RESTORE_TARGET_KIND:-}" != "production" ]]; then
    return 0
  fi
  if [[ "${SKIP_PRE_RESTORE_BACKUP:-}" == "yes" ]]; then
    warn "SKIP_PRE_RESTORE_BACKUP=yes; proceeding without a fresh pre-restore backup"
    return 0
  fi
  local dir="${RESTORE_BACKUP_DIR:-./backups/pre-restore}"
  log "creating pre-restore backup in $dir"
  BACKUP_DIR="$dir" KEEP_DAYS=0 "$script_dir/backup-db.sh"
}
