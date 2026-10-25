import { describe, expect, it } from 'vitest';
import { assertEnvironment, isPlaceholder, validateEnvironment } from './env';

const PRODUCTION_SERVICE = {
  NODE_ENV: 'production',
  JWT_SECRET: 'a'.repeat(48),
  DATABASE_URL: 'postgres://edunet:strong-password@db.internal.example:5432/edunet?sslmode=require',
  MEDIA_SIGNING_SECRET: 'm'.repeat(48),
  AI_REQUIRE_CONSENT: 'true',
};

describe('environment validation', () => {
  it('accepts a complete production service environment', () => {
    const result = validateEnvironment({ role: 'service', env: PRODUCTION_SERVICE });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects a short or placeholder JWT secret in production', () => {
    expect(
      validateEnvironment({
        role: 'service',
        env: { ...PRODUCTION_SERVICE, JWT_SECRET: 'replace-with-at-least-32-random-characters' },
      }).errors.map((issue) => issue.variable),
    ).toContain('JWT_SECRET');

    expect(
      validateEnvironment({
        role: 'service',
        env: { ...PRODUCTION_SERVICE, JWT_SECRET: 'short' },
      }).errors.map((issue) => issue.variable),
    ).toContain('JWT_SECRET');
  });

  it('rejects a loopback or non-TLS production database', () => {
    const loopback = validateEnvironment({
      role: 'service',
      env: { ...PRODUCTION_SERVICE, DATABASE_URL: 'postgres://u:p@localhost:5432/edunet' },
    });
    expect(loopback.errors.some((issue) => issue.variable === 'DATABASE_URL')).toBe(true);

    const plaintext = validateEnvironment({
      role: 'service',
      env: {
        ...PRODUCTION_SERVICE,
        DATABASE_URL: 'postgres://u:p@db.internal.example:5432/edunet',
      },
    });
    expect(plaintext.errors.some((issue) => issue.variable === 'DATABASE_URL')).toBe(true);
  });

  it('requires explicit https CORS origins for the gateway', () => {
    const result = validateEnvironment({
      role: 'gateway',
      env: {
        NODE_ENV: 'production',
        JWT_SECRET: 'g'.repeat(48),
        CORS_ORIGINS: 'http://app.example.org,*',
        ENABLE_HSTS: 'true',
        TRUST_PROXY: '1',
      },
    });
    expect(result.errors.filter((issue) => issue.variable === 'CORS_ORIGINS').length).toBeGreaterThan(0);
  });

  it('accepts a complete production gateway environment', () => {
    const result = validateEnvironment({
      role: 'gateway',
      env: {
        NODE_ENV: 'production',
        JWT_SECRET: 'g'.repeat(48),
        CORS_ORIGINS: 'https://app.example.org',
        ENABLE_HSTS: 'true',
        TRUST_PROXY: '1',
        GATEWAY_REPLICA_COUNT: '1',
      },
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((issue) => issue.variable)).not.toContain('GATEWAY_REPLICA_COUNT');
  });

  it('refuses a multi-replica gateway with the in-process limiter', () => {
    const result = validateEnvironment({
      role: 'gateway',
      env: {
        NODE_ENV: 'production',
        JWT_SECRET: 'g'.repeat(48),
        CORS_ORIGINS: 'https://app.example.org',
        ENABLE_HSTS: 'true',
        TRUST_PROXY: '1',
        GATEWAY_REPLICA_COUNT: '2',
        GATEWAY_RATE_LIMIT_STORE: 'memory',
      },
    });
    expect(result.errors.some((issue) => issue.variable === 'GATEWAY_REPLICA_COUNT')).toBe(true);
  });

  it('accepts the postgres rate-limit store only when a database is configured', () => {
    const base = {
      NODE_ENV: 'production',
      JWT_SECRET: 'g'.repeat(48),
      CORS_ORIGINS: 'https://app.example.org',
      ENABLE_HSTS: 'true',
      TRUST_PROXY: '1',
      GATEWAY_REPLICA_COUNT: '2',
      GATEWAY_RATE_LIMIT_STORE: 'postgres',
    };

    const missing = validateEnvironment({ role: 'gateway', env: base });
    expect(missing.errors.some((issue) => issue.variable === 'GATEWAY_RATE_LIMIT_STORE')).toBe(true);

    const configured = validateEnvironment({
      role: 'gateway',
      env: {
        ...base,
        DATABASE_URL: 'postgres://edunet:strong-password@db.internal.example:5432/edunet?sslmode=require',
      },
    });
    expect(configured.errors).toEqual([]);
  });

  it('rejects an unknown rate-limit store and an invalid replica count', () => {
    const result = validateEnvironment({
      role: 'gateway',
      env: {
        NODE_ENV: 'production',
        JWT_SECRET: 'g'.repeat(48),
        CORS_ORIGINS: 'https://app.example.org',
        GATEWAY_RATE_LIMIT_STORE: 'redis',
        GATEWAY_REPLICA_COUNT: '0',
      },
    });
    expect(result.errors.map((issue) => issue.variable)).toEqual(
      expect.arrayContaining(['GATEWAY_RATE_LIMIT_STORE', 'GATEWAY_REPLICA_COUNT']),
    );
  });

  it('warns when a production gateway does not declare its replica count', () => {
    const result = validateEnvironment({
      role: 'gateway',
      env: {
        NODE_ENV: 'production',
        JWT_SECRET: 'g'.repeat(48),
        CORS_ORIGINS: 'https://app.example.org',
        ENABLE_HSTS: 'true',
        TRUST_PROXY: '1',
      },
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((issue) => issue.variable)).toContain('GATEWAY_REPLICA_COUNT');
  });

  it('rejects AI without consent in production', () => {
    const result = validateEnvironment({
      role: 'service',
      env: { ...PRODUCTION_SERVICE, AI_REQUIRE_CONSENT: 'false' },
    });
    expect(result.errors.map((issue) => issue.variable)).toContain('AI_REQUIRE_CONSENT');
  });

  it('does not require production secrets in development', () => {
    const result = validateEnvironment({ role: 'service', env: { NODE_ENV: 'development' } });
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('requires an https API URL for production web builds', () => {
    const result = validateEnvironment({
      role: 'web',
      env: { NODE_ENV: 'production', NEXT_PUBLIC_API_URL: 'http://localhost:8080' },
    });
    expect(result.errors.map((issue) => issue.variable)).toContain('NEXT_PUBLIC_API_URL');
  });

  it('never echoes secret values in error messages', () => {
    const result = validateEnvironment({
      role: 'service',
      env: { ...PRODUCTION_SERVICE, JWT_SECRET: 'short' },
    });
    expect(JSON.stringify(result)).not.toContain('short');
  });

  it('throws an aggregated error for invalid production configuration', () => {
    expect(() =>
      assertEnvironment({
        role: 'service',
        env: { NODE_ENV: 'production', JWT_SECRET: 'x' },
      }),
    ).toThrow(/Invalid service environment/);
  });

  it('detects documented placeholder secrets', () => {
    expect(isPlaceholder('your_password_here')).toBe(true);
    expect(isPlaceholder('replace-with-at-least-32-random-characters')).toBe(true);
    expect(isPlaceholder('a-real-random-secret-value')).toBe(false);
  });
});
