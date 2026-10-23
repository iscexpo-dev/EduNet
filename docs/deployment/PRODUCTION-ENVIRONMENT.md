# Production Environment

Use a managed HTTPS reverse proxy in front of the gateway and web app. Set `NODE_ENV=production`, a unique 32+ character `JWT_SECRET`, `DATABASE_URL` (TLS enabled), `TRUST_PROXY` to the exact proxy hop count, and explicit `CORS_ORIGINS`. Store secrets in the platform secret manager; never commit `.env` files or expose server-only values through `NEXT_PUBLIC_*`.

Required operational values include service upstream URLs, database credentials, media storage configuration, and monitoring destinations. Disable development defaults, use least-privilege database credentials, and verify cookie/token settings in the deployment platform.

Deployment must apply migrations as a separately reviewed release step, then start the gateway and web processes. `/health` is a liveness check; `/ready` is the traffic readiness check. HTTPS, DNS, backups, alerting, and access review are external prerequisites and are not asserted by repository tests.
