import type { Express } from 'express';
import { createLogger } from '@edunet/observability';
import { createProxy } from './proxy';
import { createLimiter } from './ratelimit-factory';
import {
  limitForPrefix,
  rateLimit,
  rateLimitConfigFromEnv,
  rateLimitStoreFromEnv,
  replicaCountFromEnv,
} from './ratelimit';
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
  const store = rateLimitStoreFromEnv();
  const replicas = replicaCountFromEnv();
  const limiter = createLimiter(store);

  // Make the topology explicit at startup: operators must not assume that two
  // replicas share a counter when the in-process store is active.
  createLogger().info('rate_limit_store', {
    store,
    replicas,
    perProcess: store === 'memory',
  });

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
