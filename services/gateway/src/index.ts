import { bootstrapService } from '@edunet/observability';
import { registerRoutes } from './routes';

/**
 * Single-origin gateway for the web client.
 *
 * Port 8080 by default so it does not collide with identity (3001) or the web
 * app (3000). In production, terminate TLS in front of this process and point
 * `NEXT_PUBLIC_API_URL` at it.
 */
const port = Number(process.env.GATEWAY_PORT) || Number(process.env.PORT) || 8080;

const service = bootstrapService({
  serviceName: 'gateway',
  registerRoutes,
  port,
  role: 'gateway',
});

// Trust exactly the configured number of proxy hops so rate limiting sees the
// client address. Default 0: an exposed gateway must not trust client-supplied
// X-Forwarded-For values.
const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
service.app.set('trust proxy', Number.isFinite(trustProxy) ? trustProxy : 0);

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  service.start();
}

// Unknown API paths must fail as JSON, never with an Express HTML page.
service.app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export const app = service.app;
export { service };
