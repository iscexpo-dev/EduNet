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

## Checkpoint 17 — Content personal state — COMPLETE 2026-10-27

- [x] Served the existing `learning_objectives` / `lesson_objectives` tables:
      course objective CRUD and lesson attach/detach, restricted to the owning
      teacher or an admin, with cross-course attachment rejected.
- [x] Added student-only lesson bookmarks (`GET/POST/DELETE /bookmarks`) and
      private notes (`GET /notes`, lesson note get/upsert/delete`) pinned to the
      caller id and the lesson's organization.
- [x] Added `services/content/src/policy.ts` (uuid, ownership, payload and
      pagination validation) with 17 unit tests; content suite 41/41.
- [x] Fixed the offline queue write path: pages previously called
      `enqueue([], …)` without persisting, so queued work was dropped. Added
      `apps/web/src/lib/offline-queue.ts` and wired assignment/lesson flows.
- [x] Added bookmark and note controls (offline-aware) to the lesson learn page.
- [x] Evidence: content build/lint 0 errors, web typecheck/lint 0 errors and
      Next.js production build, workspace typecheck 36/36, tests 50/50.
- [x] Documented the new endpoints in `docs/api/endpoints.md`.
- [x] Offline assessment submission completed in `4c0c44b` (checkpoint 19).
- [x] Objectives authoring UI completed in checkpoint 20.

## Checkpoint 18 — Public shell accessibility and responsive navigation — COMPLETE 2026-10-27

- [x] Added a keyboard-visible skip link targeting the public content region.
- [x] Made public navigation available on small screens without horizontal page overflow.
- [x] Added visible focus rings and an accessible home label to public shell controls.
- [x] Web typecheck and lint pass with two pre-existing warnings and zero errors.

## Checkpoint 19 — Offline assessment submission — COMPLETE 2026-10-27

- [x] Queued quiz submission through the shared offline queue when the request
      cannot reach the API (`4c0c44b`, merged as `dc3616c`).
- [x] Student quiz page shows a clear offline-saved message and flushes on
      reconnect through `useOfflineSync`.

## Checkpoint 20 — Teacher lesson and objective authoring — COMPLETE 2026-10-27

- [x] Added `/teacher/courses/:id/lessons/:lessonId`, which fixes the broken
      Edit link from the lessons list and loads the lesson, course objectives
      and linked objectives in parallel.
- [x] Lesson form edits title, description, type, order, duration, JSON content
      and published state, with loading, unauthorized, error, retry, validation
      and success states.
- [x] Course objectives can be created, edited and deleted from the lesson
      editor; each objective can be linked or unlinked from the current lesson.
- [x] Hardened `PUT /lessons/:id` with a pure `parseLessonUpdate` policy that
      whitelists and validates fields, ignores `courseId`/`moduleId`/`deletedAt`,
      bounds text, validates lesson types and requires object JSON content.
- [x] Added 5 policy tests for lesson updates; content suite 46/46.
- [x] Evidence: content build/test/lint (0 errors), web typecheck/lint (0 errors,
      2 pre-existing warnings), Next.js production build (new route present),
      workspace typecheck 36/36, tests 50/50 tasks. PostgreSQL, Docker and
      Playwright gates remain BLOCKED in this sandbox.

## Checkpoint 21 — Analytics tenancy and teacher dashboard — COMPLETE 2026-10-27

- [x] Closed a cross-tenant IDOR in `@edunet/analytics`: every route now
      requires organization context, resolves the course within that
      organization, and allows only its owning teacher or a same-organization
      administrator. Missing/out-of-org courses return `404`; non-owners get
      `403`.
- [x] Scoped every analytics query by `organizationId`, excluded soft-deleted
      courses/enrollments/assignments/submissions, and switched the service to
      the lazy `getDb()` client (no import-time connection).
- [x] Added `services/analytics/src/policy.ts` with UUID validation, ownership
      checks, bounded `days` parsing (1–365, default 30) and score percentages;
      11 policy tests.
- [x] Added handler-level tenant tests covering cross-teacher denial, out-of-org
      404, malformed ids, missing organization, owner/admin success and
      engagement validation; analytics suite 19/19 (2 files).
- [x] Added `/teacher/courses/:id/analytics` with summary cards, grading
      progress, recent activity, assignment performance and student performance
      tables, including loading, unauthorized, error/retry and empty states;
      linked from the teacher course page.
- [x] Summary endpoint now returns `averagePercent` alongside raw average points;
      documentation records the access rules and `days` bound.
- [x] Evidence: analytics build/test/lint (0 errors, 1 pre-existing route
      warning), web typecheck/lint (0 errors, 2 pre-existing warnings), Next.js
      production build includes the analytics route, workspace typecheck 36/36,
      tests 51/51 tasks, workspace lint 32/32 (0 errors). PostgreSQL, Docker and
      Playwright gates remain BLOCKED in this sandbox.

## Checkpoint 22 — Attendance authorization and teacher UI — COMPLETE 2026-10-27

- [x] Fixed attendance authorization: teachers were denied marking because the
      handler checked `academics:write`; it now checks `attendance:write`.
      List/summary now require `attendance:read`.
- [x] Scoped attendance by role: administrators see the organization, teachers
      only homeroom/taught classes, students only themselves, parents only
      linked children with `canViewAttendance`, and tutor/mentor/other roles are
      denied. Cross-scope requests return `403`.
- [x] Hardened marking: class must be active in the organization, students must
      be actively enrolled, duplicates are rejected, and section ids must belong
      to the class.
- [x] Restricted class rosters to staff; teachers can only read their own class
      rosters. Added `?mine=true` on `/academics/classes` for teacher class lists.
- [x] Added 13 handler tests plus 9 policy assertions (platform suite 39/39) for
      list/summary scoping, marking, roster and class filtering.
- [x] Added `/teacher/attendance`: class/date pickers, roster, per-student
      status, counts, save with conflict/empty/error/retry/success states; linked
      from the teacher dashboard.
- [x] Evidence: platform typecheck/build/lint (0 errors, 1 pre-existing route
      warning), web typecheck/lint (0 errors, 2 pre-existing warnings), Next.js
      build includes `/teacher/attendance`, workspace typecheck 36/36, tests
      51/51 tasks, lint 32/32 (0 errors). PostgreSQL, Docker and Playwright gates
      remain BLOCKED in this sandbox.

## Checkpoint 23 — Student/parent attendance views — COMPLETE 2026-10-27

- [x] Added `/attendance`: students see their own records; parents select a
      linked child from the relationship-scoped children API.
- [x] Added 30/90/365-day ranges, attendance-rate and status counts, a records
      table with class names/notes, and loading/error/retry/empty/unauthorized
      states.
- [x] Added shared `readApiError` and reused it in the analytics page; linked
      attendance from the student dashboard, parent dashboard and parent portal.
- [x] Evidence: web typecheck/lint (0 errors, 2 pre-existing warnings), Next.js
      production build includes `/attendance`; full gates re-run in checkpoint 24.

## Checkpoint 24 — Offline queue and conflict triage — COMPLETE 2026-10-27

- [x] Added `/offline/queue` with queue/pending/needs-attention counts,
      per-action state/attempts/next-retry, payload review, retry-all,
      retry-one (clearing backoff) and discard with confirmation.
- [x] `@edunet/offline` now records `lastError`/`lastStatus`, clears them when a
      retry starts, and captures HTTP 409/412 so the UI can label conflicts.
- [x] `useOfflineSync` surfaces server error messages/status and broadcasts
      `edunet:queue-changed` so the banner and queue page refresh together.
- [x] Linked the queue from the offline banner and offline page.
- [x] Added offline package tests for failure metadata, retry clearing and 409
      capture; suite 21/21.
- [x] Evidence: offline tests 21/21, web typecheck/lint (0 errors, 2 pre-existing
      warnings), Next.js build includes `/offline/queue`, workspace typecheck
      36/36, tests 51/51 tasks, lint 32/32 (0 errors). PostgreSQL, Docker and
      Playwright gates remain BLOCKED in this sandbox.

## Checkpoint 25 — Student bookmarks/notes library — COMPLETE 2026-10-27

- [x] Added `/library` for students only, listing bookmarked lessons and private lesson notes.
- [x] Fetches `/api/content/bookmarks` and `/api/content/notes`, with search across titles/notes, course links, delete actions, confirmation for notes, and loading/error/empty/success states.
- [x] Linked from the student dashboard and My Courses header.
- [x] Evidence: web typecheck/lint (0 errors, 2 pre-existing warnings), Next.js production build includes `/library`, workspace typecheck 36/36, tests 51/51 tasks, lint 32/32 (0 errors). PostgreSQL, Docker and Playwright gates remain BLOCKED in this sandbox.

## Checkpoint 26 — Offline background sync and automatic conflict resolution — COMPLETE 2026-10-27

- [x] `useOfflineSync` now background-syncs on reconnect (`online`), page visibility (`visibilitychange` → visible) and every 30 seconds via `setInterval`, only when due/pending actions exist.
- [x] `@edunet/offline` `flushQueue` runs `dedupeQueue` first: pending edits superseded by a newer same-entity/type/method/endpoint edit are dropped automatically (client-side last-write-wins). Syncing actions are never dropped.
- [x] Added `LAST_WRITE_WINS_TYPES` (lesson_progress, assignment_autosave, note, bookmark) and `dedupeQueue` with 4 unit tests; offline suite 25/25.
- [x] Evidence: offline tests 25/25, web typecheck/lint (0 errors, 2 pre-existing warnings), Next.js production build, workspace typecheck 36/36, tests 51/51 tasks, lint 32/32 (0 errors). PostgreSQL, Docker and Playwright gates remain BLOCKED in this sandbox.

## Checkpoint 27 — Search facets and opt-in trigram fuzzy matching — COMPLETE 2026-10-27

- [x] Added `?facets=1` to `GET /api/search`. Single types respond `{ items, facets }`; `all` gains a `facets` object with per-type totals. Courses facet by subject, users by role; counts reflect the same tenant, active/non-deleted and term filters.
- [x] Added opt-in trigram fuzzy/typo-tolerant matching: `SEARCH_USE_TRIGRAM=true` plus migration `0005_trigram_search.sql` (creates `pg_trgm` extension and GIN trigram indexes on search columns) switches `flushQueue`-adjacent matching to `similarity()`/`%` scoring; otherwise search falls back to normalized LIKE relevance.
- [x] Added `SEARCH_USE_TRIGRAM` boolean validation to `@edunet/config` with tests; added `parseBoolean` and `trigramEnabled` helpers with tests (search suite 28/28).
- [x] Evidence: search typecheck/lint/build pass (0 errors), search tests 28/28, config typecheck/test/lint pass. PostgreSQL-backed trigram verification is BLOCKED locally (no PostgreSQL); migration `0005` is static-only until applied in CI.

## Definition of done for this run

- Baseline gates re-executed and recorded.
- Every failure either fixed or documented as BLOCKED with a prerequisite.
- `PROGRESS_STATE.json` and this checklist reflect reality.
- No secrets, debug files or fabricated deployment claims.
