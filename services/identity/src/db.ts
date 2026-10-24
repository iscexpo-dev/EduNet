import { drizzle } from 'drizzle-orm/postgres-js';
import { users, organizations, identityAuditEvents, identityTokens, sessions } from '@edunet/database';
import { eq, and, isNull, gte, desc, sql } from 'drizzle-orm';
import postgres from 'postgres';
import type { TokenKind } from './security';

let client: postgres.Sql | null = null;
let db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!db) {
    const connectionString = process.env.DATABASE_URL || 
      `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
    
    client = postgres(connectionString);
    db = drizzle(client);
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    const activeClient = client;
    client = null;
    db = null;
    await activeClient.end();
  }
}

export async function findUserByEmail(email: string) {
  const db = getDb();
  const result = await db.select().from(users).where(eq(users.email, email));
  return result[0] || null;
}

export async function findUserById(id: string) {
  const db = getDb();
  const result = await db.select().from(users).where(eq(users.id, id));
  return result[0] || null;
}

export async function findOrganizationByCode(code: string) {
  const db = getDb();
  const result = await db.select().from(organizations).where(eq(organizations.code, code));
  return result[0] || null;
}

export async function createUser(data: {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId: string;
}) {
  const db = getDb();
  const [user] = await db.insert(users).values({
    id: crypto.randomUUID(),
    email: data.email,
    passwordHash: data.passwordHash,
    firstName: data.firstName,
    lastName: data.lastName,
    role: data.role as any,
    organizationId: data.organizationId,
    isVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return user;
}

// ---------------------------------------------------------------------------
// Identity extension: audit events, one-time tokens, device sessions
// ---------------------------------------------------------------------------

export type AuditEventType =
  | 'login_success'
  | 'login_failure'
  | 'register_success'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'email_verification_requested'
  | 'email_verification_confirmed'
  | 'phone_verification_requested'
  | 'phone_verification_confirmed'
  | 'session_revoked'
  | 'logout'
  | 'lockout';

export async function recordAuditEvent(data: {
  userId?: string | null;
  organizationId?: string | null;
  eventType: AuditEventType;
  outcome?: 'success' | 'failure';
  ipHash?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  await db.insert(identityAuditEvents).values({
    userId: data.userId ?? null,
    organizationId: data.organizationId ?? null,
    eventType: data.eventType,
    outcome: data.outcome ?? 'success',
    ipHash: data.ipHash ?? null,
    userAgent: data.userAgent?.slice(0, 300) ?? null,
    metadata: data.metadata ?? null,
    createdAt: new Date(),
  });
}

export async function listRecentFailedLogins(subject: {
  userId?: string | null;
  ipHash?: string | null;
}, windowMs: number) {
  const db = getDb();
  const since = new Date(Date.now() - windowMs);
  const conditions = [
    eq(identityAuditEvents.eventType, 'login_failure'),
    gte(identityAuditEvents.createdAt, since),
  ];
  const rows = await db
    .select({
      userId: identityAuditEvents.userId,
      ipHash: identityAuditEvents.ipHash,
      createdAt: identityAuditEvents.createdAt,
    })
    .from(identityAuditEvents)
    .where(and(...conditions))
    .orderBy(desc(identityAuditEvents.createdAt))
    .limit(200);
  // Filter to the subject; column uses ISO timestamps.
  return rows
    .filter((row) => {
      if (subject.userId && row.userId === subject.userId) return true;
      if (subject.ipHash && row.ipHash === subject.ipHash) return true;
      return false;
    })
    .map((row) => ({
      userId: row.userId,
      ipHash: row.ipHash,
      at: new Date(row.createdAt).getTime(),
    }));
}

export async function createIdentityToken(data: {
  userId: string;
  kind: TokenKind;
  tokenHash: string;
  ttlMs: number;
}) {
  const db = getDb();
  const [token] = await db
    .insert(identityTokens)
    .values({
      userId: data.userId,
      kind: data.kind,
      tokenHash: data.tokenHash,
      expiresAt: new Date(Date.now() + data.ttlMs),
      createdAt: new Date(),
    })
    .returning();
  return token;
}

export async function findUnusedIdentityToken(tokenHash: string, kind: TokenKind) {
  const db = getDb();
  const [token] = await db
    .select()
    .from(identityTokens)
    .where(
      and(
        eq(identityTokens.tokenHash, tokenHash),
        eq(identityTokens.kind, kind),
        isNull(identityTokens.usedAt),
      ),
    )
    .limit(1);
  return token ?? null;
}

export async function markIdentityTokenUsed(id: string) {
  const db = getDb();
  await db
    .update(identityTokens)
    .set({ usedAt: new Date() })
    .where(eq(identityTokens.id, id));
}

/** Invalidates any outstanding tokens of a kind for a user (e.g. re-requested reset). */
export async function expireIdentityTokens(userId: string, kind: TokenKind) {
  const db = getDb();
  await db
    .update(identityTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(identityTokens.userId, userId),
        eq(identityTokens.kind, kind),
        isNull(identityTokens.usedAt),
      ),
    );
}

export async function setUserPassword(userId: string, passwordHash: string) {
  const db = getDb();
  const [user] = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

export async function setUserVerified(userId: string, isVerified: boolean) {
  const db = getDb();
  const [user] = await db
    .update(users)
    .set({ isVerified, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return user;
}

export async function createSession(data: {
  userId: string;
  sessionId: string;
  deviceName?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
}) {
  const db = getDb();
  const [session] = await db
    .insert(sessions)
    .values({
      userId: data.userId,
      sessionId: data.sessionId,
      deviceName: data.deviceName ?? null,
      ipHash: data.ipHash ?? null,
      userAgent: data.userAgent?.slice(0, 300) ?? null,
      createdAt: new Date(),
      lastSeenAt: new Date(),
    })
    .returning();
  return session;
}

export async function listSessions(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .orderBy(desc(sessions.createdAt));
}

export async function revokeSession(userId: string, sessionId: string) {
  const db = getDb();
  const [updated] = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), eq(sessions.sessionId, sessionId), isNull(sessions.revokedAt)))
    .returning();
  return updated ?? null;
}

export async function revokeAllSessions(userId: string) {
  const db = getDb();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function listAuditEvents(options: {
  organizationId: string;
  eventType?: string;
  limit?: number;
  offset?: number;
}) {
  const db = getDb();
  const conditions = [sql`${identityAuditEvents.organizationId} = ${options.organizationId}`];
  if (options.eventType) {
    conditions.push(eq(identityAuditEvents.eventType, options.eventType));
  }
  return db
    .select()
    .from(identityAuditEvents)
    .where(and(...conditions))
    .orderBy(desc(identityAuditEvents.createdAt))
    .limit(Math.min(options.limit ?? 50, 200))
    .offset(options.offset ?? 0);
}
