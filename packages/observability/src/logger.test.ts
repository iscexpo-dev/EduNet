import { describe, it, expect, beforeEach } from 'vitest';
import { createLogger } from './logger';
import { MetricsRegistry, createMetrics } from './metrics';

describe('logger redaction', () => {
  let captured: string[] = [];
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;

  beforeEach(() => {
    captured = [];
    process.env.LOG_SILENT = 'true';
  });

  it('redacts sensitive keys at any nesting depth', () => {
    const event = JSON.parse(
      firstEmittedLine(() => {
        const log = createLogger();
        log.info('login', { password: 'hunter2', nested: { refresh_token: 'abc' } });
      }),
    );
    expect(event.password).toBe('[REDACTED]');
    expect(event.nested.refresh_token).toBe('[REDACTED]');
    expect(JSON.stringify(event)).not.toContain('hunter2');
    expect(JSON.stringify(event)).not.toContain('abc');
  });

  it('pseudonymises emails and phone numbers', () => {
    const event = JSON.parse(
      firstEmittedLine(() => {
        createLogger().info('x', { email: 'student.name@school.edu', phone_number: '+8801712345678' });
      }),
    );
    expect(event.email).toBe('st***');
    expect(event.phone_number).not.toBe('+8801712345678');
  });  it('strips bearer tokens from labelled free-text fields', () => {
    const event = JSON.parse(
      firstEmittedLine(() => {
        createLogger().warn('leak-test', { detail: 'Authorization: Bearer eyjhhhb.sequence.aaa' });
      }),
    );
    expect(JSON.stringify(event)).not.toContain('eyjhhhb');
    expect(event.detail).toContain('Bearer [REDACTED]');
  });

  it('respects minimum log level', () => {
    process.env.LOG_LEVEL = 'warn';
    captured = [];
    firstEmittedLine(() => createLogger().debug('invisible'));
    firstEmittedLine(() => createLogger().warn('visible'));
    expect(captured.some((line) => line.includes('visible'))).toBe(true);
    expect(captured.some((line) => line.includes('invisible'))).toBe(false);
    delete process.env.LOG_LEVEL;
  });

  it('writes error level events to stderr', () => {
    captured = [];
    const originalErr = process.stderr.write;
    process.env.LOG_SILENT = 'false';
    process.stderr.write = ((chunk: unknown) => {
      captured.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    try {
      createLogger().error('boom', { code: 'X' });
    } finally {
      process.stderr.write = originalErr;
    }
    expect(captured[0]).toContain('"level":"error"');
    expect(captured[0]).toContain('boom');
    expect(captured[0]).toContain('"code":"X"');
  });

  function firstEmittedLine(fn: () => void): string {
    process.env.LOG_SILENT = 'false';
    process.stdout.write = ((chunk: unknown) => {
      captured.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = originalStderr;
    try {
      fn();
    } finally {
      process.stdout.write = originalStdout;
      process.env.LOG_SILENT = 'true';
    }
    return captured[0] ?? '';
  }
});

describe('metrics registry', () => {
  beforeEach(() => {
    // isolated registry per test case
  });

  it('renders counters with sorted labels in Prometheus text format', () => {
    const registry = new MetricsRegistry();
    registry.counter('edunet_logins_total', 'Logins', { method: 'password' });
    registry.counter('edunet_logins_total', 'Logins', { method: 'password' });
    registry.counter('edunet_logins_total', 'Logins', { method: 'otp' }, 3);
    const out = registry.format();
    expect(out).toContain('# TYPE edunet_logins_total counter');
    expect(out).toMatch(/edunet_logins_total\{method="otp"\} 3/);
    expect(out).toMatch(/edunet_logins_total\{method="password"\} 2/);
  });

  it('renders histogram buckets, sum and count', () => {
    const registry = new MetricsRegistry();
    registry.histogram('latency_ms', 'Latency', {}, 40, [10, 50, 100]);
    registry.histogram('latency_ms', 'Latency', {}, 70, [10, 50, 100]);
    const out = registry.format();
    expect(out).toContain('latency_ms_bucket{le="10"} 0');
    expect(out).toContain('latency_ms_bucket{le="50"} 1');
    expect(out).toContain('latency_ms_bucket{le="100"} 2');
    expect(out).toContain('latency_ms_sum 110');
    expect(out).toContain('latency_ms_count 2');
  });

  it('escapes quotes and backslashes in label values', () => {
    const registry = new MetricsRegistry();
    registry.gauge('route_weird', '', { route: '/api/v1"\\x' }, 5);
    expect(registry.format()).toContain('/api/v1\\"\\\\x');
  });

  it('rejects unsafe label names', () => {
    const registry = new MetricsRegistry();
    expect(() => registry.gauge('bad', '', { 'user-id': '1' }, 0)).toThrow('Invalid label names');
  });

  it('supports service-level wrapper observing requests', () => {
    const { observeHttpRequest, format } = createMetrics('test-service');
    observeHttpRequest('GET', '/api/courses', 200, 12.5);
    const out = format();
    expect(out).toContain('service="test-service"');
    expect(out).toContain('edunet_http_request_duration_ms_bucket{service="test-service",method="GET",route="/api/courses",le="25"} 1');
  });
});
