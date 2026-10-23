# EduNet

EduNet is a multi-tenant, offline-capable learning platform for Bangladesh,
built as a pnpm/Turbo monorepo: one Next.js web app, eighteen Express services
and shared TypeScript packages. It supports Bengali and English, consent-gated
AI assistance, assessments, parent visibility, communication, engagement,
support, academics and administration.

## Status

**Core platform built — not ready for public launch.** The LMS, identity,
tenancy, content, assessment, offline primitives and AI backend are implemented
and covered by 334 automated tests. Launch is blocked by the missing API
gateway, containers/deployment, security hardening, an untested restore, and
UIs for the newer domains.

See:

- `docs/EDUNET-FINAL-STATUS.md` — current PASS/PARTIAL status and blockers
- `docs/EDUNET-ROADMAP-GAP-MATRIX.md` — per-workstream gap analysis
- `docs/product/PRODUCT-FOUNDATION.md` — scope, requirements, KPIs, risks
- `docs/operations/OPERATIONS.md` — deployment, backup, incident runbook

## Repository layout

```
apps/web/          Next.js App Router frontend
services/          gateway, identity, organizations, users, courses, enrollments,
                   assignments, submissions, content, assessments,
                   notifications, parents, search, analytics, engagement,
                   communication, support, platform, ai
packages/          database, rbac, observability, offline, i18n, ui,
                   api-client, auth, config, testing, types, validation
docs/              product, architecture, API, security, operations
scripts/           backup/restore and launch helpers
agent/             implementation contract for autonomous agents
```

## Quick start

```bash
pnpm install
cp .env.example .env.local        # set DATABASE_URL and JWT_SECRET
pnpm --filter @edunet/database migrate
pnpm dev
```

The web app uses one origin. Run `@edunet/gateway` on port 8080 and set
`NEXT_PUBLIC_API_URL=http://localhost:8080`; it proxies `/api/*` to services on
ports 3001–3018. Gateway TLS and an end-to-end test are still launch tasks.

## Verification

```bash
pnpm typecheck    # 35/35
pnpm lint         # 32/32, 0 errors
pnpm test         # 45/45, 334 tests
pnpm build        # 29/29
```

PostgreSQL integration and the browser journey run in CI:

```bash
pnpm --filter @edunet/database test:integration
pnpm --filter @edunet/web test:e2e
```

## Operations

```bash
DATABASE_URL=... ./scripts/backup-db.sh
CONFIRM_RESTORE=yes DATABASE_URL=... ./scripts/restore-db.sh <archive>
```

Every service exposes `/health`, `/ready` and `/metrics`. Secrets are supplied
by the environment; `.env*` files are git-ignored and must never be committed.

## Contributing

- Preserve domain boundaries and use `@edunet/rbac` for auth.
- Scope every query by `organizationId` and add an ownership test.
- Add a migration for schema changes; never rely on `db:push` in production.
- Keep pure logic in testable functions and add tests with the change.
- Run typecheck, lint, tests and build before proposing a release.
