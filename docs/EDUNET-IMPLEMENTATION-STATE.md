# EduNet Implementation State

Last updated: 2026-10-23
Branch: `main` (`2dc560f`) plus uncommitted AI service and documentation work
Requirements: `docs/product/PRODUCT-FOUNDATION.md`
Gap analysis: `docs/EDUNET-ROADMAP-GAP-MATRIX.md`

## Status Legend

`VERIFIED` · `COMPLETE` · `PARTIAL` · `MISSING` · `NEEDS HARDENING` · `BLOCKED` · `CI ONLY`

---

## Verified Executable Evidence

| Gate | Command | Result |
|------|---------|--------|
| Install | `pnpm install` | PASS (lockfile accepted) |
| Typecheck | `pnpm typecheck` | **27/27 tasks PASS** |
| Lint | `pnpm lint` | **32/32 tasks PASS**, 0 errors, 252 warnings |
| Unit tests | `pnpm test` | **37/37 tasks PASS**, **323 tests**, 24 test files, 16 packages |
| Build | `pnpm build` | **21/21 tasks PASS**, including the Next.js production build |
| Migrations | `pnpm --filter @edunet/database migrate` | **CI ONLY** — no PostgreSQL/Docker in this sandbox |
| Database integration | `pnpm --filter @edunet/database test:integration` | **CI ONLY** — writes to PostgreSQL |
| Browser E2E | `pnpm --filter @edunet/web test:e2e` | **CI ONLY** — no Playwright browser installed |
| Backup scripts | `bash -n scripts/backup-db.sh scripts/restore-db.sh` | PASS (syntax only, no drill) |

The local environment has no `docker`, `psql`, `postgres` or Playwright
browsers. CI (`.github/workflows`) provisions `postgres:16` and runs the
migration, integration and browser gates. Results in this document only claim
what was actually executed in this session.

### Test inventory

| Package | Tests | Focus |
|---------|-------|-------|
| `@edunet/identity` | 49 | password hashing, JWT kinds, refresh replay, lockout, reset, verification, sessions, audit |
| `@edunet/rbac` | 40 | role matrix, tenant isolation, bearer auth, refresh-token replay |
| `@edunet/assessments` | 33 | five question types, partial credit, randomisation, history |
| `@edunet/content` | 22 | MIME allowlist, key generation, path traversal, signed URLs, limits |
| `@edunet/submissions` | 21 | rubrics, autosave, revisions, grading history |
| `@edunet/platform` | 21 | academics, attendance, flags, audit, consent, privacy |
| `@edunet/engagement` | 21 | calendar, tutoring, events, live classes |
| `@edunet/offline` | 19 | queue, dedupe, backoff, conflict resolution, download planning |
| `@edunet/ai` | 18 | safety, crisis, quota, prompt assembly, fallback, token budgeting |
| `@edunet/i18n` | 17 | catalogues, interpolation, locale detection, `Intl` formatting |
| `@edunet/observability` | 16 | logging, request IDs, metrics, health |
| `@edunet/communication` | 15 | conversations, moderation, blocks, forums |
| `@edunet/support` | 10 | resources, tickets, escalation, counseling |
| `@edunet/courses` | 7 | CRUD, teacher ownership, admin override |
| `@edunet/enrollments` | 6 | self-enrolment, duplicate prevention, cross-student rejection |
| `@edunet/gateway` | 8 | prefix mapping, env overrides, streaming proxy, 502 handling |

---

## Work Completed This Session

### AI service made buildable and complete

The `@edunet/ai` package imported `./routes` from `index.ts`, but no such file
existed. The production build failed, and the AI backend was unreachable.

Added:

- `services/ai/src/routes.ts` mounting `/api/ai`:
  - `GET/POST /conversations`
  - `GET/DELETE /conversations/:id`
  - `GET/POST /conversations/:id/messages`
  - `POST /messages/:id/feedback`
  - `GET /usage/today`
  - `GET/PUT /prompts`
- `services/ai/src/handlers.ts`:
  - consent check against `consent_records` (`ai_processing`, granted, not revoked)
  - safety assessment with crisis short-circuit to a human-help response
  - PII redaction before the provider call
  - organization-scoped daily token quota and usage accounting
  - model selection and fallback through `provider.ts`
  - conversation history assembly into the system/user messages
  - message, usage, audit and feedback persistence
  - prompt-template listing and upsert
- `services/ai/src/db.ts` fixes:
  - prompt-template versions are globally unique per key; upsert deactivates
    only prior active rows for the same organization and key
  - prompt lookup prefers a tenant override over the platform default
  - added `updateConversationTitle`

The AI service now typechecks, tests, builds and is mounted consistently with
the other services.

### Single-origin gateway

Added `@edunet/gateway` on port 8080 (configurable with `GATEWAY_PORT`):

- maps all 18 `/api/*` prefixes to their services, with `<SERVICE>_URL`
  overrides for non-local deployments
- streams request and response bodies without buffering media
- re-serialises JSON parsed by the observability bootstrap
- returns 502 with a non-disclosing error when an upstream is unavailable
- does not authorise requests; each service remains the authority
- 8 tests: route resolution, env overrides, streaming proxy, status propagation, 502

Set `NEXT_PUBLIC_API_URL=http://localhost:8080` for local web development and
the deployed gateway origin in production. The gateway still needs an
end-to-end test and a deployment manifest before the launch gate passes.

### Documentation

- Added `docs/product/PRODUCT-FOUNDATION.md` (Phase 00 baseline).
- Added `docs/operations/OPERATIONS.md` and backup/restore scripts.
- Rewrote this state document and the gap matrix to remove stale claims.
- Added API coverage for the newer services (see `docs/api/endpoints.md`).

---

## Historical Defects Fixed (retained)

| # | Severity | Defect | Fix |
|---|----------|--------|-----|
| 1 | Critical | `JWT_SECRET` fell back to a public placeholder | `resolveSecret()` throws when unset and rejects the placeholder in production |
| 2 | Critical | Refresh tokens accepted as access tokens | `tokenKind` claim; separate verify functions |
| 3 | Critical | Test suite called a non-existent runner (`jest`) | Standardised on Vitest; phantom scripts removed |
| 4 | Critical | No migrations existed; only 7 of 17 tables covered | Aggregated schemas, generated and applied migrations |
| 5 | High | `admin` rejected on teacher routes in identity | Canonical `@edunet/rbac` middleware |
| 6 | High | `created_by`/`uploaded_by` were `NOT NULL` with `SET NULL` | Columns nullable; deletion verified |
| 7 | High | Duplicate `organizations.code` unique constraint | Inline `.unique()` removed, named constraint kept |
| 8 | High | Importing the database opened a connection at import time | Lazy `getDb()` with named missing-env error |
| 9 | Medium | Mock schema made a validation test unfalsifiable | Mock enforces required fields |
| 10 | Medium | Six packages declared tests with no test files | Scripts removed until real tests existed |
| 11 | High | 12 services duplicated auth middleware with drifted semantics | All migrated to `@edunet/rbac` |
| 12 | Critical | Fake S3 provider returned fabricated URLs and no-op operations | Deleted; real filesystem provider with signed URLs |
| 13 | High | Path traversal in local storage | UUID keys, regex validation and resolved-path containment |
| 14 | High | `media_files` had no API | Upload/list/access/delete with ownership checks |
| 15 | High | `media_files.url` forced a permanent public URL | Nullable; per-request signed URLs |
| 16 | Critical | Vitest UI arbitrary file read/execute | Vitest 4; `@vitest/ui` removed |
| 17 | Critical | `tinypool` prototype-pollution → RCE | Vitest 4 removes the dependency |
| 18 | High | Vite dev-server advisory | Root overrides pin Vite/esbuild |
| 19 | Medium | bcryptjs cost 10 caused multi-second logins | Configurable `BCRYPT_COST`, tests use 4 |
| 20 | Medium | Test files emitted into production builds | `tsconfig` excludes tests |
| 21 | Low | Vitest collected stale `dist/` suites | Per-package `vitest.config.ts` |
| 22 | Critical | AI service imported a missing `./routes`; build failed and AI was unreachable | Added routes + handlers; all AI gates pass |
| 23 | High | Prompt-template version unique constraint would collide across organizations | Globally unique version derivation; per-org deactivation |
| 24 | High | Platform default prompt could shadow a tenant override | Tenant-first ordering in prompt lookup |
| 25 | Medium | Conversation titles could not be updated | Added `updateConversationTitle` |

---

## Workstream Status

| Workstream | Status | Evidence / Gap |
|-----------|--------|----------------|
| Architecture | PARTIAL | 18 services, shared packages, lazy DB, canonical RBAC, single-origin gateway; no deployment topology |
| Identity & Auth | PARTIAL | 49 tests; reset/verification/sessions/lockout/audit; no MFA/SSO/OAuth |
| RBAC & Tenant Isolation | VERIFIED | 40 tests; shared middleware in every service |
| Database & Migrations | VERIFIED (CI ONLY locally) | Drizzle schema/migrations; constraints proven previously |
| LMS Core | COMPLETE | Courses, lessons, progress, enrolment; E2E journey in CI |
| Content & Media | PARTIAL | Lessons, resources, media, signed URLs, versions; no objectives/bookmarks/notes API, no S3 |
| Assignments & Submissions | PARTIAL | Rubrics, autosave, revisions, grade history; no attachments/late policy |
| Assessment | PARTIAL | Five objective types, partial credit, rechecks, banks, randomisation; UI basic |
| Offline / PWA | PARTIAL | Queue, backoff, dedupe, conflicts, service worker; queue not wired into mutations |
| i18n | COMPLETE | Bengali/English catalogues and web toggle; native review pending |
| Design System | PARTIAL | 16 primitives, tokens, dark mode; no icon system/RTL audit |
| Student Platform | PARTIAL | Academic/attendance/achievements/certificates/streaks backend; no UI |
| Parent Platform | PARTIAL | Child-scoped API; no UI |
| Teacher Platform | PARTIAL | Core authoring/grading UI; no attendance/analytics UI |
| Notifications | PARTIAL | In-app only; no delivery adapters |
| Search | PARTIAL | `ILIKE` only |
| Analytics | PARTIAL | Endpoints only; no dashboards/warehouse |
| Communication | PARTIAL | Messaging/moderation/forums backend; no UI/realtime |
| Calendar / Tutoring / Events | PARTIAL | Full backend; no UI |
| Live Learning | PARTIAL | Records/attendance/analytics; no video integration |
| AI | PARTIAL | Consent, safety, quota, prompts, usage, audit, conversations; no UI/provider configured |
| Support & Counseling | PARTIAL | Tickets/escalation/appointments backend; no UI |
| Academics & Attendance | PARTIAL | Full admin backend; no UI |
| Admin / Flags / Settings | PARTIAL | Backend; no console |
| Privacy & Consent | PARTIAL | Consent + data requests; no export/erase execution or retention jobs |
| Integrations / Webhooks | PARTIAL | Config only; delivery/signing unproven |
| Security Hardening | NEEDS HARDENING | No rate limiting/CORS/CSP; tokens in localStorage; scan pending |
| Observability | COMPLETE | Logs, request IDs, metrics, health/ready; no dashboards/alerts |
| CI/CD | PARTIAL | Gates configured; hosted run pending; no deploy job |
| Infrastructure | MISSING | No containers/IaC/CDN |
| API Gateway | PARTIAL | `@edunet/gateway` maps all prefixes and is unit-tested; not integration-tested or deployed |
| Backup/DR | PARTIAL | Scripts + runbook; no drill or media snapshot |
| Performance / Load | MISSING | No load test |
| QA | PARTIAL | 315 unit tests; one E2E journey (CI); no contract/visual/a11y suites |
| Documentation | PARTIAL | Product/ops/state/API refreshed; some historical docs remain stale |
| Pilot / Rollout / Operations | MISSING | No pilot plan, cohort rollout or staffing rota |

---

## Active Blockers

1. **No local PostgreSQL/Docker** → migrations, database integration and the
   tenant-isolation suite cannot be re-run here. Use CI or a disposable
   PostgreSQL 16 instance.
2. **No Playwright browsers** → the browser journey cannot run here. Install
   Chromium and point `DATABASE_URL` at a disposable database, or rely on CI.
3. **Gateway not deployed** → `@edunet/gateway` exists and is unit-tested, but
   no deployment manifest, end-to-end gateway test or TLS termination is in the
   repository.
4. **AI provider unconfigured** → `AI_GATEWAY_URL`/`AI_GATEWAY_API_KEY` are
   absent, so AI must degrade to an unavailable response. Do not enable AI in
   the pilot until a provider and human escalation path are verified.
6. **No container/deployment artifacts** → a reproducible production deploy is
   not possible from the repository alone.

---

## Next Priority (highest risk first)

1. Deploy and end-to-end test the gateway (TLS, timeouts, upstream health).
2. Add container/build manifests and a deployment/rollback job to CI.
3. Harden the edge: rate limiting, CORS, security headers, token storage,
   dependency scan.
4. Drill backup and restore, including the media volume, and record the RTO.
5. Wire the offline queue into progress/autosave/submission flows.
6. Add the AI, parent, admin, communication and support UI surfaces.
7. Run load, accessibility and Bengali review before any pilot cohort.
