import type { Request, Response, NextFunction } from 'express';

const ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const ALLOWED_HEADERS = 'Content-Type,Authorization,X-Request-Id';
const PREFLIGHT_MAX_AGE = '600';

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0);
}

/**
 * CORS is an explicit allowlist. An empty list means "same origin only" — the
 * gateway never reflects an arbitrary Origin header.
 */
export function resolveCorsOrigin(
  requestOrigin: string | undefined,
  allowedOrigins: readonly string[],
): string | undefined {
  if (!requestOrigin) return undefined;
  const normalized = requestOrigin.replace(/\/+$/, '');
  return allowedOrigins.includes(normalized) ? normalized : undefined;
}

export interface SecurityOptions {
  allowedOrigins?: readonly string[];
  hsts?: boolean;
}

/** Baseline response headers. CSP is intentionally not set here: the Next.js
 * app uses framework-generated inline scripts and needs a nonce strategy. */
export function securityHeaders(options: SecurityOptions = {}) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (options.hsts) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}

export function cors(options: SecurityOptions = {}) {
  const allowedOrigins = options.allowedOrigins ?? [];
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = resolveCorsOrigin(req.headers.origin, allowedOrigins);
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.setHeader('Access-Control-Max-Age', PREFLIGHT_MAX_AGE);
    }

    if (req.method === 'OPTIONS') {
      // Reject a disallowed preflight rather than letting it fall through to a
      // service that may not implement CORS consistently.
      res.status(origin ? 204 : 403).end();
      return;
    }

    next();
  };
}

export function securityOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): SecurityOptions {
  return {
    allowedOrigins: parseAllowedOrigins(env.CORS_ORIGINS),
    hsts: env.ENABLE_HSTS === 'true',
  };
}
