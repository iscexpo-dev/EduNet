import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, asc, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import {
  aiAuditEvents,
  aiConversations,
  aiFeedback,
  aiMessages,
  aiPromptTemplates,
  aiUsageDaily,
  consentRecords,
} from '@edunet/database';
import { createHash } from 'node:crypto';

let client: postgres.Sql | null = null;
let db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!db) {
    const connectionString =
      process.env.DATABASE_URL ||
      `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
    client = postgres(connectionString);
    db = drizzle(client);
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    const active = client;
    client = null;
    db = null;
    await active.end();
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export async function getPromptTemplate(organizationId: string, key: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(aiPromptTemplates)
    .where(
      and(
        eq(aiPromptTemplates.key, key),
        eq(aiPromptTemplates.isActive, true),
        sql`(${aiPromptTemplates.organizationId} = ${organizationId} OR ${aiPromptTemplates.organizationId} IS NULL)`,
      ),
    )
    .orderBy(desc(aiPromptTemplates.organizationId), desc(aiPromptTemplates.version))
    .limit(1);
  return row ?? null;
}

export async function listPromptTemplates(organizationId: string) {
  const db = getDb();
  return db
    .select()
    .from(aiPromptTemplates)
    .where(
      sql`(${aiPromptTemplates.organizationId} = ${organizationId} OR ${aiPromptTemplates.organizationId} IS NULL)`,
    )
    .orderBy(asc(aiPromptTemplates.key), desc(aiPromptTemplates.version));
}

export async function upsertPromptTemplate(input: {
  organizationId: string;
  key: string;
  name: string;
  systemPrompt: string;
  isActive?: boolean;
}) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(aiPromptTemplates)
    .where(
      and(
        eq(aiPromptTemplates.organizationId, input.organizationId),
        eq(aiPromptTemplates.key, input.key),
      ),
    )
    .orderBy(desc(aiPromptTemplates.version))
    .limit(1);

  const [row] = await db
    .insert(aiPromptTemplates)
    .values({
      organizationId: input.organizationId,
      key: input.key,
      name: input.name,
      systemPrompt: input.systemPrompt,
      version: (existing?.version ?? 0) + 1,
      isActive: input.isActive ?? true,
    })
    .returning();

  if (existing) {
    await db
      .update(aiPromptTemplates)
      .set({ isActive: false })
      .where(
        and(
          eq(aiPromptTemplates.organizationId, input.organizationId),
          eq(aiPromptTemplates.key, input.key),
          eq(aiPromptTemplates.version, existing.version),
        ),
      );
  }
  return row!;
}

export async function listConversations(organizationId: string, userId: string) {
  const db = getDb();
  return db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.organizationId, organizationId),
        eq(aiConversations.userId, userId),
        eq(aiConversations.isArchived, false),
      ),
    )
    .orderBy(desc(aiConversations.updatedAt))
    .limit(50);
}

export async function getConversation(organizationId: string, userId: string, conversationId: string) {
  const db = getDb();
  const [conversation] = await db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.id, conversationId),
        eq(aiConversations.organizationId, organizationId),
        eq(aiConversations.userId, userId),
      ),
    )
    .limit(1);
  if (!conversation) throw new NotFoundError('Conversation not found');
  return conversation;
}

export async function createConversation(input: {
  organizationId: string;
  userId: string;
  title?: string;
  context?: Record<string, unknown>;
}) {
  const db = getDb();
  const [row] = await db
    .insert(aiConversations)
    .values({
      organizationId: input.organizationId,
      userId: input.userId,
      title: input.title?.slice(0, 200),
      context: input.context ?? null,
    })
    .returning();
  return row!;
}

export async function listMessages(organizationId: string, userId: string, conversationId: string, limit = 50) {
  await getConversation(organizationId, userId, conversationId);
  const db = getDb();
  return db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt))
    .limit(Math.min(limit, 200));
}

export async function saveMessage(input: {
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  safetyFlags?: Record<string, unknown> | null;
}) {
  const db = getDb();
  const [row] = await db.insert(aiMessages).values(input).returning();
  await db
    .update(aiConversations)
    .set({ updatedAt: new Date() })
    .where(eq(aiConversations.id, input.conversationId));
  return row!;
}

export async function archiveConversation(organizationId: string, userId: string, conversationId: string) {
  await getConversation(organizationId, userId, conversationId);
  const db = getDb();
  const [row] = await db
    .update(aiConversations)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(eq(aiConversations.id, conversationId))
    .returning();
  return row!;
}

export async function recordAuditEvent(input: {
  organizationId: string;
  userId: string;
  action: string;
  model?: string;
  input: string;
  output?: string;
  blocked?: boolean;
  reason?: string;
  latencyMs?: number;
}) {
  const db = getDb();
  const [row] = await db
    .insert(aiAuditEvents)
    .values({
      organizationId: input.organizationId,
      userId: input.userId,
      action: input.action,
      model: input.model,
      inputHash: hashText(input.input),
      outputHash: input.output ? hashText(input.output) : null,
      blocked: input.blocked ?? false,
      reason: input.reason,
      latencyMs: input.latencyMs,
    })
    .returning();
  return row!;
}

export async function addFeedback(messageId: string, userId: string, rating: number, comment?: string) {
  if (![1, -1].includes(rating)) throw new ConflictError('Rating must be 1 or -1');
  const db = getDb();
  const [message] = await db
    .select({ id: aiMessages.id, conversationId: aiMessages.conversationId })
    .from(aiMessages)
    .where(eq(aiMessages.id, messageId))
    .limit(1);
  if (!message) throw new NotFoundError('Message not found');
  const [conversation] = await db
    .select({ userId: aiConversations.userId })
    .from(aiConversations)
    .where(eq(aiConversations.id, message.conversationId))
    .limit(1);
  if (!conversation || conversation.userId !== userId) throw new ForbiddenError('Not your conversation');

  const [row] = await db.insert(aiFeedback).values({ messageId, userId, rating, comment }).returning();
  return row!;
}

export async function getUsageToday(organizationId: string) {
  const db = getDb();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({
      tokensIn: sql<number>`coalesce(sum(${aiUsageDaily.tokensIn}), 0)::int`,
      tokensOut: sql<number>`coalesce(sum(${aiUsageDaily.tokensOut}), 0)::int`,
      requests: sql<number>`coalesce(sum(${aiUsageDaily.requests}), 0)::int`,
    })
    .from(aiUsageDaily)
    .where(and(eq(aiUsageDaily.organizationId, organizationId), gte(aiUsageDaily.day, start)));
  return rows[0] ?? { tokensIn: 0, tokensOut: 0, requests: 0 };
}

export async function recordUsage(input: {
  organizationId: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
}) {
  const db = getDb();
  const day = new Date();
  day.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .insert(aiUsageDaily)
    .values({
      organizationId: input.organizationId,
      day,
      model: input.model,
      requests: 1,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      costMicros: input.costMicros,
    })
    .onConflictDoUpdate({
      target: [aiUsageDaily.organizationId, aiUsageDaily.day, aiUsageDaily.model],
      set: {
        requests: sql`${aiUsageDaily.requests} + 1`,
        tokensIn: sql`${aiUsageDaily.tokensIn} + ${input.tokensIn}`,
        tokensOut: sql`${aiUsageDaily.tokensOut} + ${input.tokensOut}`,
        costMicros: sql`${aiUsageDaily.costMicros} + ${input.costMicros}`,
      },
    })
    .returning();
  return row!;
}

export async function hasAiConsent(organizationId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ granted: consentRecords.granted, revokedAt: consentRecords.revokedAt })
    .from(consentRecords)
    .where(
      and(
        eq(consentRecords.organizationId, organizationId),
        eq(consentRecords.userId, userId),
        eq(consentRecords.type, 'ai_processing'),
        eq(consentRecords.granted, true),
        isNull(consentRecords.revokedAt),
      ),
    )
    .orderBy(desc(consentRecords.createdAt))
    .limit(1);
  return !!row;
}
