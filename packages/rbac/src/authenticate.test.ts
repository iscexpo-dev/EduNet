import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { ACCESS_TOKEN_COOKIE, authenticate, resolveSecret } from './index';

const SECRET = 'test-secret-key';

function mockRes() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

const signAccess = (claims: Record<string, unknown> = {}, secret = SECRET) =>
  jwt.sign({ tokenKind: 'access', ...claims }, secret, { expiresIn: '1h' });

describe('resolveSecret', () => {
  it('throws when JWT_SECRET is unset', () => {
    delete process.env.JWT_SECRET;
    expect(() => resolveSecret()).toThrow('JWT_SECRET is not configured');
  });

  it('throws on the placeholder secret in production', () => {
    process.env.JWT_SECRET = 'your-secret-key-change-in-production';
    process.env.NODE_ENV = 'production';
    expect(() => resolveSecret()).toThrow(/placeholder/i);
  });

  it('allows the placeholder in development', () => {
    process.env.JWT_SECRET = 'your-secret-key-change-in-production';
    process.env.NODE_ENV = 'development';
    expect(() => resolveSecret()).not.toThrow();
  });
});

describe('authenticate', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, JWT_SECRET: SECRET, NODE_ENV: 'test' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('rejects a request with no authorization header', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a non-bearer scheme', () => {
    const req = { headers: { authorization: 'Basic abc123' } };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a malformed token', () => {
    const req = { headers: { authorization: 'Bearer not-a-jwt' } };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an expired token', () => {
    const token = jwt.sign({ tokenKind: 'access' }, SECRET, { expiresIn: '-1s' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token signed with a different secret', () => {
    const req = { headers: { authorization: `Bearer ${signAccess({}, 'other-secret')}` } };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a refresh token replayed as an access token', () => {
    const refresh = jwt.sign({ userId: 'u1', tokenKind: 'refresh' }, SECRET, { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${refresh}` } };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a legacy token with no tokenKind claim', () => {
    const legacy = jwt.sign({ userId: 'u1' }, SECRET, { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${legacy}` } };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not leak the reason for rejection', () => {
    const req = { headers: { authorization: 'Bearer garbage' } };
    const res = mockRes();

    authenticate(req, res, vi.fn());

    expect(res.body).toEqual({ error: 'Invalid token' });
  });

  it('accepts a valid access token from the httpOnly cookie', () => {
    const token = signAccess({ userId: 'u1', role: 'teacher', organizationId: 'org-a' });
    const req: { headers: Record<string, string>; user?: unknown } = {
      headers: { cookie: `theme=dark; ${ACCESS_TOKEN_COOKIE}=${token}` },
    };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ id: 'u1', role: 'teacher', organizationId: 'org-a' });
  });

  it('populates req.user and continues for a valid access token', () => {
    const token = signAccess({ userId: 'u1', role: 'teacher', organizationId: 'org-a' });
    const req: { headers: Record<string, string>; user?: unknown } = {
      headers: { authorization: `Bearer ${token}` },
    };
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ id: 'u1', role: 'teacher', organizationId: 'org-a' });
  });
});
