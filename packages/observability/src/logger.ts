/**
 * Structured JSON logger shared by every EduNet service.
 *
 * Requirements enforced here:
 * - Machine-parseable output (one JSON object per line) so aggregator agents
 *   can index events without regex parsing.
 * - Sensitive keys are redacted before serialization; nested objects are
 *   walked so `user.password` or `body.authorization` never reaches disk.
 * - Never logs credentials, tokens, passwords, or student-identifying fields
 *   that are classified as sensitive in docs/security/security.md.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Keys whose values are always replaced with `[REDACTED]`. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'newpassword',
  'currentpassword',
  'token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'authorization',
  'cookie',
  'secret',
  'jwt_secret',
  'otp',
  'pin',
  'reset_token',
  'verification_code',
  'answer', // assessment answers may embed a student's identity markers
]);

/** Keys whose values are pseudonymised: first characters kept for debugging. */
const TRUNCATED_KEYS = new Set([
  'email',
  'phone_number',
  'phonenumber',
]);

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function truncatePseudonym(value: string): string {
  const [localPart] = value.split('@');
  if (!localPart || localPart.length === 0) return '[PSEUDONYMIZED]';
  return `${localPart.slice(0, 2)}***`;
}

function redact(value: unknown, depth: number): unknown {
  if (depth > 6) return '[TRUNCATED_DEPTH]';
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(source)) {
      const normalised = normaliseKey(key);
      if (REDACTED_KEYS.has(normalised)) {
        output[key] = '[REDACTED]';
      } else if (TRUNCATED_KEYS.has(normalised) && typeof inner === 'string') {
        output[key] = truncatePseudonym(inner);
      } else {
        output[key] = redact(inner, depth + 1);
      }
    }
    return output;
  }

  if (typeof value === 'string') {
    // Never allow raw bearer tokens to slip through labelled fields.
    return value.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
  }

  return value;
}

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

function configuredMinLevel(): number {
  const raw = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
  return LEVEL_SEVERITY[raw] ?? LEVEL_SEVERITY.info;
}

function resolveSink(): (line: string, level: LogLevel) => void {
  if (process.env.LOG_SILENT === 'true') {
    return () => undefined;
  }
  return (line, level) => {
    if (level === 'error') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  };
}

export function createLogger(baseFields: LogFields = {}): Logger {
  const minLevel = configuredMinLevel();
  const sink = resolveSink();

  function emit(level: LogLevel, message: string, fields?: LogFields): void {
    if (LEVEL_SEVERITY[level] < minLevel) return;
    const event = {
      timestamp: new Date().toISOString(),
      level,
      service: process.env.SERVICE_NAME || 'edunet',
      ...redact({ ...baseFields, ...fields }, 0) as LogFields,
      message,
    };
    sink(JSON.stringify(event), level);
  }

  function child(fields: LogFields): Logger {
    return createLogger({ ...baseFields, ...fields });
  }

  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    child,
  };
}

export const logger = createLogger();
