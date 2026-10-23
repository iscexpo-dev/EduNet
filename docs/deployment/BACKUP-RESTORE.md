# Backup and Restore

Run `DATABASE_URL=... BACKUP_DIR=... ./scripts/backup-db.sh` from a trusted runner with PostgreSQL client tools. The script creates a custom-format dump, validates it with `pg_restore --list`, writes a SHA-256 checksum, and prunes old archives according to `KEEP_DAYS`. Encrypt archives at rest and replicate them to a separate protected location using the infrastructure provider's managed backup controls.

For a disposable restore target only, verify the checksum and run `CONFIRM_RESTORE=yes DATABASE_URL=... ./scripts/restore-db.sh <archive>`. The restore uses `--clean`; never point it at production without an approved change record. After restore, run migrations, check `/ready`, verify representative tenant-scoped queries, and record duration and limitations. Recovery objectives must be set by the service owner; no restore test has been run in this workspace.
