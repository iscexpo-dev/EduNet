import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cors,
  parseAllowedOrigins,
  resolveCorsOrigin,
  securityHeaders,
  securityOptionsFromEnv,
} from './security';

let server: ReturnType<ReturnType<typeof express>['listen']>;
let baseUrl = '';

describe('gateway security middleware', () => {
  beforeAll(async () => {
    const app = express();
    app.use(securityHeaders({ allowedOrigins: ['https://learn.example'], hsts: true }));
    app.use(cors({ allowedOrigins: ['https://learn.example'] }));
    app.get('/api/ping', (_req, res) => res.json({ ok: true }));
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('normalises the allowlist', () => {
    expect(parseAllowedOrigins(' https://a.example/ , https://b.example ,, ')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(resolveCorsOrigin('https://a.example', ['https://a.example'])).toBe('https://a.example');
    expect(resolveCorsOrigin('https://evil.example', ['https://a.example'])).toBeUndefined();
    expect(resolveCorsOrigin(undefined, ['https://a.example'])).toBeUndefined();
  });

  it('answers an allowed preflight and advertises the allowlist', async () => {
    const response = await fetch(`${baseUrl}/api/ping`, {
      method: 'OPTIONS',
      headers: { origin: 'https://learn.example', 'access-control-request-method': 'POST' },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://learn.example');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    expect(response.headers.get('access-control-allow-headers')).toContain('Authorization');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(response.headers.get('vary')).toBe('Origin');
    expect(response.headers.get('strict-transport-security')).toContain('max-age=31536000');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  it('rejects a disallowed preflight', async () => {
    const response = await fetch(`${baseUrl}/api/ping`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not reflect an unknown origin on a normal request', async () => {
    const response = await fetch(`${baseUrl}/api/ping`, {
      headers: { origin: 'https://evil.example' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(await response.json()).toEqual({ ok: true });
  });

  it('parses security configuration from the environment', () => {
    expect(securityOptionsFromEnv({} as NodeJS.ProcessEnv)).toEqual({
      allowedOrigins: [],
      hsts: false,
    });
    expect(
      securityOptionsFromEnv({
        CORS_ORIGINS: 'https://a.example,https://b.example',
        ENABLE_HSTS: 'true',
      } as NodeJS.ProcessEnv),
    ).toEqual({ allowedOrigins: ['https://a.example', 'https://b.example'], hsts: true });
  });
});
