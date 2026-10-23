# Release Runbook

## Prerequisites
Review the readiness report, CI result, dependency scan, migration SQL, backup freshness, secret configuration, HTTPS/DNS, monitoring, rollback owner, and synthetic smoke-test accounts. Do not release with failed critical checks.

## Procedure
Build the immutable application/container artifact, apply only reviewed forward migrations, deploy the application, wait for `/ready`, then run the student, teacher, parent, and administrator smoke paths with synthetic data. Check request errors, latency, database health, logs, and alerts before declaring the release healthy.

## Rollback
Rollback the application artifact when health checks or smoke tests fail. Do not assume database migrations are reversible: use a forward fix where possible, or restore a separately validated backup to a controlled recovery target. Escalate data integrity, privacy, and authorization incidents immediately and preserve audit logs.

## Post-release
Record commit, artifact digest, migration version, operator, timestamps, smoke results, dashboard links, and any deviations. Production deployment is **NOT DEPLOYED** by this workspace.
