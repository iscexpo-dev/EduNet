import type { Express } from 'express';
import { createProxy } from './proxy';
import { FixedWindowLimiter, limitForPrefix, rateLimit, rateLimitConfigFromEnv } from './ratelimit';
import { cors, securityHeaders, securityOptionsFromEnv } from './security';
import { ROUTE_TO_SERVICE, resolveUpstream, type RoutePrefix } from './upstreams';

/**
 * Mounts one streaming proxy per service prefix.
 *
 * The gateway deliberately does not parse or authorise requests; each service
 * remains the authority for authentication, tenancy and business rules. This
 * keeps a compromised gateway from becoming an authorization bypass.
 */
export function registerRoutes(app: Express): void {
  const security = securityOptionsFromEnv();
  const limits = rateLimitConfigFromEnv();
  const limiter = new FixedWindowLimiter();
  app.use(securityHeaders(security));
  app.use(cors(security));

  for (const prefix of Object.keys(ROUTE_TO_SERVICE) as RoutePrefix[]) {
    const upstream = resolveUpstream(prefix);
    if (!upstream) {
      throw new Error(`gateway route has no upstream: ${prefix}`);
    }
    app.use(
      prefix,
      rateLimit({ limiter, limit: limitForPrefix(prefix, limits), scope: prefix }),
      createProxy(upstream.baseUrl),
    );
  }
}
