import type { Request, Response } from 'express';
import { ACCESS_TOKEN_COOKIE } from '@edunet/rbac';

export const ACCESS_COOKIE = ACCESS_TOKEN_COOKIE;
export const REFRESH_COOKIE = 'edunet_refresh';

const ACCESS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
  };
}

/**
 * The access token is scoped to the whole API so any service can verify it.
 * The refresh token is scoped to the auth routes only, reducing the number of
 * requests that carry long-lived material.
 */
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookieOptions(),
    path: '/',
    maxAge: ACCESS_MAX_AGE_MS,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookieOptions(),
    path: '/api/auth',
    maxAge: REFRESH_MAX_AGE_MS,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookieOptions(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookieOptions(), path: '/api/auth' });
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value;
    }
  }
  return result;
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers?.cookie;
  if (typeof header !== 'string') return undefined;
  return parseCookies(header)[name];
}
