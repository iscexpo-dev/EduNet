# AGENTS.md

## Agent contract

- This repository runs in autonomous mode: **do not ask the user questions**. Read
  `agent/MASTER_AGENT.md`, then `prompts/MASTER_IMPLEMENTATION.md` before editing
  (or run `./scripts/agent-launch.sh`). Resolve ambiguity from existing code first.
- Resume from `PROGRESS_STATE.json` and `todo/ACTIVE-PLAN.md`, not from prose.
  `state/progress.md` is explicitly superseded, and some status docs are dated
  snapshots; verify against the live checkout, `package.json`, and CI.
- Work the launch order: `FOUNDATION / AGENT LAUNCH` -> `ARCHITECTURE` ->
  `IDENTITY/RBAC` -> `CORE LMS`.
- A gate is complete only after executed evidence. Update `PROGRESS_STATE.json`
  and `todo/ACTIVE-PLAN.md` after meaningful checkpoints. If PostgreSQL, Docker,
  or Playwright is unavailable, record the gate as BLOCKED; never fabricate results.
- Implement end-to-end (schema + migration + API + validation + authorization +
  UI + tests + docs). Do not leave TODO/FIXME placeholders for core behavior.

## Toolchain and layout

- Node 22 + pnpm 8.15.0 via Corepack; lockfile format is v6. Match CI; do not
  upgrade the lockfile or regenerate it with a different pnpm major.
- `apps/web` is Next.js App Router (Tailwind, `@edunet/ui`). `services/` holds 18
  Express domain services plus `gateway`. `packages/` holds shared TypeScript libs.
- The web app calls a single origin (`NEXT_PUBLIC_API_URL`, normally gateway on
  8080). Services listen on 3001-3018; see `docs/development/setup.md` for the map.
- The gateway only proxies; each service is the authority for auth, tenancy, and
  business rules. A new service/prefix requires `SERVICE_PORTS` and
  `ROUTE_TO_SERVICE` updates in `services/gateway/src/upstreams.ts`.
- Every service uses `bootstrapService` from `@edunet/observability`, which adds
  `/health`, `/ready`, `/metrics`, request IDs, and structured errors. Services
  export `app` and only call `start()` when `require.main === module` and
  `NODE_ENV !== 'test'`; keep this pattern so tests can import routers.
- Shared packages expose built `dist` output. Build affected packages before
  running compiled services; do not import another service's source directly.
- Drizzle schema is aggregated in `packages/database/drizzle.config.ts`, including
  service-owned schemas for content, assessments, and notifications. Schema changes
  in those services still require a migration under `packages/database/drizzle`.
- `getDb()` / `resolveConnectionString()` in `@edunet/database` use a lazy client.
  Never open connections at import time or duplicate a connection string parser.

## Commands

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev                        # web + services + gateway via Turbo
pnpm verify                     # typecheck -> lint -> test -> build
pnpm typecheck                  # 35 tasks
pnpm lint                       # 32 tasks
pnpm test                       # Turbo test; builds package deps first
pnpm build
```

Focused verification:

```bash
pnpm turbo run test --filter @edunet/identity --concurrency=2
pnpm --filter @edunet/rbac exec vitest run src/permissions.test.ts
pnpm --filter @edunet/web typecheck
pnpm --filter @edunet/web lint
```

Direct `pnpm --filter <pkg> test` skips the build graph and can exercise stale
workspace `dist`; prefer the Turbo form after changing shared packages.
Run `typecheck` and `build` as separate commands (or use `pnpm verify` order).
A combined `turbo run typecheck lint test` can race the web build against
`apps/web` typecheck and fail on missing `.next/types` files.

Database and browser gates (CI-only when the tools are absent):

```bash
export DATABASE_URL=postgres://user:pass@localhost:5432/edunet_test
pnpm --filter @edunet/database migrate
pnpm --filter @edunet/database test:integration   # destructive; disposable DB only
pnpm db:check
pnpm db:generate                                 # after schema changes; review SQL
pnpm --filter @edunet/web exec playwright install chromium
DATABASE_URL=... JWT_SECRET=... BCRYPT_COST=4 pnpm --filter @edunet/web build
DATABASE_URL=... JWT_SECRET=... BCRYPT_COST=4 pnpm --filter @edunet/web test:e2e
```

E2E uses ports 3000 and 3001 (direct routers, not the gateway), creates and then
deletes its own organization. `pnpm ops:test` and `bash -n scripts/*.sh` cover the
operations scripts. `pnpm format:check` only checks deployment docs and scripts,
so do not mass-format the repo to satisfy it.

## Environment gotchas

- There is **no dotenv loader** in services, gateway, drizzle-kit, or scripts.
  `.env.local` is loaded by Next.js only. Export `DATABASE_URL` / `JWT_SECRET` in
  the shell for API, migration, and E2E commands.
- `JWT_SECRET` is mandatory and has no fallback; production startup rejects short
  or placeholder values. Use `BCRYPT_COST=4` only in tests. Production validates
  HTTPS origins and fails closed on missing config (`@edunet/config`).
- Use `DATABASE_URL`, or set every one of `DB_HOST`, `DB_PORT`, `DB_USER`,
  `DB_PASSWORD`, `DB_NAME`. Never commit `.env*` files or secrets.

## Conventions that are easy to get wrong

- Authentication and authorization must come from `@edunet/rbac`; do not add
  service-local middleware or hardcoded JWT secrets. Access/refresh tokens are
  supported as httpOnly cookies (`edunet_access`, `edunet_refresh`) and bearer.
- Scope every query by `organizationId` and add an ownership/tenant test. Never
  let callers change their own role, organization, email, or verification state;
  validate payloads with Zod and whitelist update fields.
- In the web app, build API URLs with `apiUrl()` / `NEXT_PUBLIC_API_URL`; never
  hardcode `localhost:3001`. Keep English and Bengali strings in `@edunet/i18n`.
- Add migrations for schema changes; never use `db:push` for committed work.
- Unit tests are colocated Vitest files (`*.test.ts`). The PostgreSQL integration
  suite is serial and deletes rows; always point it at a disposable database.
- Do not edit `dist/`, `.next/`, `.turbo/`, or generated migration output by hand.
