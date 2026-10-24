import { describe, it, expect, vi } from 'vitest';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  parseCookies,
  readCookie,
  setAuthCookies,
} from './cookies';

describe('parseCookies', () => {
  it('parses, trims and decodes values', () => {
    expect(parseCookies('a=1; b=hello%20world; empty=')).toEqual({
      a: '1',
      b: 'hello world',
      empty: '',
    });
  });

  it('ignores malformed segments and missing headers', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('novalue; =x; ok=1')).toEqual({ ok: '1' });
  });
});

describe('readCookie', () => {
  it('reads the named cookie only', () => {
    const req = { headers: { cookie: `${ACCESS_COOKIE}=abc; ${REFRESH_COOKIE}=def` } };
    expect(readCookie(req as never, ACCESS_COOKIE)).toBe('abc');
    expect(readCookie(req as never, REFRESH_COOKIE)).toBe('def');
    expect(readCookie(req as never, 'missing')).toBeUndefined();
  });
});

describe('setAuthCookies', () => {
  it('sets httpOnly access and path-scoped refresh cookies', () => {
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };
    setAuthCookies(res as never, 'access-token', 'refresh-token');

    expect(res.cookie).toHaveBeenCalledWith(
      ACCESS_COOKIE,
      'access-token',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'refresh-token',
      expect.objectContaining({ httpOnly: true, path: '/api/auth' }),
    );
  });

  it('clears both cookies', () => {
    const res = { cookie: vi.fn(), clearCookie: vi.fn() };
    clearAuthCookies(res as never);
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
  });
});
