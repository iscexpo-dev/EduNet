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
});

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  service.start();
}

export const app = service.app;
export { service };
