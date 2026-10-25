# Go-Live Checklist

Status date: 2026-10-24. `[x]` means verified locally; `[ ]` means not yet
verified. This workspace is **NO-GO / NOT DEPLOYED**.

## Build and test

- [x] Frozen dependency install and lockfile committed.
- [x] Format gate for the deployment surface.
- [x] Lint and typecheck.
- [x] Unit tests and package builds.
- [x] Production build.
- [x] High/critical dependency audit.
- [x] Secret scan configured in CI.
- [x] Migration static consistency check.
- [ ] PostgreSQL migration application and integration tests on the release
      commit (CI required).
- [ ] Browser E2E on the release commit (CI required).
- [ ] Container builds and Trivy scans on the release commit (CI required).
- [ ] Operations script tests on the release commit (CI required).

## Configuration and security

- [x] Production env validation fails fast without secrets.
- [x] Nonce-based CSP and HSTS opt-in implemented and locally verified.
- [x] Database readiness wired into all services.
- [ ] Production secrets in a secret manager; no placeholders.
- [ ] TLS, DNS, CORS, proxy trust and cookie settings verified in staging.
- [x] Access/refresh tokens moved out of `localStorage` into `httpOnly`,
      `Secure`, `SameSite` cookies (access cookie plus path-scoped refresh cookie).
- [ ] Shared rate-limit store selected (`GATEWAY_RATE_LIMIT_STORE=postgres`)
      and exercised if `GATEWAY_REPLICA_COUNT` is greater than one.
- [ ] DAST/ZAP and MFA assessment completed.
- [ ] AI provider retention terms reviewed for minors.

## Data protection

- [ ] Managed PostgreSQL TLS and least-privilege credentials verified.
- [ ] Encrypted backup job runs daily and copies off-site.
- [ ] Restore drill into a disposable database passes.
- [ ] Media volume backup or versioned object storage verified.
- [ ] Retention and privacy-request procedures exercised.
- [ ] Audit chain verification passes in staging.

## Operations

- [x] Health/readiness endpoints and metrics defined.
- [x] Four-role smoke test implemented with a BLOCKED exit code.
- [x] Backup/restore/media scripts and self-test implemented.
- [x] Local performance baseline recorded.
- [ ] `/health`, `/ready`, error rate, latency, database and AI quota alerts
      routed to an on-call destination.
- [ ] Staging smoke test passes.
- [ ] Staging soak/load test passes at pilot concurrency.
- [ ] Rollback owner and forward-fix plan assigned.
- [ ] Support rota, incident contacts and counselor escalation verified.

## Pilot

- [ ] Pilot approval and privacy review recorded.
- [ ] Synthetic accounts provisioned; no real student data.
- [ ] Participant onboarding and support materials ready.
- [ ] Success metrics, stop conditions and data-handling rules signed off.
- [ ] Release owner records GO with evidence.

**Decision: NO-GO.** Complete every unchecked item before production or pilot
enrollment.
