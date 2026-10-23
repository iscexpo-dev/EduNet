# EduNet Development Setup

## Prerequisites

- Node.js 22+
- pnpm 9+
- PostgreSQL 16+

## Installation

```bash
# Clone the repository
git clone https://github.com/khulnasoft/EduNet.git
cd EduNet

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your database credentials

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

## Environment Variables

```env
# Database
DATABASE_URL=postgres://user:password@localhost:5432/edunet
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=
DB_NAME=edunet

# JWT (required; replace with at least 32 random characters)
JWT_SECRET=replace-with-at-least-32-random-characters

# API (gateway origin)
NEXT_PUBLIC_API_URL=http://localhost:8080
GATEWAY_PORT=8080
```

## Development Commands

```bash
# Build all packages
pnpm build

# Run tests
pnpm test

# Run linting
pnpm lint

# Run type checking
pnpm typecheck

# Start development servers
pnpm dev

# Clean build artifacts
pnpm clean
```

## Project Structure

- `apps/web/` - Next.js frontend application
- `packages/` - Shared libraries and utilities
- `services/` - Backend microservices
- `docs/` - Documentation
- `state/` - Progress tracking

## Code Style

- TypeScript strict mode
- ESLint for linting
- Prettier for formatting
- Conventional commits for git messages

## Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch
```

### PostgreSQL integration test

The database integration suite writes and deletes rows. Use a disposable
PostgreSQL database with the current migrations applied; do not point it at a
shared or production database.

```bash
DATABASE_URL=postgres://postgres:password@localhost:5432/edunet_test \
  pnpm --filter @edunet/database test:integration
```

The command fails when `DATABASE_URL` is missing so it cannot silently report a
passing database integration run without connecting to PostgreSQL.


### Browser end-to-end journey

The browser test creates an isolated organization in a disposable PostgreSQL
database, starts the web app and the relevant API routes, then exercises teacher
registration/course/lesson creation and student registration/enrollment/lesson
viewing and progress completion. Apply migrations first, then run:

```bash
pnpm --filter @edunet/web exec playwright install chromium
DATABASE_URL=postgres://postgres:password@localhost:5432/edunet_test \
JWT_SECRET=local-e2e-secret-change-this BCRYPT_COST=4 \
pnpm --filter @edunet/web build
DATABASE_URL=postgres://postgres:password@localhost:5432/edunet_test \
JWT_SECRET=local-e2e-secret-change-this BCRYPT_COST=4 \
pnpm --filter @edunet/web test:e2e
```

The E2E test uses ports 3000 and 3001 and deletes its organization and related
rows after it finishes. Keep `DATABASE_URL` pointed at a disposable database.

## Full service map

`pnpm dev` starts the web app, all services and the gateway. The gateway gives
the web app one origin; set `NEXT_PUBLIC_API_URL=http://localhost:8080`. The E2E
harness still composes routers directly on port 3001.

| Service | Port | Prefix |
|---------|------|--------|
| web | 3000 | — |
| identity | 3001 | `/api/auth` |
| organizations | 3002 | `/api/organizations` |
| users | 3003 | `/api/users` |
| courses | 3004 | `/api/courses` |
| enrollments | 3005 | `/api/enrollments` |
| assignments | 3006 | `/api/assignments` |
| submissions | 3007 | `/api/submissions` |
| content | 3008 | `/api/content` |
| assessments | 3009 | `/api/assessments` |
| notifications | 3010 | `/api/notifications` |
| parents | 3011 | `/api/parents` |
| search | 3012 | `/api/search` |
| analytics | 3013 | `/api/analytics` |
| engagement | 3014 | `/api/engagement` |
| communication | 3015 | `/api/communication` |
| support | 3016 | `/api/support` |
| platform | 3017 | `/api/platform` |
| ai | 3018 | `/api/ai` |
| gateway | 8080 | `/api/*` (all prefixes) |

Set `NEXT_PUBLIC_API_URL=http://localhost:8080` and run
`pnpm --filter @edunet/gateway dev` alongside the services. Override individual
upstreams with `IDENTITY_URL`, `COURSES_URL`, `AI_URL`, and so on. The gateway
still needs a deployment manifest and end-to-end test before launch.

## Configuration checklist

- `DATABASE_URL` (or `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`)
- `JWT_SECRET` — required; no fallback secret
- `BCRYPT_COST` — 10 by default; use 4 only in tests
- `MEDIA_STORAGE_PATH` — filesystem root for private media
- `MEDIA_SIGNING_SECRET` — falls back to `JWT_SECRET` if unset
- `AI_GATEWAY_URL`, `AI_GATEWAY_API_KEY` — AI provider
- `AI_DAILY_TOKEN_LIMIT`, `AI_MAX_OUTPUT_TOKENS`, `AI_REQUIRE_CONSENT`
- `AI_COST_IN_MICROS_PER_TOKEN`, `AI_COST_OUT_MICROS_PER_TOKEN`
- `AI_SYSTEM_PROMPT`, `AI_COUNSELOR_URL`
- `NEXT_PUBLIC_API_URL` — single API origin for the web app

## Verification workflow

```bash
pnpm typecheck   # 27 tasks
pnpm lint        # 32 tasks, 0 errors
pnpm test        # 37 tasks, 323 tests
pnpm build       # 21 tasks
```

Database and browser gates need PostgreSQL 16 and Chromium:

```bash
pnpm --filter @edunet/database migrate
DATABASE_URL=postgres://... pnpm --filter @edunet/database test:integration
pnpm --filter @edunet/web exec playwright install chromium
DATABASE_URL=postgres://... JWT_SECRET=local-e2e-secret BCRYPT_COST=4 \
  pnpm --filter @edunet/web test:e2e
```

Backups:

```bash
DATABASE_URL=... ./scripts/backup-db.sh
CONFIRM_RESTORE=yes DATABASE_URL=... ./scripts/restore-db.sh <archive>
```
