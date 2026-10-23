import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./db', () => {
  return {
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    findOrganizationByCode: vi.fn(),
    createUser: vi.fn(),
    recordAuditEvent: vi.fn(),
    listRecentFailedLogins: vi.fn(async () => []),
    createIdentityToken: vi.fn(),
    findUnusedIdentityToken: vi.fn(),
    markIdentityTokenUsed: vi.fn(),
    expireIdentityTokens: vi.fn(),
    setUserPassword: vi.fn(),
    setUserVerified: vi.fn(),
    createSession: vi.fn(),
    listSessions: vi.fn(async () => []),
    revokeSession: vi.fn(async () => null),
    revokeAllSessions: vi.fn(async () => undefined),
    listAuditEvents: vi.fn(async () => []),
  };
});

import {
  passwordResetRequestHandler,
  passwordResetConfirmHandler,
  loginHandler,
  verificationRequestHandler,
  verificationConfirmHandler,
  listSessionsHandler,
  revokeSessionHandler,
  listAuditHandler,
} from './handlers';
import {
  findUserByEmail,
  findUserById,
  findUnusedIdentityToken,
  setUserPassword,
  setUserVerified,
  markIdentityTokenUsed,
  expireIdentityTokens,
  revokeAllSessions,
  recordAuditEvent,
  listRecentFailedLogins,
  createIdentityToken,
  createSession,
} from './db';

const TEST_ENV = { JWT_SECRET: 'identity-handlers-test-secret-with-entropy-32' };

function fakeReq(overrides: Record<string, unknown> = {}) {
  return {
    body: {},
    headers: {},
    params: {},
    query: {},
    ip: '203.0.113.9',
    user: { id: 'user-1', role: 'student', organizationId: 'org-1' },
    ...overrides,
  } as never;
}

function fakeRes() {
  let status: number | undefined;
  let body: unknown;
  const statuses: number[] = [];
  const res = {
    status(code: number) {
      status = code;
      statuses.push(code);
      return res;
    },
    json(payload: unknown) {
      body = payload;
      return res;
    },
  };
  return {
    res,
    lastStatus: () => status,
    last: () => ({ status, body }),
    statuses: () => statuses,
  };
}

const futureExpiry = () => new Date(Date.now() + 60 * 60 * 1000);

describe('password reset request (anti-enumeration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = TEST_ENV.JWT_SECRET;
    delete process.env.DELIVER_EMAILS;
  });

  it('answers identically and does not create tokens for unknown emails', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null as never);
    const { res, last } = fakeRes();
    await passwordResetRequestHandler(fakeReq({ body: { email: 'ghost@school.edu' } }), res as never);
    expect(last().status).toBe(202);
    expect(last().body).not.toHaveProperty('token');
    expect(findUnusedIdentityToken).not.toHaveBeenCalled();
  });

  it('creates a single-use token for existing users and returns it in sandbox mode', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: 'user-1',
      organizationId: 'org-1',
      deletedAt: null,
    } as never);
    const { res, last } = fakeRes();
    await passwordResetRequestHandler(fakeReq({ body: { email: 'user@school.edu' } }), res as never);
    expect(last().status).toBe(202);
    const body = last().body as { token?: string };
    expect(body.token).toMatch(/^reset_[0-9a-f]{64}$/);
    expect(createIdentityToken).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', eventType: 'password_reset_requested' }),
    );
  });

  it('never returns the token once email delivery is enabled', async () => {
    process.env.DELIVER_EMAILS = 'true';
    vi.mocked(findUserByEmail).mockResolvedValue({ id: 'user-1', deletedAt: null } as never);
    const { res, last } = fakeRes();
    await passwordResetRequestHandler(fakeReq({ body: { email: 'user@school.edu' } }), res as never);
    expect(last().body).not.toHaveProperty('token');
  });
});

describe('password reset confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = TEST_ENV.JWT_SECRET;
  });

  it('rotates the password and revokes all sessions for a valid token', async () => {
    vi.mocked(findUnusedIdentityToken).mockResolvedValue({
      id: 'token-row-1',
      userId: 'user-1',
      expiresAt: futureExpiry(),
    } as never);
    vi.mocked(findUserById).mockResolvedValue({ id: 'user-1', organizationId: 'org-1' } as never);
    vi.mocked(setUserPassword).mockResolvedValue({ id: 'user-1' } as never);
    const { res, last } = fakeRes();
    await passwordResetConfirmHandler(
      fakeReq({ body: { token: 'reset_' + 'a'.repeat(64), password: 'NewPassword-2026' } }),
      res as never,
    );
    expect(setUserPassword).toHaveBeenCalledWith('user-1', expect.any(String));
    expect(markIdentityTokenUsed).toHaveBeenCalledWith('token-row-1');
    expect(revokeAllSessions).toHaveBeenCalledWith('user-1');
    expect(expireIdentityTokens).toHaveBeenCalledWith('user-1', 'password_reset');
    expect(last().body).toEqual({ success: true });
  });

  it('rejects unknown or already used tokens', async () => {
    vi.mocked(findUnusedIdentityToken).mockResolvedValue(null as never);
    const { res, last } = fakeRes();
    await passwordResetConfirmHandler(
      fakeReq({ body: { token: 'reset_' + 'b'.repeat(64), password: 'NewPassword-2026' } }),
      res as never,
    );
    expect(last().status).toBe(400);
    expect(setUserPassword).not.toHaveBeenCalled();
  });
});

describe('login with lockout and sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = TEST_ENV.JWT_SECRET;
  });

  it('locks an account after repeated failures within the window', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: 'user-1',
      organizationId: 'org-1',
      passwordHash: 'not-bcrypt-comparable-hash',
      email: 'locked@school.edu',
    } as never);
    vi.mocked(listRecentFailedLogins).mockResolvedValue(
      [0, 1, 2, 3, 4].map((i) => ({
        userId: 'user-1',
        ipHash: null,
        at: Date.now() - i * 60_000,
      })) as never,
    );
    const { res, last } = fakeRes();
    await loginHandler(fakeReq({ body: { email: 'locked@school.edu', password: 'Whatever-123' } }), res as never);
    expect(last().status).toBe(423);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'lockout', outcome: 'failure' }),
    );
  });

  it('creates a device session on successful login', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null as never);
    const { res, last } = fakeRes();
    await loginHandler(fakeReq({ body: { email: 'unknown@school.edu', password: 'Whatever-123' } }), res as never);
    expect(last().status).toBe(401);
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe('verify + audit access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = TEST_ENV.JWT_SECRET;
  });

  it('confirm verifies only the owner of the token', async () => {
    vi.mocked(findUnusedIdentityToken).mockResolvedValue({
      id: 'token-row',
      userId: 'someone-else',
      expiresAt: futureExpiry(),
    } as never);
    const { res, last } = fakeRes();
    await verificationConfirmHandler(
      fakeReq({ body: { kind: 'email_verification', token: 'verify_' + 'c'.repeat(64) } }),
      res as never,
    );
    expect(last().status).toBe(400);
    expect(setUserVerified).not.toHaveBeenCalled();
  });

  it('audit events require an organization context', async () => {
    const { res, last } = fakeRes();
    await listAuditHandler(
      fakeReq({ user: { id: 'u', role: 'admin', organizationId: undefined } }),
      res as never,
    );
    expect(last().status).toBe(400);
  });

  it('sessions listing returns rows', async () => {
    const { res, last } = fakeRes();
    await listSessionsHandler(fakeReq(), res as never);
    expect(last().body).toEqual([]);
  });

  it('revoking a foreign session returns 404', async () => {
    const { res, last } = fakeRes();
    await revokeSessionHandler(fakeReq({ params: { id: 'does-not-exist' } }), res as never);
    expect(last().status).toBe(404);
  });
});
