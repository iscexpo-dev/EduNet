import type { Request, Response } from 'express';

/**
 * Liveness and readiness probes shared by every EduNet service.
 *
 * - `/health` is process-local liveness: always cheap, no dependency checks.
 *   If this fails, the process should be restarted, not shed traffic.
 * - `/ready` reports whether the service can serve traffic. Dependency health
 *   (database reachability) is delegated to a caller-supplied check so each
 *   service defines what "ready" means for itself.
 */

export interface ReadyCheckResult {
  ready: boolean;
  dependencies: { name: string; healthy: boolean }[];
}

export type ReadyCheck = () => Promise<ReadyCheckResult>;

export const alwaysReady: ReadyCheck = async () => ({
  ready: true,
  dependencies: [],
});

export function healthEndpoint(req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    service: process.env.SERVICE_NAME || 'edunet',
    timestamp: new Date().toISOString(),
  });
}

export function readinessEndpoint(readyCheck: ReadyCheck): (req: Request, res: Response) => void {
  return async (_req: Request, res: Response): Promise<void> => {
    const started = Date.now();
    try {
      const result = await readyCheck();
      res.status(result.ready ? 200 : 503).json({
        status: result.ready ? 'ready' : 'not_ready',
        dependencies: result.dependencies,
        latencyMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({
        status: 'not_ready',
        dependencies: [],
        timestamp: new Date().toISOString(),
      });
    }
  };
}

export interface HealthMount {
  register(app: {
    get: (path: string, handler: (req: Request, res: Response) => void) => unknown;
  }): void;
}

export function mountHealthEndpoints(
  app: Parameters<HealthMount['register']>[0],
  readyCheck: ReadyCheck = alwaysReady,
): void {
  app.get('/health', healthEndpoint);
  app.get('/ready', readinessEndpoint(readyCheck));
}
