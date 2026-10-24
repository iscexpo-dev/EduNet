#!/usr/bin/env node
/**
 * Local-only gateway baseline. No database, no external services.
 *
 * Measures process startup and HTTP latency for the liveness endpoint under
 * concurrency. It is a smoke-level baseline, not a substitute for staging load
 * tests against database-backed endpoints.
 */
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const PORT = Number(process.env.PERF_PORT || 18080);
const DURATION_MS = Number(process.env.PERF_DURATION_MS || 5000);
const CONCURRENCY = Number(process.env.PERF_CONCURRENCY || 20);
const BASE = `http://127.0.0.1:${PORT}`;

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function waitForHealth(timeoutMs = 15000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/health`);
      if (response.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('gateway did not become healthy');
}

const child = spawn(process.execPath, ['services/gateway/dist/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(PORT),
    GATEWAY_PORT: String(PORT),
    LOG_SILENT: 'true',
    CORS_ORIGINS: 'http://localhost:3000',
    TRUST_PROXY: '0',
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += String(chunk);
});

try {
  const startupStarted = performance.now();
  await waitForHealth();
  const startupMs = performance.now() - startupStarted;

  for (let i = 0; i < 20; i += 1) {
    await fetch(`${BASE}/health`);
  }

  const latencies = [];
  let errors = 0;
  const deadline = performance.now() + DURATION_MS;

  async function worker() {
    while (performance.now() < deadline) {
      const started = performance.now();
      try {
        const response = await fetch(`${BASE}/health`);
        await response.arrayBuffer();
        if (!response.ok) errors += 1;
      } catch {
        errors += 1;
      }
      latencies.push(performance.now() - started);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  latencies.sort((a, b) => a - b);

  const result = {
    generatedAt: new Date().toISOString(),
    target: 'gateway /health (no database)',
    node: process.version,
    concurrency: CONCURRENCY,
    durationMs: DURATION_MS,
    requests: latencies.length,
    errors,
    errorRate: latencies.length === 0 ? 1 : errors / latencies.length,
    requestsPerSecond: Number((latencies.length / (DURATION_MS / 1000)).toFixed(2)),
    startupMs: Number(startupMs.toFixed(2)),
    latencyMs: {
      p50: Number(percentile(latencies, 50).toFixed(2)),
      p95: Number(percentile(latencies, 95).toFixed(2)),
      p99: Number(percentile(latencies, 99).toFixed(2)),
      max: Number((latencies[latencies.length - 1] ?? 0).toFixed(2)),
    },
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
}
