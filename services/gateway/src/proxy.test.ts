import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProxy } from './proxy';

let upstream: ReturnType<ReturnType<typeof express>['listen']>;
let gateway: ReturnType<ReturnType<typeof express>['listen']>;
let upstreamUrl = '';
let gatewayUrl = '';

function listen(app: express.Express): Promise<ReturnType<ReturnType<typeof express>['listen']>> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

describe('streaming gateway proxy', () => {
  beforeAll(async () => {
    const upstreamApp = express();
    upstreamApp.use(express.json());
    upstreamApp.all('/api/echo/*', (req, res) => {
      res.json({
        method: req.method,
        url: req.originalUrl,
        body: req.body,
        authorization: req.headers.authorization ?? null,
      });
    });
    upstream = await listen(upstreamApp);
    upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

    const gatewayApp = express();
    gatewayApp.use(express.json());
    gatewayApp.use('/api', createProxy(upstreamUrl));
    gateway = await listen(gatewayApp);
    gatewayUrl = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => gateway.close(() => resolve()));
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  it('forwards method, path, query, auth header and JSON body', async () => {
    const response = await fetch(`${gatewayUrl}/api/echo/courses/42?limit=5`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
      body: JSON.stringify({ title: 'Algebra', nested: { ok: true } }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      method: 'POST',
      url: '/api/echo/courses/42?limit=5',
      body: { title: 'Algebra', nested: { ok: true } },
      authorization: 'Bearer test-token',
    });
  });

  it('propagates upstream status codes', async () => {
    const upstreamApp = express();
    upstreamApp.get('/api/down', (_req, res) => res.status(503).json({ error: 'maintenance' }));
    const server = await listen(upstreamApp);
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const gatewayApp = express();
    gatewayApp.use('/api', createProxy(url));
    const edge = await listen(gatewayApp);
    const edgeUrl = `http://127.0.0.1:${(edge.address() as AddressInfo).port}`;

    try {
      const response = await fetch(`${edgeUrl}/api/down`);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: 'maintenance' });
    } finally {
      await new Promise<void>((resolve) => edge.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('answers 502 when the upstream is unreachable', async () => {
    const closedApp = express();
    closedApp.use('/api', createProxy('http://127.0.0.1:1'));
    const edge = await listen(closedApp);
    const edgeUrl = `http://127.0.0.1:${(edge.address() as AddressInfo).port}`;

    try {
      const response = await fetch(`${edgeUrl}/api/users`);
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ error: 'Upstream service unavailable' });
    } finally {
      await new Promise<void>((resolve) => edge.close(() => resolve()));
    }
  });
});
