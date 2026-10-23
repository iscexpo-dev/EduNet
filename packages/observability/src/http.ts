import { randomUUID, createHmac } from 'crypto';
import type { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';
import type { Logger, LogFields } from './logger';
import { createLogger } from './logger';

/**
 * HTTP observability middleware for EduNet services.
 *
 * Responsibilities:
 * - Assign a request id (honours an upstream `x-request-id` so cross-service
 *   traces join up) and stamp it on the response.
 * - Emit one structured access log per request with latency, never logging
 *   request bodies (they can contain student work or credentials).
 * - Normalise uncaught errors into `500 { error: 'Internal server error' }`
 *   while logging the real cause server-side (information-disclosure guard).
 */

export const REQUEST_ID_HEADER = 'x-request-id';

export function getOrCreateRequestId(req: Pick<Request, 'headers'>): string {
  const incoming = req.headers?.[REQUEST_ID_HEADER];
  if (typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128) {
    // Static value is a plain header string; validate charset defensively.
    if (/^[A-Za-z0-9\-._]{1,128}$/.test(incoming)) return incoming;
  }
  return randomUUID();
}

export function requestLogger(logger?: Logger): RequestHandler {
  const log = logger ?? createLogger();
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = getOrCreateRequestId(req);
    const scoped = log.child({ requestId, method: req.method, path: req.path });
    (req as Request & { log?: Logger; requestId?: string }).log = scoped;
    (req as Request & { requestId?: string }).requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      scoped.info('request', {
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    });

    next();
  };
}

export function errorHandler(logger?: Logger): ErrorRequestHandler {
  const log = logger ?? createLogger();
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    log.child({ requestId, path: req?.path }).error(
      'unhandled_error',
      err instanceof Error
        ? { errorMessage: err.message }
        : { errorMessage: String(err) },
    );
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  };
}

/**
 * Stable deterministic service identifier for tracing across services without
 * storing anything user-derived.
 */
export function traceIdForService(serviceName: string, requestId: string): string {
  return createHmac('sha256', `trace:${serviceName}`).update(requestId).digest('hex').slice(0, 24);
}
