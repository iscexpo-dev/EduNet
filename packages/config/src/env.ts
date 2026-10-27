/**
 * Environment validation for EduNet runtime processes.
 *
 * Production deployments must fail closed: a missing secret, a development
 * default or an insecure transport setting is a startup error, not a warning
 * that silently weakens security. Messages name the offending variable but
 * never include its value, so a crash log cannot leak a secret.
 */

export type RuntimeRole = 'service' | 'gateway' | 'web';

export type Environment = Record<string, string | undefined>;

export interface ValidationIssue {
  variable: string;
  message: string;
}

export interface EnvironmentValidation {
  ok: boolean;
  role: RuntimeRole;
  production: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidateOptions {
  env?: Environment;
  role?: RuntimeRole;
}

const VALID_NODE_ENVS = new Set(['development', 'test', 'production']);
const VALID_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const VALID_RATE_LIMIT_STORES = new Set(['memory', 'postgres']);

const PLACEHOLDER_PATTERNS = [
  /^replace-with-/i,
  /^change-?me/i,
  /^your[-_]/i,
  /^example[-_]/i,
  /^postgres$/i,
  /^password$/i,
  /^secret$/i,
  /^your_password_here$/i,
];

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  return trimmed.length === 0 || PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function booleanFlag(
  env: Environment,
  variable: string,
  issue: (variable: string, message: string) => void,
): boolean | undefined {
  const raw = env[variable]?.trim();
  if (raw === undefined || raw === '') return undefined;
  const lower = raw.toLowerCase();
  if (
    lower === '1' ||
    lower === 'true' ||
    lower === 'yes' ||
    lower === 'on'
  ) {
    return true;
  }
  if (lower === '0' || lower === 'false' || lower === 'no' || lower === 'off') {
    return false;
  }
  issue(variable, 'must be a boolean (true/false/yes/no/on/off/1/0)');
  return undefined;
}

function integerInRange(
  env: Environment,
  variable: string,
  min: number,
  max: number,
  issue: (variable: string, message: string) => void,
): number | undefined {
  const raw = env[variable];
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    issue(variable, `must be an integer between ${min} and ${max}`);
    return undefined;
  }
  return value;
}

interface DatabaseTarget {
  host: string;
  tls: boolean;
  local: boolean;
}

function parseDatabaseTarget(env: Environment): DatabaseTarget | undefined {
  const url = env.DATABASE_URL?.trim();
  if (url) {
    try {
      const parsed = new URL(url);
      if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return undefined;
      const host = parsed.hostname;
      const sslmode = parsed.searchParams.get('sslmode');
      return {
        host,
        tls: Boolean(sslmode && !['disable', 'allow', 'prefer'].includes(sslmode)),
        local: LOOPBACK_HOSTS.has(host),
      };
    } catch {
      return undefined;
    }
  }

  const host = env.DB_HOST?.trim();
  if (!host) return undefined;
  return {
    host,
    tls: env.DATABASE_SSL === 'true',
    local: LOOPBACK_HOSTS.has(host),
  };
}

function hasDatabaseConfig(env: Environment): boolean {
  if (env.DATABASE_URL?.trim()) return true;
  return ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER'].every(
    (key) => env[key] !== undefined && env[key]!.trim() !== '',
  );
}

function validateOriginList(
  raw: string | undefined,
  variable: string,
  production: boolean,
  issue: (variable: string, message: string) => void,
): void {
  if (!raw || raw.trim() === '') return;
  const origins = raw.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) {
    issue(variable, 'must contain at least one origin when set');
    return;
  }
  for (const origin of origins) {
    if (origin === '*') {
      issue(variable, 'must not contain a wildcard origin');
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      issue(variable, 'contains an invalid origin URL');
      continue;
    }
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
      issue(variable, 'entries must be origins without paths, queries or fragments');
    }
    if (production && parsed.protocol !== 'https:') {
      issue(variable, 'must use https in production');
    }
  }
}

/**
 * Validates the process environment. Pure: it never reads `process.env`
 * unless no `env` is supplied and never mutates it.
 */
export function validateEnvironment(options: ValidateOptions = {}): EnvironmentValidation {
  const env = options.env ?? process.env;
  const role = options.role ?? 'service';
  const nodeEnv = env.NODE_ENV?.trim();
  const production = nodeEnv === 'production';
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const error = (variable: string, message: string) => errors.push({ variable, message });
  const warn = (variable: string, message: string) => warnings.push({ variable, message });

  if (nodeEnv && !VALID_NODE_ENVS.has(nodeEnv)) {
    error('NODE_ENV', 'must be one of development, test or production');
  }
  if (!nodeEnv) {
    warn('NODE_ENV', 'is not set; assuming development. Production must set NODE_ENV=production');
  }

  if (env.LOG_LEVEL && !VALID_LOG_LEVELS.has(env.LOG_LEVEL.toLowerCase())) {
    error('LOG_LEVEL', 'must be one of debug, info, warn or error');
  }

  booleanFlag(env, 'SEARCH_USE_TRIGRAM', error);

  integerInRange(env, 'TRUST_PROXY', 0, 16, error);
  integerInRange(env, 'BCRYPT_COST', 4, 15, error);
  integerInRange(env, 'GATEWAY_RATE_LIMIT_PER_MINUTE', 0, 1_000_000, error);
  integerInRange(env, 'GATEWAY_AUTH_RATE_LIMIT_PER_MINUTE', 0, 1_000_000, error);
  integerInRange(env, 'GATEWAY_AI_RATE_LIMIT_PER_MINUTE', 0, 1_000_000, error);
  integerInRange(env, 'GATEWAY_REPLICA_COUNT', 1, 1000, error);

  const rateLimitStore = env.GATEWAY_RATE_LIMIT_STORE?.trim().toLowerCase();
  if (rateLimitStore && !VALID_RATE_LIMIT_STORES.has(rateLimitStore)) {
    error('GATEWAY_RATE_LIMIT_STORE', 'must be one of memory or postgres');
  }

  validateOriginList(env.CORS_ORIGINS, 'CORS_ORIGINS', production, error);

  const bcryptCost = Number(env.BCRYPT_COST);
  if (production && Number.isInteger(bcryptCost) && bcryptCost < 12) {
    warn('BCRYPT_COST', 'is below the 12-round production target');
  }

  if (role === 'web') {
    const apiUrl = env.NEXT_PUBLIC_API_URL?.trim();
    if (production && !apiUrl) {
      error('NEXT_PUBLIC_API_URL', 'is required for a production web build');
    } else if (apiUrl) {
      try {
        const parsed = new URL(apiUrl);
        if (production && parsed.protocol !== 'https:') {
          error('NEXT_PUBLIC_API_URL', 'must use https in production');
        }
        if (production && LOOPBACK_HOSTS.has(parsed.hostname)) {
          error('NEXT_PUBLIC_API_URL', 'must not point at a loopback host in production');
        }
      } catch {
        error('NEXT_PUBLIC_API_URL', 'must be a valid absolute URL');
      }
    }
  }

  if (role === 'gateway' || role === 'service') {
    const jwtSecret = env.JWT_SECRET;
    if (production) {
      if (!jwtSecret || jwtSecret.trim().length < 32) {
        error('JWT_SECRET', 'must be configured with at least 32 characters in production');
      } else if (isPlaceholder(jwtSecret)) {
        error('JWT_SECRET', 'must not use a documented placeholder value in production');
      }
    } else if (!jwtSecret) {
      warn('JWT_SECRET', 'is not set; authentication routes will refuse to issue tokens');
    }

    if (role === 'gateway') {
      const origins = env.CORS_ORIGINS?.trim();
      if (production && !origins) {
        error('CORS_ORIGINS', 'must explicitly list the production web origin');
      }
      if (production && env.ENABLE_HSTS !== 'true') {
        warn('ENABLE_HSTS', 'is not true; enable HSTS at the edge or set ENABLE_HSTS=true');
      }
      if (production && env.TRUST_PROXY === undefined) {
        warn('TRUST_PROXY', 'is not set; rate limiting will not see the real client address behind a proxy');
      }

      const store = rateLimitStore === 'postgres' ? 'postgres' : 'memory';
      const replicaValue = Number(env.GATEWAY_REPLICA_COUNT ?? 1);
      const replicas = Number.isInteger(replicaValue) ? replicaValue : 1;

      if (replicas > 1 && store === 'memory') {
        error(
          'GATEWAY_REPLICA_COUNT',
          'requires a shared rate-limit store; set GATEWAY_RATE_LIMIT_STORE=postgres before running multiple gateway replicas',
        );
      }
      if (production && store === 'memory' && env.GATEWAY_REPLICA_COUNT === undefined) {
        warn(
          'GATEWAY_REPLICA_COUNT',
          'is not set; the in-process limiter assumes exactly one gateway replica. Set it explicitly or use the postgres store',
        );
      }

      if (store === 'postgres') {
        if (!hasDatabaseConfig(env)) {
          error(
            'GATEWAY_RATE_LIMIT_STORE',
            'postgres requires DATABASE_URL or the complete DB_HOST/DB_PORT/DB_NAME/DB_USER set',
          );
        } else if (production) {
          const target = parseDatabaseTarget(env);
          if (!target) {
            error('DATABASE_URL', 'is not a valid PostgreSQL connection target');
          } else {
            if (target.local && env.DATABASE_ALLOW_INSECURE !== 'true') {
              error('DATABASE_URL', 'must not target a loopback host in production');
            }
            if (!target.tls && env.DATABASE_SSL !== 'true' && env.DATABASE_ALLOW_INSECURE !== 'true') {
              error('DATABASE_URL', 'must enable TLS (sslmode=require/verify-* or DATABASE_SSL=true)');
            }
          }
        }
      }
    }

    if (role === 'service') {
      if (production && !hasDatabaseConfig(env)) {
        error('DATABASE_URL', 'or the complete DB_HOST/DB_PORT/DB_NAME/DB_USER set is required');
      } else if (hasDatabaseConfig(env)) {
        const target = parseDatabaseTarget(env);
        if (!target) {
          error('DATABASE_URL', 'is not a valid PostgreSQL connection target');
        } else if (production) {
          if (target.local && env.DATABASE_ALLOW_INSECURE !== 'true') {
            error('DATABASE_URL', 'must not target a loopback host in production');
          }
          if (!target.tls && env.DATABASE_SSL !== 'true' && env.DATABASE_ALLOW_INSECURE !== 'true') {
            error('DATABASE_URL', 'must enable TLS (sslmode=require/verify-* or DATABASE_SSL=true)');
          }
        }
      }
    }

    const mediaSecret = env.MEDIA_SIGNING_SECRET;
    if (mediaSecret !== undefined && mediaSecret.trim() !== '') {
      if (mediaSecret.trim().length < 32 || isPlaceholder(mediaSecret)) {
        error('MEDIA_SIGNING_SECRET', 'must be a non-placeholder secret of at least 32 characters');
      }
    } else if (production) {
      warn('MEDIA_SIGNING_SECRET', 'is not set; media signatures fall back to JWT_SECRET');
    }

    if (production && env.DELIVER_EMAILS !== 'true') {
      warn(
        'DELIVER_EMAILS',
        'is not true; verification/reset tokens are never exposed in production, but no email provider is configured',
      );
    }
    if (production && env.AI_REQUIRE_CONSENT === 'false') {
      error('AI_REQUIRE_CONSENT', 'must not be false in production');
    }
    if (env.AI_GATEWAY_URL?.trim() && !env.AI_GATEWAY_API_KEY?.trim()) {
      warn('AI_GATEWAY_API_KEY', 'is not set; the configured AI provider may reject requests');
    }
    if (production && env.AI_GATEWAY_URL?.trim()) {
      try {
        const parsed = new URL(env.AI_GATEWAY_URL);
        if (parsed.protocol !== 'https:') {
          warn('AI_GATEWAY_URL', 'should use https in production');
        }
      } catch {
        error('AI_GATEWAY_URL', 'must be a valid absolute URL');
      }
    }
  }

  return { ok: errors.length === 0, role, production, errors, warnings };
}

/** Throws a single aggregated error when validation fails. */
export function assertEnvironment(options: ValidateOptions = {}): EnvironmentValidation {
  const result = validateEnvironment(options);
  if (!result.ok) {
    const details = result.errors
      .map((issue) => `- ${issue.variable}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid ${result.role} environment:\n${details}`);
  }
  return result;
}
