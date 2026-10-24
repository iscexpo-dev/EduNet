import express from 'express';
import type { Server } from 'node:http';
import { assertEnvironment, type RuntimeRole } from '@edunet/config';
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
  /** Runtime role controls which environment requirements apply. */
  role?: RuntimeRole;
  /** Maximum time to wait for in-flight requests during shutdown. */
  shutdownTimeoutMs?: number;
}

export interface ServiceBootstrapResult {
  app: express.Express;
  port: number;
  start: () => { stop: () => Promise<void> };
  getMetrics: () => string;
}

const BIND_RETRY_DELAY_MS = 500;
const BIND_MAX_ATTEMPTS = 40;

export function bootstrapService(options: ServiceBootstrapOptions): ServiceBootstrapResult {
  const { serviceName, registerRoutes } = options;
  const log = createLogger();
  const validation = assertEnvironment({ role: options.role ?? 'service' });
  for (const warning of validation.warnings) {
    log.warn('environment_warning', { variable: warning.variable, detail: warning.message });
  }
  process.env.SERVICE_NAME = serviceName;

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  const { observeHttpRequest, format } = createMetrics(serviceName);

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
    let server: Server | undefined;
    let stopping = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 10_000;

    const tryListen = (attempt: number): void => {
      if (stopping) return;
      const current = app.listen(port, () => {
        log.info(`${serviceName} listening`, { port });
      });
      server = current;
      current.on('error', (err: NodeJS.ErrnoException) => {
        if (stopping || server !== current) return;
        if (err.code === 'EADDRINUSE') {
          if (attempt < BIND_MAX_ATTEMPTS) {
            log.warn('port_in_use_retrying', { port, attempt: attempt + 1 });
            retryTimer = setTimeout(() => tryListen(attempt + 1), BIND_RETRY_DELAY_MS);
          } else {
            log.error('port_bind_failed', { port, code: err.code });
            process.exit(1);
          }
          return;
        }
        log.error('server_error', { code: err.code, message: err.message });
        throw err;
      });
    };

    tryListen(0);

    const stop = (): Promise<void> => {
      if (stopping) return Promise.resolve();
      stopping = true;
      if (retryTimer) clearTimeout(retryTimer);
      return new Promise((resolve, reject) => {
        if (!server) {
          resolve();
          return;
        }
        server.close((err?: Error) => {
          const code = (err as NodeJS.ErrnoException | undefined)?.code;
          if (!err || code === 'ERR_SERVER_NOT_RUNNING') {
            resolve();
          } else {
            reject(err);
          }
        });
      });
    };
    const handleSignal = (signal: string) => {
      log.info('shutdown_requested', { signal, timeoutMs: shutdownTimeoutMs });
      const timer = setTimeout(() => {
        log.error('shutdown_timeout', { timeoutMs: shutdownTimeoutMs });
        process.exit(1);
      }, shutdownTimeoutMs);
      timer.unref();
      void stop()
        .then(() => {
          clearTimeout(timer);
          log.info('shutdown_complete');
          process.exit(0);
        })
        .catch((error) => {
          clearTimeout(timer);
          log.error('shutdown_failed', {
            message: error instanceof Error ? error.message : String(error),
          });
          process.exit(1);
        });
    };
    process.once('SIGTERM', () => handleSignal('SIGTERM'));
    process.once('SIGINT', () => handleSignal('SIGINT'));
    return { stop };
  }

  return { app, port, start, getMetrics: format };
}
