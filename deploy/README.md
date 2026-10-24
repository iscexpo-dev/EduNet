# Deployment Assets

## Layout

- `compose/docker-compose.local.yml` — full local stack: PostgreSQL, migration
  job, 18 services, gateway and web.
- `compose/docker-compose.staging.yml` — production-like single-host stack with
  restart policies, resource limits and loopback-only published ports.
- `compose/.env.example` — required values; copy to `.env` and fill from a
  secret manager.
- `../Dockerfile` — API image (`base`, `deps`, `migrate`, `build`, `runtime`).
- `../apps/web/Dockerfile` — standalone Next.js web image.

## Local stack

```bash
cd deploy/compose
cp .env.example .env
# edit .env; use local-only passwords
docker compose -f docker-compose.local.yml --env-file .env up -d --build
docker compose -f docker-compose.local.yml ps
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/ready
```

The `migrate` service must exit `0` before API services become healthy. Logs:

```bash
docker compose -f docker-compose.local.yml logs -f migrate
docker compose -f docker-compose.local.yml logs -f gateway
```

## Staging stack

```bash
cd deploy/compose
cp .env.example .env
# fill real staging values; never commit .env
docker compose -f docker-compose.staging.yml --env-file .env up -d
```

Staging publishes only loopback ports; put a TLS proxy in front. Set
`ENABLE_HSTS=true` only after HTTPS is verified. Use immutable image digests
for a real release rather than local builds.

## Notes

- The gateway rate limiter is in-process; run one gateway replica until a shared
  store is added.
- Media uses a named volume. Back it up separately from PostgreSQL.
- Containers run as non-root UID/GID `10001`.
- Docker is not available in the readiness workspace, so these images have not
  been built locally. CI builds and scans them.
