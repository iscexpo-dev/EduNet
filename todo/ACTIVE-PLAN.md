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
- [ ] Token storage: move access/refresh tokens out of `localStorage` to
      `httpOnly` cookies (or document a hard deferral with risk acceptance).
- [ ] Shared rate-limit store or single-replica constraint made explicit.
- [x] Parent web surface (`/parent` dashboard, 2026-10-24).
- [ ] Admin web console (still API-only).
- [x] Replace hardcoded `localhost:3001` API origins with `NEXT_PUBLIC_API_URL`.
- [ ] Offline queue wired into submission/progress/autosave, or ship
      read-only offline explicitly.
- [ ] Accessibility audit baseline (keyboard/focus/labels/contrast).
- [ ] Search normalization/ranking for Bengali + English.
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
- [x] Add 12 policy tests; full gates pass (107 tasks, 373 tests, 31 files).

## Definition of done for this run

- Baseline gates re-executed and recorded.
- Every failure either fixed or documented as BLOCKED with a prerequisite.
- `PROGRESS_STATE.json` and this checklist reflect reality.
- No secrets, debug files or fabricated deployment claims.
