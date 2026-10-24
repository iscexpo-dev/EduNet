import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticate, authorize } from './middleware';
import { generateAccessToken } from './auth';
import { ACCESS_COOKIE } from './cookies';

describe('Auth Middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.JWT_SECRET = 'test-secret-key';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('authenticate', () => {
    it('should reject request with no auth header', () => {
      const req: any = { headers: {} };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(data: any) { this.body = data; return this; },
      };
      const next = vi.fn();

      authenticate(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('No token provided');
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid auth header format', () => {
      const req: any = { headers: { authorization: 'InvalidFormat token123' } };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(data: any) { this.body = data; return this; },
      };
      const next = vi.fn();

      authenticate(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('No token provided');
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token', () => {
      const req: any = { headers: { authorization: 'Bearer invalid-token' } };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(data: any) { this.body = data; return this; },
      };
      const next = vi.fn();

      authenticate(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Invalid token');
      expect(next).not.toHaveBeenCalled();
    });

    it('should accept request with valid token', () => {
      const token = generateAccessToken({ userId: '123', role: 'student', organizationId: 'o1' });
      const req: any = { headers: { authorization: `Bearer ${token}` } };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(data: any) { this.body = data; return this; },
      };
      const next = vi.fn();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe('123');
      expect(req.user.role).toBe('student');
    });

    it('should accept a valid token supplied in the httpOnly cookie', () => {
      const token = generateAccessToken({ userId: '123', role: 'student', organizationId: 'o1' });
      const req: any = { headers: { cookie: `theme=dark; ${ACCESS_COOKIE}=${token}` } };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(data: any) { this.body = data; return this; },
      };
      const next = vi.fn();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user.id).toBe('123');
    });

    it('should reject expired token', () => {
      const expiredToken = jwt.sign(
        { userId: '123', role: 'student', tokenKind: 'access' },
        'test-secret-key',
        { expiresIn: '-1s' }
      );
      const req: any = { headers: { authorization: `Bearer ${expiredToken}` } };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(data: any) { this.body = data; return this; },
      };
      const next = vi.fn();

      authenticate(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Invalid token');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('authorize', () => {
    it('should reject when user is not authenticated', () => {
      const req: any = { user: undefined };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(data: any) { this.body = data; return this; },
      };
      const next = vi.fn();

      const middleware = authorize('student');
      middleware(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Not authenticated');
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject when user role is not allowed', () => {
      const req: any = { user: { id: '123', role: 'student' } };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(data: any) { this.body = data; return this; },
      };
      const next = vi.fn();

      const middleware = authorize('teacher', 'admin');
      middleware(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('Insufficient permissions');
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow when user role is allowed', () => {
      const req: any = { user: { id: '123', role: 'teacher' } };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(data: any) { this.body = data; return this; },
      };
      const next = vi.fn();

      const middleware = authorize('teacher', 'admin');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow admin to access any role-restricted route', () => {
      const req: any = { user: { id: '123', role: 'admin' } };
      const res: any = {
        statusCode: 200,
        body: undefined,
        status(code: number) { this.statusCode = code; return this; },
        json(data: any) { this.body = data; return this; },
      };
      const next = vi.fn();

      const middleware = authorize('teacher');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
