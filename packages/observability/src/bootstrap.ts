import express from 'express';
import type { ReadyCheck } from './health';
import { createLogger } from './logger';
import { requestLogger, errorHandler } from './http';
import { mountHealthEndpoints } from './health';
import { createMetrics } from './metrics';

/**
 * Uniform service bootstrap for every EduNet backend service.
 *
 * Every express service differs only in its routes; this helper centralises
 * the cross-cutting concerns so no service can accidentally omit
 * observability: structured request logging, request-id propagation,
 * liveness/readiness endpoints, bounded metrics and a non-disclosing error
 * handler.
 */
export interface ServiceBootstrapOptions {
  /** Short service name, e.g. `identity`. Also stamped on every log line. */
  serviceName: string;
  /** Routes registrar — normally the service's `registerRoutes` export. */
  registerRoutes: (app: express.Express) => void;
  /** Port to listen on. Defaults to `PORT` env or 3000. */
  port?: number;
  /** Readiness probe definition; defaults to always-ready. */
  readyCheck?: ReadyCheck;
}

export interface ServiceBootstrapResult {
  app: express.Express;
  port: number;
  start: () => { stop: () => Promise<void> };
  getMetrics: () => string;
}

export function bootstrapService(options: ServiceBootstrapOptions): ServiceBootstrapResult {
  const { serviceName, registerRoutes } = options;
  process.env.SERVICE_NAME = serviceName;

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  const { observeHttpRequest, format } = createMetrics(serviceName);
  const log = createLogger();

  app.use(requestLogger(log));
  app.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      observeHttpRequest(
        req.method,
        // Route templates keep cardinality bounded; fall back to raw path.
        req.route?.path ?? req.baseUrl ?? req.path,
        res.statusCode,
        Number(process.hrtime.bigint() - started) / 1_000_000,
      );
    });
    next();
  });

  registerRoutes(app);
  mountHealthEndpoints(app, options.readyCheck);
  app.get('/metrics', (_req, res) => {
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(format());
  });
  app.use(errorHandler(log));

  const port = options.port ?? (Number(process.env.PORT) || 3000);

  function start() {
    const server = app.listen(port, () => {
      log.info(`${serviceName} listening`, { port });
    });
    return {
      stop: (): Promise<void> =>
        new Promise((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        }),
    };
  }

  return { app, port, start, getMetrics: format };
}
