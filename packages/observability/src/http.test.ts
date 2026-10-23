import { describe, it, expect } from 'vitest';
import { getOrCreateRequestId, errorHandler } from './http';
import { mountHealthEndpoints, alwaysReady } from './health';

describe('request id handling', () => {
  it('reuses a valid upstream request id', () => {
    expect(getOrCreateRequestId({ headers: { 'x-request-id': 'abc-123.test_1' } })).toBe('abc-123.test_1');
  });

  it('rejects request ids with unsafe characters', () => {
    expect(getOrCreateRequestId({ headers: { 'x-request-id': '../etc/passwd\x00' } })).not.toBe('../etc/passwd\x00');
  });

  it('generates a UUID when absent', () => {
    const id = getOrCreateRequestId({ headers: {} });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('error handler', () => {
  it('normalises unknown errors to a generic 500 without leaking details', async () => {
    const writes: { status?: number; body?: unknown }[] = [];
    const fakeRes = {
      headersSent: false,
      status(code: number) {
        writes.push({ status: code });
        return fakeRes;
      },
      json(body: unknown) {
        writes.push({ body });
        return fakeRes;
      },
    };
    const fakeReq = { path: '/x', requestId: 'r1' };
    const next = () => undefined;
    const handler = errorHandler() as unknown as (e: unknown, req: unknown, res: unknown, next: unknown) => void;
    handler(new Error('DB connection string postgres://user:secret@host failed'), fakeReq, fakeRes, next);
    expect(writes.find((w) => w.status)?.status).toBe(500);
    expect(JSON.stringify(writes.find((w) => w.body)?.body)).toBe('{"error":"Internal server error"}');
  });
});

describe('health endpoints', () => {
  it('mounts /health and /ready and reports ready state', async () => {
    const routes: Record<string, (req: never, res: never) => unknown> = {};
    const app = {
      get(path: string, handler: (req: never, res: never) => unknown) {
        routes[path] = handler;
      },
    };
    mountHealthEndpoints(app, async () => ({ ready: true, dependencies: [{ name: 'db', healthy: true }] }));

    const write = (body: unknown) => body;
    const resOk = () => {
      let status = 0;
      let body: unknown;
      return {
        statusCode() {
          return status;
        },
        get body() {
          return body;
        },
        status(code: number) {
          status = code;
          return { json: write };
        },
        json(data: unknown) {
          body = data;
          return undefined;
        },
      };
    };
    const r1 = resOk() as never;
    (routes['/health'] as (req: never, res: never) => void)({} as never, r1);
    expect(r1.statusCode()).toBe(200);

    const r2 = resOk() as never;
    const ready = async () => {
      (routes['/ready'] as unknown as (req: never, res: never) => Promise<void>)({} as never, r2);
      await undefined;
    };
    await ready();
    expect(r2.statusCode()).toBe(200);
  });

  it('alwaysReady has no dependencies', async () => {
    expect(await alwaysReady()).toEqual({ ready: true, dependencies: [] });
  });
});
