# EduNet Architecture Overview

Last updated: 2026-10-23
Related: `docs/architecture/scaffold.md`, `docs/operations/OPERATIONS.md`

## Principles

- **Modular by domain** — each domain owns its routes, handlers and schema.
- **One deployable toolchain** — pnpm workspaces and Turbo build every package.
- **Tenant isolation by default** — `organizationId` is part of every query and
  the canonical `@edunet/rbac` middleware is the only auth implementation.
- **Fail closed** — missing secrets, missing consent and missing AI provider
  configuration produce errors, not fabricated success.
- **Pure logic is testable** — safety, grading, randomisation, offline queue,
  i18n and storage signing live in functions that do not require HTTP or a DB.
- **Observability is not optional** — every service bootstraps request IDs,
  structured logs, metrics and health/readiness endpoints.

## Technology

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 22, TypeScript strict |
| API | Express 4, Zod validation |
| Web | Next.js App Router, React, Tailwind |
| Database | PostgreSQL 16, Drizzle ORM |
| Auth | JWT access + refresh with token-kind claims, bcrypt |
| Monorepo | pnpm workspaces, Turbo |
| Tests | Vitest; Playwright for the browser journey |
| Observability | Zero-dependency logger, request IDs, Prometheus text metrics |

## Services

| Service | Prefix | Port | Responsibility |
|---------|--------|------|----------------|
| identity | `/api/auth` | 3001 | Auth, sessions, reset, verification, lockout, audit |
| organizations | `/api/organizations` | 3002 | Tenants |
| users | `/api/users` | 3003 | User administration |
| courses | `/api/courses` | 3004 | Catalogue and publishing |
| enrollments | `/api/enrollments` | 3005 | Enrolment |
| assignments | `/api/assignments` | 3006 | Assignments |
| submissions | `/api/submissions` | 3007 | Submissions, autosave, grading |
| content | `/api/content` | 3008 | Modules, lessons, resources, media |
| assessments | `/api/assessments` | 3009 | Quizzes, attempts, grading, rechecks |
| notifications | `/api/notifications` | 3010 | In-app notifications |
| parents | `/api/parents` | 3011 | Guardian relationships and child views |
| search | `/api/search` | 3012 | Tenant-scoped search |
| analytics | `/api/analytics` | 3013 | Course/student/assignment analytics |
| engagement | `/api/engagement` | 3014 | Calendar, tutoring, events, live classes |
| communication | `/api/communication` | 3015 | Messaging, moderation, forums |
| support | `/api/support` | 3016 | Help centre, tickets, counseling |
| platform | `/api/platform` | 3017 | Academics, attendance, flags, audit, privacy |
| ai | `/api/ai` | 3018 | Consent-gated AI, quotas, prompts, feedback |
| gateway | `/api/*` | 8080 | Single origin; streams requests to the service prefixes |

The web app calls **one** origin (`NEXT_PUBLIC_API_URL`) served by
`@edunet/gateway` (port 8080). The gateway maps every prefix above to a
`<SERVICE>_URL` override or `http://127.0.0.1:<port>`, streams request and
response bodies, and returns 502 when an upstream is unavailable. It does not
authorise requests. The E2E harness still composes routers directly on port
3001; an end-to-end gateway test is a launch task.

## Packages

| Package | Responsibility |
|---------|----------------|
| `@edunet/database` | Drizzle schema, migrations, lazy connection |
| `@edunet/rbac` | Roles, permissions, authenticate/authorize middleware |
| `@edunet/observability` | Bootstrap, logger, request IDs, metrics, health |
| `@edunet/offline` | Offline queue, backoff, conflict resolution, download planning |
| `@edunet/i18n` | Bengali/English catalogues, formatting, locale detection |
| `@edunet/ui` | Design-system primitives and tokens |
| `@edunet/api-client` | Browser API client |
| `@edunet/auth` | Web auth context |
| `@edunet/config` | Environment configuration |
| `@edunet/testing` | Test utilities |
| `@edunet/types` | Shared domain types |
| `@edunet/validation` | Shared Zod schemas |

## Data Flow

```
Browser (Next.js)
  -> API origin / gateway
    -> service router (authenticate -> authorize -> validate)
      -> handler (tenant-scoped business rules)
        -> db.ts (Drizzle, organizationId predicate)
          -> PostgreSQL
```

- JWT access tokens carry user id, role and organization. Refresh tokens carry
  a distinct `tokenKind` and are rejected as access tokens.
- Every service query includes `organizationId`; parent reads additionally
  verify a guardian relationship.
- Media is private: the database stores a key, and access is granted through a
  short-lived HMAC-signed URL. Path traversal is blocked by key generation and
  resolved-path containment.
- AI calls check consent → screen safety → redact PII → enforce quota → call the
  provider with fallback → screen output → persist message/usage/audit.

## Reliability

- Services are stateless and can be scaled horizontally behind the gateway.
- PostgreSQL is the only stateful dependency; media uses a filesystem volume
  that must be backed up or replaced with object storage.
- `/health` proves the process is alive; `/ready` proves dependencies are
  usable; `/metrics` exposes bounded-cardinality HTTP metrics.
- Backups use `pg_dump` custom format with SHA-256 verification; restore is
  scripted but has not been drilled.
- There is no Redis, queue or background worker yet. Notification delivery and
  webhook retries are therefore not production-grade.

## Security Boundaries

| Boundary | Control |
|----------|---------|
| Internet → API | TLS termination at the proxy (to be deployed), bearer auth |
| Service → service | Currently direct HTTP on a private network; no mTLS |
| Tenant → tenant | RBAC + organization predicate + integration tests |
| User → user | Ownership checks on courses, submissions, media, conversations |
| Minor → AI | Consent record + safety screening + crisis escalation |
| Media → public | Signed, expiring URLs; MIME allowlist; 25 MB cap |

Known gaps: shared rate-limit store, deployment-specific CORS policy, CSP
configuration review, and a recent external vulnerability scan. Token storage now
uses httpOnly cookies with an in-memory access token in the web client.

## Scalability Path

1. Deploy behind a gateway; scale web and API replicas independently.
2. Move media to S3-compatible object storage with versioning.
3. Add Redis for rate limiting and notification queues.
4. Add read replicas for analytics; keep transactional writes on the primary.
5. If one domain dominates load, extract its database schema and deploy it
   separately; the HTTP boundary already exists.
