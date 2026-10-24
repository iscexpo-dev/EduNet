# Backup and Restore

## Objectives

| Item          | Pilot target                                     |
| ------------- | ------------------------------------------------ |
| RPO           | <= 24 hours (daily encrypted database backup)    |
| RTO           | <= 4 hours (restore + migrate + smoke test)      |
| Retention     | 30 days by default (`KEEP_DAYS`)                 |
| Off-site copy | Required; same-region copy alone is insufficient |

The service owner must approve these targets. A backup is not proven until a
restore drill has succeeded.

## Prerequisites

Install PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`) and either
`openssl` or `gpg` on the backup runner. The workspace used for this change has
none of the PostgreSQL tools and no `openssl`, so only stubbed self-tests were
possible here.

## Database backup

```bash
DATABASE_URL='postgres://user:pass@host:5432/edunet?sslmode=require' \
BACKUP_DIR=/var/backups/edunet \
KEEP_DAYS=30 \
./scripts/backup-db.sh
```

Outputs:

- `edunet-<timestamp>.dump` — PostgreSQL custom-format archive;
- `.sha256` — checksum sidecar;
- `.json` — manifest with size, timestamp and checksum.

The script validates the archive with `pg_restore --list` before publishing it.
It prunes archives older than `KEEP_DAYS` only after a successful new backup.

Encryption is enabled when `BACKUP_ENCRYPTION_KEY_FILE` is set. The script uses
`openssl enc` when available and falls back to `gpg --symmetric`. Store the key
outside the backup bucket and document rotation.

## Media backup

```bash
MEDIA_STORAGE_PATH=/var/lib/edunet/media \
BACKUP_DIR=/var/backups/edunet \
./scripts/backup-media.sh
```

Media is not in the database dump. Back up the volume in the same window as the
database so references and files remain consistent.

## Verify an archive

```bash
./scripts/verify-backup.sh /var/backups/edunet/edunet-<timestamp>.dump
```

Verification checks the checksum and, when PostgreSQL tools are available, the
archive table of contents. A checksum mismatch is a hard failure.

## Restore

Restores require an explicit target classification:

```bash
CONFIRM_RESTORE=yes \
RESTORE_TARGET_KIND=disposable \
DATABASE_URL='postgres://user:pass@disposable-host:5432/edunet_restore?sslmode=require' \
./scripts/restore-db.sh /var/backups/edunet/edunet-<timestamp>.dump
```

Production restores require all of the following:

```bash
CONFIRM_RESTORE=yes \
RESTORE_TARGET_KIND=production \
ALLOW_PRODUCTION_RESTORE=yes \
DATABASE_URL='postgres://.../edunet' \
./scripts/restore-db.sh <archive>
```

The script refuses to run without the confirmations, refuses unknown target
kinds, takes a pre-restore backup for production, restores into a temporary
database where possible, and verifies the result before switching. Never run a
restore against production as an ad-hoc debugging step; open a change record.

## Restore drill

```bash
DATABASE_URL='postgres://.../edunet_drill' \
RESTORE_TARGET_KIND=disposable \
CONFIRM_RESTORE=yes \
./scripts/restore-drill.sh /var/backups/edunet/edunet-<timestamp>.dump
```

The drill restores into a disposable database, applies migrations, runs
representative row-count checks, and records duration. Attach the output to the
release record.

## Post-restore checks

1. Run `pnpm db:check` and apply migrations if the archive predates them.
2. Confirm `/ready` is healthy on every service.
3. Verify tenant isolation with at least two organizations.
4. Verify login, course list, assignment list, submission list and parent view.
5. Run `pnpm smoke:staging` with synthetic pilot accounts.
6. Record restore start/end time, archive checksum, migration version, operator
   and any data loss window.

## Failure handling

- Checksum mismatch: do not restore; select another archive and investigate the
  storage path.
- Missing encryption key: restore is impossible; escalate to the key owner.
- Restore fails midway: keep the temporary database, preserve logs, and do not
  point traffic at a partial restore.
- Production restore approved: freeze writes, announce the maintenance window,
  and verify audit logs after recovery.

## Evidence in this repository

`pnpm ops:test` passes with stubbed PostgreSQL tools and verifies: plain and
encrypted backup creation, manifest/checksum generation, verification, encrypted
restore, authorization gates, tamper detection, and media backup. A real
PostgreSQL restore remains **NOT RUN**.
