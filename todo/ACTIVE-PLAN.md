# EduNet Active Plan

Resumable execution checklist. Update this file and `PROGRESS_STATE.json` after
every meaningful checkpoint. A checked box requires executed evidence, not just
existing code.

Status keys: `[x]` done+verified · `[~]` in progress · `[ ]` pending · `[!]`
blocked · `[-]` deferred intentionally.

## How to resume

1. Read `PROGRESS_STATE.json` (authoritative machine-readable state).
2. Read this file (human checklist).
3. Read `docs/EDUNET-IMPLEMENTATION-STATE.md` and `docs/EDUNET-ROADMAP-GAP-MATRIX.md`.
4. Run the baseline validation below; do not trust stored results.
5. Continue from the first unchecked, unblocked item.
6. After each checkpoint: update `PROGRESS_STATE.json`, tick here, append evidence.

## Checkpoint 0 — Resume and reconcile state

- [x] Inspect live checkout, git status, branch, history.
- [x] Reconcile prompt baseline (`ef96741`, `/Users/khulnasoft/...`) with live
      checkout (`8273870`, `/vercel/share/v0-project`); confirmed ancestor.
- [x] Identify environment limits (no PostgreSQL, Docker, Playwright).
- [x] Terminate stale `turbo run dev` watchers that caused OOM (exit 137).
- [x] Create `PROGRESS_STATE.json`.
- [x] Create `docs/FINAL_REPORT_TEMPLATE.md`.
- [x] Create this active plan and wire it into `todo/README.md`.

## Checkpoint 1 — Baseline re-verification (evidence required) — COMPLETE 2026-10-24

Run with limited concurrency to avoid OOM:

```bash
pnpm turbo run typecheck --concurrency=2
pnpm turbo run lint --concurrency=2
pnpm turbo run test --concurrency=2
pnpm build
pnpm audit --audit-level=high
pnpm db:check
pnpm ops:test
pnpm format:check
```

- [x] Typecheck recorded.
- [x] Lint recorded (errors vs warnings separated).
- [x] Unit tests recorded (task count + test count).
- [x] Production build recorded.
- [x] Dependency audit recorded.
- [x] Migration static check recorded (4 migrations expected).
- [x] Operations script self-test recorded.
- [x] Format check recorded.
- [x] `PROGRESS_STATE.json` validation block updated with exact results.

## Checkpoint 2 — Fix any failing baseline gate — COMPLETE 2026-10-24

- [x] Root-cause every failure; fix implementation, not the test. (high `body-parser` advisory fixed via override)
- [x] Re-run the failed gate and record the new result. (`pnpm audit --audit-level=high` now passes)
- [x] No gate left failing without a documented blocker.

## Checkpoint 3 — Highest-risk executable launch gaps

Ordered by risk. Items marked `[!]` need external infrastructure.

- [!] Real PostgreSQL migration + `test:integration` run (no DB locally).
- [!] Real backup restore drill with timing/RTO (no DB locally).
- [!] Container build/scan (no Docker locally; CI job configured).
- [!] Staging deploy + TLS/DNS smoke (no credentials/infrastructure).
- [x] Token storage: move access/refresh tokens out of `localStorage` to
      `httpOnly` cookies (implemented via `edunet_access`/`edunet_refresh` cookies;
      web keeps access token in memory).
- [x] Shared rate-limit store or single-replica constraint made explicit
      (`GATEWAY_RATE_LIMIT_STORE=postgres`, `GATEWAY_REPLICA_COUNT` validation,
      migration `0004`, tests — 2026-10-25).
- [x] Parent web surface (`/parent` dashboard, 2026-10-24).
- [x] Admin web console added with users/organizations/audit views (`/admin`).
- [x] Replace hardcoded `localhost:3001` API origins with `NEXT_PUBLIC_API_URL`.
- [x] Offline queue wired into submission/progress (2026-10-24); autosave
      still sends immediately and is not queued yet.
- [x] Accessibility audit baseline (keyboard/focus/labels/contrast).
- [x] Search normalization/ranking for Bengali + English: restored the missing
      `services/search/src/normalize.ts`, added whitespace/AND tokenization,
      Bengali digit/zero-width/nukta normalization, LIKE escaping, bounded
      type/sort/pagination parsing and 21 unit tests (2026-10-25).
- [ ] AI provider configuration and human escalation path.
- [ ] KPI collection pipeline from persisted data.
- [ ] Pilot cohort/training/support rota; execution remains NOT STARTED.

## Checkpoint 4 — Documentation truth pass — COMPLETE 2026-10-24

- [x] Root `README.md` status matches executed evidence.
- [x] Gap matrix and implementation state cite this run.
- [x] Final report generated from `docs/FINAL_REPORT_TEMPLATE.md` (see run report in chat).
- [x] State files committed (84f0d58; push deferred to PR workflow).

## Checkpoint 5 — Parent surface and API origin — COMPLETE 2026-10-24

- [x] Add `/parent` dashboard with children, courses, grades and
      loading/empty/error/unauthorized states.
- [x] Harden parents service (same-org linking, path-param access, whitelisted
      updates, clamped pagination, grade permission, lazy DB).
- [x] Replace 16 hardcoded `localhost:3001` origins with `apiUrl()` and
      `NEXT_PUBLIC_API_URL`.
- [x] Make dashboard links role-aware; logout redirects to `/login`.
- [x] Parents tests 8/8; web typecheck/lint/build pass; committed `bc9f844`.

## Checkpoint 6 — Users/organizations security hardening — COMPLETE 2026-10-24

- [x] Users: reject `role`/`organizationId`/`email`/verification changes; allow
      only profile fields.
- [x] Users: restrict `GET /:id` to self, teacher/tutor/mentor or admin in the
      same organization (IDOR fix).
- [x] Organizations: scope list/get/update to the caller's organization
      (cross-tenant leak fix); whitelist `name`/`address`/`isActive`.
- [x] Clamp pagination in both services; use `resolveConnectionString` and add
      `closeDb` for organizations.
- [x] Add 12 policy tests; full gates pass (107 tasks, 380 tests, 32 files.
- [x] Committed `72e5caa`; push deferred to the PR workflow.

## Checkpoint 8 — Token storage hardening — COMPLETE 2026-10-24

- [x] Identity issues httpOnly `edunet_access` and path-scoped `edunet_refresh`
      cookies; refresh reads cookie (body still accepted for tests/clients).
- [x] Web auth keeps access token in memory, refreshes through httpOnly refresh
      cookie, and calls logout to clear cookies.
- [x] Shared RBAC and identity middleware accept the httpOnly access cookie;
      gateway emits `Access-Control-Allow-Credentials`.
- [x] Full gates pass (107 tasks, 380 tests, 32 files).

## Checkpoint 9 — Offline queue wiring — COMPLETE 2026-10-24

- [x] Added `useOfflineSync` that flushes the local queue via the API on reconnect.
- [x] Wired offline assignment submission and lesson completion into the queue.
- [x] Full gates pass after wiring (107 tasks, 380 tests, 32 files).

## Checkpoint 13 — Rate-limit topology — COMPLETE 2026-10-25

- [x] Added `GATEWAY_RATE_LIMIT_STORE=memory|postgres`; memory is the default
      and valid for exactly one replica.
- [x] Added `GATEWAY_REPLICA_COUNT` validation: production startup rejects
      `> 1` with the in-process store and warns when the count is undeclared.
- [x] Added atomic Postgres shared limiter (`INSERT ... ON CONFLICT DO UPDATE`),
      window reset, bounded pruning and fail-closed store errors.
- [x] Added migration `0004_sad_madelyne_pryor` for `rate_limit_windows` and
      closed the missing `audit_logs.hash`/`previous_hash` schema drift.
- [x] Gateway/config unit tests cover shared counters, window reset, error
      propagation, store selection and replica validation; database integration
      test covers concurrent increments (CI-only here).
- [x] Evidence: full gates PASS — typecheck 35/35, lint 32/32 (0 errors),
      tests 49/49 tasks / 389 tests / 32 files, build 29/29, audit PASS
      (1 moderate dev-only), `pnpm db:check` 5 migrations, `ops:test` and
      `format:check` PASS. Logs recorded in `PROGRESS_STATE.json`.
- [x] Compose (`local` single replica, `staging` shared store) and deployment
      docs updated.

## Checkpoint 16 — Next.js 16 upgrade — COMPLETE 2026-10-26

- [x] Upgraded `next` 15.5.28 → 16.4.3 in the workspace and web app.
- [x] Upgraded React/React DOM to 19.3.1 and React types to 19.3.0 for the web
      app, `@edunet/ui` and `@edunet/auth`.
- [x] Replaced the removed `next lint` command with ESLint 9 flat config
      (`eslint-config-next/core-web-vitals`); legacy packages keep ESLint 8 and
      their existing `.eslintrc` via a root devDependency.
- [x] Migrated `middleware.ts` to the Next.js 16 `proxy.ts` convention.
- [x] Set the Turbopack workspace root in `next.config.js` and verified both the
      default and `NEXT_OUTPUT=standalone` production builds.
- [x] Evidence: typecheck 36/36, lint 32/32 (0 errors), tests 50/50 tasks,
      Next.js 16.4.3 Turbopack build + standalone output PASS. PostgreSQL,
      Docker and Playwright gates remain BLOCKED in this sandbox.

## Definition of done for this run

- Baseline gates re-executed and recorded.
- Every failure either fixed or documented as BLOCKED with a prerequisite.
- `PROGRESS_STATE.json` and this checklist reflect reality.
- No secrets, debug files or fabricated deployment claims.
