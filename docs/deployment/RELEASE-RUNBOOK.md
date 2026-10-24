# Release Runbook

## 1. Preconditions

- [ ] Release commit has green CI: frozen install, format, secret scan,
      dependency audit, migrations (static + applied), lint, typecheck,
      PostgreSQL integration, unit tests, production build, operations tests,
      browser E2E, container builds and Trivy scans.
- [ ] `DEPLOYMENT-READINESS.md` has no unresolved critical risk.
- [ ] Production environment values are in the secret manager; no placeholders.
- [ ] Database backup is fresh, encrypted, checksum-verified and copied
      off-site.
- [ ] Migrations were reviewed; destructive changes have a forward-fix plan.
- [ ] TLS/DNS, monitoring, alert routing and support rota are ready.
- [ ] Synthetic student/teacher/parent/admin accounts exist in staging.
- [ ] Named release owner and rollback owner are assigned.

Do not release if any precondition fails.

## 2. Build the immutable artifact

```bash
pnpm install --frozen-lockfile
pnpm db:check
pnpm verify
docker build --target runtime -t registry.example.org/edunet-api:<sha> .
docker build -f apps/web/Dockerfile --target runtime \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.org \
  -t registry.example.org/edunet-web:<sha> .
```

Record the image digests, not just tags. CI builds and scans the same targets
without pushing.

## 3. Migrate

1. Announce the maintenance window if the migration is not backward-compatible.
2. Take and verify a pre-release backup.
3. Run exactly once, before new service versions receive traffic:

```bash
DATABASE_URL=... pnpm --filter @edunet/database migrate
pnpm db:check
```

4. If the live check reports drift, stop and investigate. Do not start the new
   version against an unknown schema.

## 4. Deploy staging first

```bash
cd deploy/compose
cp .env.example .env
# fill values from the secret manager; never commit .env
docker compose -f docker-compose.staging.yml --env-file .env up -d
docker compose -f docker-compose.staging.yml ps
```

For a managed environment, deploy the API and web images with the same
environment variables and wait for readiness. Then verify:

```bash
curl -fsS https://api.staging.example.org/health
curl -fsS https://api.staging.example.org/ready
curl -fsS https://app.staging.example.org/api/health
```

Check headers:

```bash
curl -sSI https://app.staging.example.org/ | grep -i 'content-security-policy\|strict-transport-security'
```

## 5. Smoke test

Set synthetic credentials in the operator shell (never in git):

```bash
export SMOKE_BASE_URL=https://api.staging.example.org
export SMOKE_WEB_URL=https://app.staging.example.org
export SMOKE_STUDENT_EMAIL=... SMOKE_STUDENT_PASSWORD=...
export SMOKE_TEACHER_EMAIL=... SMOKE_TEACHER_PASSWORD=...
export SMOKE_PARENT_EMAIL=...   SMOKE_PARENT_PASSWORD=...
export SMOKE_ADMIN_EMAIL=...    SMOKE_ADMIN_PASSWORD=...
pnpm smoke:staging
```

The script checks health/ready, login for all four roles, role isolation,
course/enrollment/assignment/submission reads, parent child views, admin audit
verification and JSON 404 behavior. Exit code `2` means configuration is
missing (`BLOCKED`); exit code `1` means a real check failed.

## 6. Pilot release

Repeat the same steps against production with the production values. Run the
smoke test, then watch for 30 minutes:

- 5xx rate and p95 latency;
- `/ready` failures;
- database connections and disk;
- AI quota and blocked-output events;
- backup job success.

## 7. Rollback

- **Application:** redeploy the previous image digest. Prefer this for
  application regressions.
- **Database:** migrations are not assumed reversible. Use a forward fix, or
  restore the pre-release backup into a controlled target. A production
  restore requires the guards in `BACKUP-RESTORE.md`.
- **AI:** remove provider credentials or disable the AI route; the crisis path
  must remain available.
- **Security incident:** preserve logs and audit rows, rotate credentials,
  revoke sessions, notify the DPO, and follow `docs/security/security.md`.

## 8. Release record

Record: commit, image digests, migration version, backup checksum, operator,
start/end times, smoke output, dashboard links, deviations, and GO/NO-GO
decision. Do not mark a release successful without this evidence.

## Current status

Production deployment: **NOT DEPLOYED**. Staging: **NOT DEPLOYED** (no target
or credentials in this workspace).
