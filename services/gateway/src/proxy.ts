import http from 'node:http';
import https from 'node:https';
import type { Request, Response, NextFunction } from 'express';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Minimal streaming reverse proxy.
 *
 * The observability bootstrap parses JSON before routes run, so a parsed body
 * is re-serialised with a corrected `content-length`. Multipart and other
 * bodies are streamed untouched. Response bytes are streamed, so large media
 * downloads do not buffer in the gateway.
 */
export function createProxy(baseUrl: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return (req: Request, res: Response, next: NextFunction): void => {
    let target: URL;
    try {
      target = new URL(baseUrl);
    } catch {
      next(new Error(`invalid upstream URL`));
      return;
    }

    const client = target.protocol === 'https:' ? https : http;
    const hasJsonBody = req.body !== undefined && req.body !== null && !Buffer.isBuffer(req.body);
    const body = hasJsonBody ? Buffer.from(JSON.stringify(req.body)) : undefined;

    const headers: http.OutgoingHttpHeaders = { ...req.headers };
    for (const header of HOP_BY_HOP) delete headers[header];
    headers.host = target.host;
    if (body) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(body.length);
    } else if (req.body === undefined) {
      delete headers['content-length'];
    }

    const path = `${target.pathname.replace(/\/$/, '')}${req.originalUrl}`;
    const proxyReq = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        method: req.method,
        path,
        headers,
      },
      (proxyRes) => {
        res.statusCode = proxyRes.statusCode ?? 502;
        for (const [name, value] of Object.entries(proxyRes.headers)) {
          if (value === undefined) continue;
          if (HOP_BY_HOP.has(name.toLowerCase())) continue;
          res.setHeader(name, value);
        }
        proxyRes.pipe(res);
        proxyRes.on('error', () => res.destroy());
      },
    );

    proxyReq.setTimeout(timeoutMs, () => {
      proxyReq.destroy(new Error('upstream timeout'));
    });

    proxyReq.on('error', (error) => {
      const log = (req as Request & { log?: { error: (message: string, meta?: unknown) => void } }).log;
      log?.error('gateway upstream error', { target: target.origin, message: error.message });
      if (!res.headersSent) {
        res.status(502).json({ error: 'Upstream service unavailable' });
      } else {
        res.destroy();
      }
    });

    req.on('aborted', () => proxyReq.destroy());

    if (body) {
      proxyReq.end(body);
    } else {
      req.pipe(proxyReq);
    }
  };
}
