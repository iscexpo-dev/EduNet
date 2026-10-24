import { Request, Response } from 'express';

/**
 * Identity handlers: register, login (with lockout + audit), refresh,
 * password reset, email/phone verification, device/session management and
 * admin audit listing.
 *
 * Anti-enumeration rule: password-reset requests always answer `202` with the
 * same body, whether or not the account exists. Timing/response-shape leaks
 * are treated as user-enumeration vectors.
 */

import {
  loginSchema,
  registerSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  tokenConfirmSchema,
  verificationRequestSchema,
} from '@edunet/validation';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from './auth';
import {
  generateOpaqueToken,
  sha256Hex,
  anonymizeIp,
  evaluateLockout,
  tokenTtlMs,
  normalizeEmail,
} from './security';
import type { AuthRequest } from './middleware';
import type { TokenKind } from './security';
import type { AuditEventType } from './db';
import {
  findUserByEmail,
  findUserById,
  findOrganizationByCode,
  createUser,
  recordAuditEvent,
  listRecentFailedLogins,
  createIdentityToken,
  findUnusedIdentityToken,
  markIdentityTokenUsed,
  expireIdentityTokens,
  setUserPassword,
  setUserVerified,
  createSession,
  listSessions,
  revokeSession,
  revokeAllSessions,
  listAuditEvents,
} from './db';

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const [first] = forwarded.split(',');
    if (first) return first.trim();
  }
  return req.ip ?? '127.0.0.1';
}

function anonymizeFromRequest(req: Request): string | null {
  try {
    return anonymizeIp(clientIp(req));
  } catch {
    return null;
  }
}

/**
 * Development-only token exposure. Production must never return password-reset
 * or verification tokens in an HTTP response, even when email delivery is
 * misconfigured.
 */
function exposeDevelopmentTokens(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DELIVER_EMAILS !== 'true';
}

const LOCKED_RESPONSE = { error: 'Too many failed attempts. Try again later.' };

export async function registerHandler(req: Request, res: Response) {
  try {
    const data = registerSchema.parse(req.body);

    const existingUser = await findUserByEmail(normalizeEmail(data.email));
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const organization = await findOrganizationByCode(data.organizationCode);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const hashedPassword = await hashPassword(data.password);
    const user = await createUser({
      email: normalizeEmail(data.email),
      passwordHash: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      organizationId: organization.id,
    });

    await recordAuditEvent({
      userId: user.id,
      organizationId: organization.id,
      eventType: 'register_success',
      ipHash: anonymizeFromRequest(req),
      userAgent: req.headers['user-agent'] ?? null,
    });

    // Registration issues verification material so the account can be
    // confirmed out of the box.
    const rawToken = generateOpaqueToken();
    await createIdentityToken({
      userId: user.id,
      kind: 'email_verification',
      tokenHash: sha256Hex(rawToken),
      ttlMs: tokenTtlMs('email_verification'),
    });

    const token = generateAccessToken({
      userId: user.id,
      role: user.role,
      organizationId: user.organizationId,
    });
    const refreshToken = generateRefreshToken({ userId: user.id });

    res.status(201).json({
      token,
      refreshToken,
      // Returned only while email delivery is disabled (sandbox/testing).
      // In production the token is dispatched by the notification service.
      verificationToken: exposeDevelopmentTokens() ? rawToken : undefined,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
      },
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function loginHandler(req: Request, res: Response) {
  try {
    const data = loginSchema.parse(req.body);
    const email = normalizeEmail(data.email);
    const ipHash = anonymizeFromRequest(req);
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;

    const user = await findUserByEmail(email);

    if (user) {
      const lockout = evaluateLockout(
        await listRecentFailedLogins({ userId: user.id, ipHash }, 15 * 60 * 1000),
        { userId: user.id, ipHash },
        Date.now(),
      );
      if (lockout.locked) {
        await recordAuditEvent({
          userId: user.id,
          organizationId: user.organizationId,
          eventType: 'lockout',
          outcome: 'failure',
          ipHash,
          userAgent: userAgent,
        });
        return res.status(423).json(LOCKED_RESPONSE);
      }
    }

    const isValid = user ? await verifyPassword(data.password, user.passwordHash) : false;

    if (!user || !isValid) {
      if (user) {
        await recordAuditEvent({
          userId: user.id,
          organizationId: user.organizationId,
          eventType: 'login_failure',
          outcome: 'failure',
          ipHash,
          userAgent: userAgent,
        });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateAccessToken({
      userId: user.id,
      role: user.role,
      organizationId: user.organizationId,
    });
    const refreshToken = generateRefreshToken({ userId: user.id });
    await createSession({
      userId: user.id,
      sessionId: extractSessionId(refreshToken),
      deviceName: typeof req.body?.deviceName === 'string' ? req.body.deviceName.slice(0, 200) : undefined,
      ipHash,
      userAgent: userAgent,
    });

    await recordAuditEvent({
      userId: user.id,
      organizationId: user.organizationId,
      eventType: 'login_success',
      ipHash,
      userAgent: userAgent,
    });

    res.json({
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
      },
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

function extractSessionId(refreshToken: string): string {
  try {
    const decoded = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64').toString()) as { jti?: string };
    return typeof decoded.jti === 'string' ? decoded.jti : sha256Hex(refreshToken);
  } catch {
    return sha256Hex(refreshToken);
  }
}

export async function refreshTokenHandler(req: Request, res: Response) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    const payload = verifyRefreshToken(refreshToken);

    const user = await findUserById(payload.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const newToken = generateAccessToken({
      userId: user.id,
      role: user.role,
      organizationId: user.organizationId,
    });

    res.json({ token: newToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

const RESET_ACCEPTED = {
  accepted: true,
  message: 'If the account exists, a reset link has been sent.',
};

export async function passwordResetRequestHandler(req: Request, res: Response) {
  try {
    const data = passwordResetRequestSchema.parse(req.body);
    const email = normalizeEmail(data.email);
    const user = await findUserByEmail(email);

    // Anti-enumeration: identical response for known and unknown emails.
    if (!user || user.deletedAt) {
      return res.status(202).json(RESET_ACCEPTED);
    }

    const rawToken = generateOpaqueToken('reset');
    await expireIdentityTokens(user.id, 'password_reset');
    await createIdentityToken({
      userId: user.id,
      kind: 'password_reset',
      tokenHash: sha256Hex(rawToken),
      ttlMs: tokenTtlMs('password_reset'),
    });
    await recordAuditEvent({
      userId: user.id,
      organizationId: user.organizationId,
      eventType: 'password_reset_requested',
      ipHash: anonymizeFromRequest(req),
      userAgent: req.headers['user-agent'] ?? null,
    });

    // The token is returned only while delivery is disabled (sandbox/testing);
    // production delivers it via the notification service.
    if (!exposeDevelopmentTokens()) {
      return res.status(202).json(RESET_ACCEPTED);
    }
    return res.status(202).json({ ...RESET_ACCEPTED, token: rawToken });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function passwordResetConfirmHandler(req: Request, res: Response) {
  try {
    const data = passwordResetConfirmSchema.parse(req.body);
    const token = await findUnusedIdentityToken(sha256Hex(data.token), 'password_reset');

    if (!token || token.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const user = await findUserById(token.userId);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    await setUserPassword(user.id, await hashPassword(data.password));
    await markIdentityTokenUsed(token.id);
    await expireIdentityTokens(user.id, 'password_reset');
    // A completed reset invalidates established sessions on other devices.
    await revokeAllSessions(user.id);
    await recordAuditEvent({
      userId: user.id,
      organizationId: user.organizationId,
      eventType: 'password_reset_completed',
      ipHash: anonymizeFromRequest(req),
    });

    return res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// Email / phone verification
// ---------------------------------------------------------------------------

export async function verificationRequestHandler(req: AuthRequest, res: Response) {
  try {
    if (!req.user || !req.user.organizationId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const { kind } = verificationRequestSchema.parse(req.body);
    const rawToken = generateOpaqueToken('verify');
    await expireIdentityTokens(req.user.id, kind);
    await createIdentityToken({
      userId: req.user.id,
      kind,
      tokenHash: sha256Hex(rawToken),
      ttlMs: tokenTtlMs(kind),
    });
    await recordAuditEvent({
      userId: req.user.id,
      organizationId: req.user.organizationId ?? null,
      eventType: `${kind}_requested` as AuditEventType,
    });
    if (!exposeDevelopmentTokens()) {
      return res.status(202).json({ accepted: true });
    }
    return res.status(202).json({ accepted: true, token: rawToken });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

export async function verificationConfirmHandler(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const data = tokenConfirmSchema.parse(req.body);
    const token = await findUnusedIdentityToken(sha256Hex(data.token), data.kind);
    if (!token || token.userId !== req.user.id || token.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    await markIdentityTokenUsed(token.id);
    await expireIdentityTokens(req.user.id, data.kind);
    const user = await setUserVerified(req.user.id, true);
    await recordAuditEvent({
      userId: req.user.id,
      eventType: `${data.kind}_confirmed` as AuditEventType,
    });
    return res.json({ isVerified: user?.isVerified ?? true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// Device/session management
// ---------------------------------------------------------------------------

export async function listSessionsHandler(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const rows = await listSessions(req.user.id);
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function revokeSessionHandler(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const sessionId = req.params.id;
    if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 200) {
      return res.status(400).json({ error: 'Invalid session id' });
    }
    const revoked = await revokeSession(req.user.id, sessionId);
    if (!revoked) {
      return res.status(404).json({ error: 'Session not found' });
    }
    await recordAuditEvent({ userId: req.user.id, eventType: 'session_revoked' });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

// ---------------------------------------------------------------------------
// Audit log (admin, org-scoped)
// ---------------------------------------------------------------------------

export async function listAuditHandler(req: AuthRequest, res: Response) {
  try {
    if (!req.user?.organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }
    const events = await listAuditEvents({
      organizationId: req.user.organizationId ?? '',
      eventType: typeof req.query.eventType === 'string' ? req.query.eventType : undefined,
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
      offset: typeof req.query.offset === 'string' ? Number(req.query.offset) : undefined,
    });
    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
