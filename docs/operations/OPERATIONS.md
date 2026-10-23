# EduNet Operations Runbook

Last updated: 2026-10-23
Audience: platform operator, on-call engineer, release manager

## 1. Deployment Topology

EduNet is a pnpm/Turbo monorepo with one Next.js web app, eighteen Express
services and shared packages. Every service is stateless except for PostgreSQL
and the filesystem media volume.

| Component | Default port | Notes |
|-----------|--------------|-------|
| web (Next.js) | 3000 | Browser client; calls the gateway origin |
| identity | 3001 | Auth, sessions, verification, lockout, audit |
| organizations | 3002 | Tenant records |
| users | 3003 | User administration |
| courses | 3004 | Course catalogue |
| enrollments | 3005 | Enrolment records |
| assignments | 3006 | Assignments and rubrics |
| submissions | 3007 | Submissions, autosave, grading history |
| content | 3008 | Modules, lessons, resources, media |
| assessments | 3009 | Quizzes, attempts, grading, rechecks |
| notifications | 3010 | In-app notifications and preferences |
| parents | 3011 | Guardian relationships and child views |
| search | 3012 | Tenant-scoped search |
| analytics | 3013 | Course/student/assignment analytics |
| engagement | 3014 | Calendar, tutoring, events, live records |
| communication | 3015 | Messaging, blocks, reports, forums |
| support | 3016 | Help centre, tickets, counseling |
| platform | 3017 | Academics, attendance, flags, audit, privacy |
| ai | 3018 | Consent-gated AI, quotas, prompts, feedback |
| gateway | 8080 | Single origin; proxies `/api/*` to the service ports above |

The web client expects a single origin on `NEXT_PUBLIC_API_URL`. Run
`@edunet/gateway` (port 8080) in front of the services and set
`NEXT_PUBLIC_API_URL` to its public origin, or use an equivalent reverse proxy
with the same prefix map. The gateway streams bodies and resolves each prefix
from `<SERVICE>_URL` (defaults to `http://127.0.0.1:<port>`). Do not expose
individual service ports publicly. Gateway TLS, upstream readiness and an
end-to-end test are still launch tasks.

Services expose `/health` (liveness), `/ready` (readiness) and `/metrics`
(Prometheus text format). `SERVICE_NAME` is set by the bootstrap helper.

## 2. Configuration

Secrets are supplied by the environment; `.env*` files are git-ignored.

Required for every API deployment:

```env
DATABASE_URL=postgres://user:password@host:5432/edunet
JWT_SECRET=<at least 32 random bytes; placeholder rejected in production>
```

Identity-specific:

```env
BCRYPT_COST=12
DELIVER_EMAILS=true          # false returns verification/reset tokens in dev
TOKEN_TTL_MINUTES=...        # optional overrides
```

Content/media:

```env
MEDIA_STORAGE_PATH=/var/lib/edunet/media
MEDIA_SIGNING_SECRET=<random secret>   # falls back to JWT_SECRET if unset
```

Gateway edge:

```env
GATEWAY_PORT=8080
TRUST_PROXY=1                # one TLS-terminating proxy in front
CORS_ORIGINS=https://app.example.org,https://admin.example.org
ENABLE_HSTS=true
GATEWAY_RATE_LIMIT_PER_MINUTE=120
GATEWAY_AUTH_RATE_LIMIT_PER_MINUTE=20
GATEWAY_AI_RATE_LIMIT_PER_MINUTE=30
```

An empty `CORS_ORIGINS` means same-origin only. Rate limits are per gateway
process; use a shared limiter before running multiple replicas.

AI:

```env
AI_MODEL=gpt-4o-mini
AI_FALLBACK_MODEL=
AI_DAILY_TOKEN_LIMIT=50000
AI_MAX_OUTPUT_TOKENS=1024
AI_REQUIRE_CONSENT=true
AI_COST_IN_MICROS_PER_TOKEN=1
AI_COST_OUT_MICROS_PER_TOKEN=3
AI_SYSTEM_PROMPT=...
AI_COUNSELOR_URL=https://...
AI_GATEWAY_URL=https://gateway.example/v1
AI_GATEWAY_API_KEY=...
```

Web:

```env
NEXT_PUBLIC_API_URL=https://api.example.org
```

Never commit `.env.development.local` or any file containing provider keys.
Rotate a secret by deploying the new value to all services that verify it
before removing the old value.

## 3. Release Procedure

1. Confirm the release commit has green CI: install, migrations, lint,
   typecheck, unit tests, database integration, build and browser E2E.
2. Back up the target database (§5) and record the checksum.
3. Apply migrations with `pnpm --filter @edunet/database migrate`. Migrations
   must run once, before new service versions accept traffic.
4. Deploy services and web. Wait for `/ready` on every service.
5. Run the smoke journey: login, load courses, open a lesson, submit an
   assignment, open a quiz, send an AI message with consent recorded.
6. Watch error rate, p95 latency and AI quota metrics for 30 minutes.
7. Announce the release with the commit SHA and migration range.

### Rollback

- **Application rollback:** redeploy the previous image/tag. Keep the database
  migration-compatible (additive migrations first, destructive migrations in a
  later release).
- **Database rollback:** restore the pre-release backup only if the migration
  was destructive or data is corrupt; application rollback is preferred.
- **AI kill switch:** set `AI_REQUIRE_CONSENT=true` and remove provider
  credentials, or disable the `ai` route at the gateway. AI must fail closed.
- Record the incident, timeline, affected tenants and data impact.

## 4. Monitoring and Alerts

Minimum dashboards:

| Signal | Source | Alert |
|--------|--------|-------|
| Availability | `/ready` probes | 2 consecutive failures, 1 min |
| Error rate | HTTP metrics | 5xx > 2% for 5 min |
| Latency | HTTP metrics | p95 > 1 s for 10 min |
| Database | PostgreSQL exporter | connections > 80%, disk > 80% |
| AI spend | `ai_usage_daily` / metrics | tenant > 90% of daily quota |
| AI safety | audit events | any blocked crisis/unsafe event spike |
| Queue/backlog | offline sync telemetry (when wired) | failed syncs > 1% |
| Backup | backup job | missing daily archive |

Every log line carries a request id; propagate `x-request-id` across services
when debugging a single request. Metrics route labels are bounded by route
template, not raw paths.

## 5. Backup and Restore

Scripts:

```bash
DATABASE_URL=... BACKUP_DIR=/var/backups/edunet ./scripts/backup-db.sh
CONFIRM_RESTORE=yes DATABASE_URL=... ./scripts/restore-db.sh /var/backups/edunet/edunet-....dump
```

- Backups are PostgreSQL custom-format archives with a SHA-256 sidecar.
- The backup script verifies the archive with `pg_restore --list`.
- Default retention is 30 days; override with `KEEP_DAYS`.
- Media files are **not** in the database backup. Snapshot the media volume
  (or migrate to object storage with versioning) in the same window.
- **RPO ≤ 24 h** (daily backup), **RTO ≤ 4 h** (restore + migrate + smoke).
- Restore drill quarterly: restore into a clean database, apply migrations,
  verify row counts for `organizations`, `users`, `courses`, `enrollments`,
  `submissions`, `ai_messages`, then run the smoke journey.

## 6. Incident Response

| Severity | Example | First response |
|----------|---------|----------------|
| SEV-1 | Cross-tenant data exposure, auth bypass, harmful AI delivered to a minor | Page on-call, disable affected route/provider, preserve logs, notify DPO |
| SEV-2 | Login outage, database down, payments (future) | Page on-call, fail over/restore, status update within 30 min |
| SEV-3 | One domain degraded, elevated errors | Acknowledge, mitigate within 4 h |
| SEV-4 | Cosmetic or single-user issue | Ticket and normal queue |

Crisis content must always route to a human counselor. If the support queue is
unavailable, the AI service returns the crisis message and does not generate a
model response.

**Security incident:** preserve evidence, rotate affected credentials, revoke
sessions, assess notification obligations, and document in the incident log.
**Privacy request:** use the platform privacy request API, verify identity,
export or erase within the documented retention window, and record the action.

## 7. Capacity and Cost

- Pilot assumption: 2,000 students, 150 staff, ≤ 500 concurrent users.
- Scale web and API horizontally behind the gateway; PostgreSQL vertical scale
  first, then read replicas for analytics.
- AI is the primary variable cost. Monitor tokens per tenant per day and set
  `AI_DAILY_TOKEN_LIMIT` conservatively; the default is 50,000 tokens.
- Media storage grows with video/audio uploads; enforce the 25 MB per-file cap
  and move to object storage before large-scale rollout.

## 8. Scheduled Maintenance

| Task | Frequency | Owner |
|------|-----------|-------|
| Backup verification | Daily (automated) | Platform |
| Restore drill | Quarterly | Operations |
| Dependency audit | Weekly | Security |
| Access review | Quarterly | Admin |
| AI prompt/safety review | Monthly | AI/Support |
| Certificate/secret rotation | Quarterly or on incident | Security |
| Retention purge | Monthly | Privacy |
