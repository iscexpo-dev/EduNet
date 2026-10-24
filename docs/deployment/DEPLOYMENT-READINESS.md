# EduNet Deployment Readiness

**Assessment date:** 2026-10-24  
**Repository:** `iscexpo-dev/EduNet` (local checkout `/vercel/share/v0-project`)  
**Branch:** `main`  
**Base commit:** `8273870` (re-verified 2026-10-24; prior pass was `ca29753`)  
**Release commit:** recorded in the release record after the final commit  
**Decision:** **NO-GO for production / NOT DEPLOYED** until the external evidence
items below are completed.

> **2026-10-24 re-verification:** typecheck 35/35, lint 32/32 (0 errors),
> tests 46/46 tasks / 353 tests, forced build 29/29, `db:check` PASS (4
> migrations), `ops:test` PASS and `format:check` PASS. A new high advisory
> (GHSA-27r3-jxmh-p828, `body-parser@1.20.8` on 40 paths) was fixed with a root
> pnpm override to `^1.20.9`; `pnpm audit --audit-level=high` passes with one
> moderate dev-only advisory remaining. Resumable state is in
> `PROGRESS_STATE.json` and `todo/ACTIVE-PLAN.md`.

## 1. Scope of this readiness pass

- Remediated dependency advisories in Next.js, Zod, Drizzle, PostCSS and
  minimatch.
- Added fail-fast production environment validation for API services and the
  standalone web server.
- Added PostgreSQL readiness checks to all 18 services and the gateway.
- Added migration consistency checks (static and optional live).
- Added production API and web container images, compose topologies, and
  container scanning in CI.
- Added a nonce-based CSP, HSTS opt-in, and a web health endpoint.
- Hardened backup, restore, media backup, archive verification and restore
  drill scripts with encryption, checksums, retention and production guards.
- Added a four-role smoke test, an operations self-test, and a performance
  baseline.
- Hardened CI with frozen installs, format/secret/dependency scans, migrations,
  integration tests, builds, browser tests, container builds and Trivy scans.

## 2. Local verification evidence

| Check                            | Command                                                                          | Result                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Typecheck                        | `pnpm typecheck`                                                                 | PASS                                                                        |
| Lint                             | `pnpm lint`                                                                      | PASS (existing warnings only)                                               |
| Unit tests + package builds      | `pnpm test`                                                                      | PASS                                                                        |
| Production build                 | `pnpm build`                                                                     | PASS                                                                        |
| High/critical dependency audit   | `pnpm audit --audit-level=high`                                                  | PASS; 1 moderate dev-only advisory (`postcss-selector-parser` via Tailwind) |
| Migration consistency            | `pnpm db:check`                                                                  | PASS: 4 migrations, latest `0003_futuristic_sway`; live check skipped       |
| Operations scripts               | `pnpm ops:test`                                                                  | PASS: backup, encryption, verify, restore gates, tamper detection, media    |
| Format gate (deployment surface) | `pnpm format:check`                                                              | PASS                                                                        |
| Web standalone build             | `NEXT_OUTPUT=standalone NEXT_PUBLIC_API_URL=... pnpm --filter @edunet/web build` | PASS                                                                        |
| Web health and headers           | standalone server + `curl`                                                       | `/api/health` 200; CSP nonce present; HSTS present when `ENABLE_HSTS=true`  |
| Smoke test configuration guard   | `node scripts/smoke-test.mjs` without credentials                                | PASS: exits `2` / `BLOCKED`, never invents accounts                         |
| Performance baseline             | `pnpm perf:baseline`                                                             | PASS: 32,885 requests, 0 errors, 6,577 rps, p95 6.67 ms                     |

Detailed performance evidence is in `PERFORMANCE-BASELINE.md`.

## 3. Not run in this workspace

These are **BLOCKED / NOT RUN**, not passes:

- PostgreSQL migration application and database integration tests. The
  workspace has no PostgreSQL server or `psql` client.
  `pnpm --filter @edunet/database test:integration` fails with
  `DATABASE_URL is required`.
- Container image build and scan. The workspace has no Docker, Podman,
  Buildah or `nerdctl`.
- Staging deployment, DNS/TLS validation, load testing against a deployed
  environment, alert delivery, and backup restore into a real database.
- Pilot enrollment or any real-user testing.
- DAST/ZAP, MFA testing, and a shared (multi-replica) rate-limit store.

CI is configured to run the database, container and browser checks on a
GitHub-hosted runner; the first green CI run is still required evidence.

## 4. Residual launch risks

1. **Token storage:** access/refresh tokens remain in browser `localStorage`.
   The CSP reduces XSS impact but does not eliminate token theft. Moving to
   `httpOnly`, `Secure`, `SameSite` cookies remains a launch blocker for a
   high-risk pilot.
2. **Rate limiting:** the gateway limiter is in-process. Use one gateway
   replica or move to a shared store before horizontal scaling.
3. **Parent/admin web UI:** the parent and administrator journeys exist as
   APIs and are covered by smoke tests, but there are no dedicated web screens
   for those roles.
4. **Moderation:** AI screening is rule-based and not a complete moderation
   system. A human escalation path must be staffed for the pilot.
5. **Restore evidence:** the scripts are self-tested with stubbed PostgreSQL
   tools; a real restore drill has not been executed.
6. **Formatting:** the format gate covers the deployment surface only. Legacy
   source files are not yet repo-wide Prettier-clean.

## 5. Required external evidence before GO

- A green CI run on the release commit, including PostgreSQL integration,
  browser E2E, container builds and Trivy scans.
- Staging deployment from immutable images with managed PostgreSQL, TLS, DNS,
  secret manager values and monitoring.
- A passing four-role smoke test against staging.
- A restore drill into a disposable database with recorded RPO/RTO evidence.
- Security sign-off on token storage, shared rate limiting, backup encryption
  and AI provider retention terms for minors.
- Pilot approval, support rota, and a named release owner.

See `RELEASE-RUNBOOK.md`, `PRODUCTION-ENVIRONMENT.md`, `BACKUP-RESTORE.md`,
`GO-LIVE-CHECKLIST.md`, and `../pilot/PILOT-PLAN.md`.
