# Production Environment

## Topology

Use a TLS-terminating reverse proxy or load balancer in front of:

- the web app (`@edunet/web`, port 3000 / container 3000);
- the gateway (`@edunet/gateway`, port 8080).

Only the web app and gateway are public. Individual services stay on a private
network and are reached by the gateway through `<SERVICE>_URL` variables. The
browser uses one API origin (`NEXT_PUBLIC_API_URL`) so CORS and CSP stay simple.

Minimum pilot topology:

- managed PostgreSQL 16 with TLS, automated backups and PITR;
- 2 web replicas and 1 gateway replica by default. The in-process limiter
  enforces counters per process, so set `GATEWAY_RATE_LIMIT_STORE=postgres`
  (and declare `GATEWAY_REPLICA_COUNT`) before running more than one gateway
  replica;
- 18 service processes or containers on a private network;
- a persistent media volume or object storage with versioning;
- a metrics/logs backend and an alert destination.

## Required API environment

| Variable                   | Requirement                                                            |
| -------------------------- | ---------------------------------------------------------------------- |
| `NODE_ENV`                 | `production`                                                           |
| `JWT_SECRET`               | unique, >= 32 characters, from a secret manager; placeholders rejected |
| `DATABASE_URL`             | PostgreSQL URL with `sslmode=require` in managed environments          |
| `TRUST_PROXY`              | exact number of trusted proxy hops                                     |
| `CORS_ORIGINS`             | comma-separated public web origins; empty means same-origin only       |
| `ENABLE_HSTS`              | `true` only after HTTPS is verified on all hostnames                   |
| `GATEWAY_RATE_LIMIT_STORE` | `memory` (default, one replica) or `postgres` (shared)                 |
| `GATEWAY_REPLICA_COUNT`    | integer replica count; required to declare for multi-replica setups    |
| `BCRYPT_COST`              | `12` for production                                                    |
| `SHUTDOWN_TIMEOUT_MS`      | graceful shutdown budget, default 10000                                |

Production startup fails fast on missing/short JWT secrets, missing database
URL, non-HTTPS CORS origins, `TRUST_PROXY` without a value, insecure TLS
settings, invalid bcrypt cost, or AI enabled without consent enforcement.
Validation never prints secret values.

If a managed provider requires `sslmode=no-verify` or a plain connection on a
private network, set `DATABASE_ALLOW_INSECURE=true` explicitly and record the
exception. This is not the default.

## Identity and media

```env
BCRYPT_COST=12
DELIVER_EMAILS=true
MEDIA_STORAGE_PATH=/var/lib/edunet/media
MEDIA_SIGNING_SECRET=<random secret, independent of JWT_SECRET>
```

Use a real email/SMS provider before inviting users. In development,
`DELIVER_EMAILS=false` returns tokens in responses; never enable that in
production.

## Gateway edge

```env
GATEWAY_PORT=8080
TRUST_PROXY=1
CORS_ORIGINS=https://app.example.org
ENABLE_HSTS=true
GATEWAY_RATE_LIMIT_PER_MINUTE=120
GATEWAY_AUTH_RATE_LIMIT_PER_MINUTE=20
GATEWAY_AI_RATE_LIMIT_PER_MINUTE=30
# Single replica (default):
GATEWAY_RATE_LIMIT_STORE=memory
GATEWAY_REPLICA_COUNT=1
# Horizontal scaling (requires the gateway to reach PostgreSQL):
# GATEWAY_RATE_LIMIT_STORE=postgres
# GATEWAY_REPLICA_COUNT=2
```

The shared store uses the `rate_limit_windows` table created by migration
`0004`. Startup validation refuses `GATEWAY_REPLICA_COUNT > 1` with the
in-process store, and the Postgres store requires `DATABASE_URL` (or the
complete `DB_*` set) with the same TLS rules as the services. A store failure
fails the request closed with a 5xx rather than silently allowing it.

The gateway returns JSON 404s for unknown API paths and propagates request IDs.
Keep service ports private.

## Web

```env
NEXT_PUBLIC_API_URL=https://api.example.org
```

`NEXT_PUBLIC_API_URL` is embedded at build time and validated again at server
startup for standalone images. A missing or non-HTTPS value outside loopback
fails startup. CSP is nonce-based per request; HSTS is emitted only when
`ENABLE_HSTS=true`.

## AI

```env
AI_MODEL=gpt-4o-mini
AI_DAILY_TOKEN_LIMIT=50000
AI_MAX_OUTPUT_TOKENS=1024
AI_REQUIRE_CONSENT=true
AI_GATEWAY_URL=https://...
AI_GATEWAY_API_KEY=...
AI_COUNSELOR_URL=https://...
```

AI must fail closed. Removing provider credentials disables generation while
keeping the crisis response path. Review the provider's data-retention terms for
minors before the pilot.

## Secrets management

- Store values in the platform secret manager, not in images, compose files or
  git.
- Inject at runtime; do not bake secrets into `NEXT_PUBLIC_*`.
- Rotate `JWT_SECRET` by deploying the new value to every verifier before
  removing the old one, then revoke sessions if compromise is suspected.
- Keep database, media signing, AI and backup encryption keys separate.
- `.env*` files are git-ignored. `.env.development.local` in a developer
  checkout may contain real provider keys; never commit or print it.

## Resource and network guidance

- Give PostgreSQL enough connections for 18 services plus migrations; monitor
  connection saturation.
- Set container CPU/memory limits and test at pilot concurrency.
- Allow egress only to the database, AI provider, email/SMS provider and
  monitoring endpoints.
- Terminate TLS with modern ciphers; redirect HTTP to HTTPS at the edge.
- Restrict media volume access to the content service and backup runner.

## Validation before traffic

1. Run `pnpm db:check` and apply migrations as a separate release step.
2. Start services; confirm every `/ready` is healthy.
3. Confirm the gateway `/health` and `/ready` and the web `/api/health`.
4. Inspect response headers for CSP nonce and HSTS.
5. Run `pnpm smoke:staging` (see `RELEASE-RUNBOOK.md`).
