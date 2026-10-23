import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import {
  blockedUsers,
  conversationParticipants,
  conversations,
  forumPosts,
  forumTopics,
  forums,
  messageReports,
  messages,
  users,
} from '@edunet/database';
import {
  canPostToForum,
  moderateMessage,
  sortForumTopics,
} from './logic';

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

function bannedTerms(): string[] {
  return (process.env.CHAT_BANNED_TERMS ?? '')
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);
}

export function moderate(body: string) {
  return moderateMessage(body, { bannedTerms: bannedTerms() });
}

async function participantIds(conversationId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId));
  return rows.map((row) => row.userId);
}

export async function listConversations(organizationId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: conversations.id,
      type: conversations.type,
      title: conversations.title,
      createdBy: conversations.createdBy,
      lastMessageAt: conversations.lastMessageAt,
      isLocked: conversations.isLocked,
      createdAt: conversations.createdAt,
      lastReadAt: conversationParticipants.lastReadAt,
      isMuted: conversationParticipants.isMuted,
    })
    .from(conversations)
    .innerJoin(
      conversationParticipants,
      and(
        eq(conversationParticipants.conversationId, conversations.id),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .where(eq(conversations.organizationId, organizationId))
    .orderBy(desc(conversations.lastMessageAt), desc(conversations.createdAt))
    .limit(100);

  return Promise.all(
    rows.map(async (row) => {
      const unread = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, row.id),
            isNull(messages.deletedAt),
            row.lastReadAt
              ? and(gt(messages.createdAt, row.lastReadAt), sql`${messages.senderId} <> ${userId}`)
              : sql`${messages.senderId} <> ${userId}`,
          ),
        );
      return { ...row, unreadCount: unread[0]?.count ?? 0 };
    }),
  );
}

export async function createConversation(input: {
  organizationId: string;
  type: 'direct' | 'group' | 'support';
  title?: string;
  createdBy: string;
  participantIds: string[];
}) {
  const db = getDb();
  const uniqueIds = [...new Set([input.createdBy, ...input.participantIds])];
  if (input.type === 'direct' && uniqueIds.length !== 2) {
    throw new ConflictError('Direct conversations need exactly two participants');
  }
  const members = await db
    .select({ id: users.id, organizationId: users.organizationId })
    .from(users)
    .where(inArray(users.id, uniqueIds));
  if (members.length !== uniqueIds.length) throw new NotFoundError('Participant not found');
  if (members.some((member) => member.organizationId !== input.organizationId)) {
    throw new ForbiddenError('Cross-tenant conversation');
  }

  return db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(conversations)
      .values({
        organizationId: input.organizationId,
        type: input.type,
        title: input.title,
        createdBy: input.createdBy,
      })
      .returning();
    await tx.insert(conversationParticipants).values(
      uniqueIds.map((userId) => ({
        conversationId: conversation!.id,
        userId,
        role: userId === input.createdBy ? 'owner' : 'member',
      })),
    );
    return conversation!;
  });
}

export async function getConversation(organizationId: string, userId: string, conversationId: string) {
  const db = getDb();
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId)))
    .limit(1);
  if (!conversation) throw new NotFoundError('Conversation not found');

  const ids = await participantIds(conversationId);
  const [membership] = await db
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .limit(1);
  if (!membership) throw new ForbiddenError('Not a participant');
  return { conversation, participantIds: ids, membership };
}

export async function listMessages(
  organizationId: string,
  userId: string,
  conversationId: string,
  options: { before?: Date; limit?: number } = {},
) {
  const db = getDb();
  const { conversation } = await getConversation(organizationId, userId, conversationId);
  const conditions = [
    eq(messages.conversationId, conversationId),
    isNull(messages.deletedAt),
    eq(messages.moderationStatus, 'visible'),
  ];
  if (options.before) conditions.push(lt(messages.createdAt, options.before));

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(Math.min(options.limit ?? 50, 200));

  return {
    conversation,
    messages: rows.reverse(),
    nextCursor: rows.length === Math.min(options.limit ?? 50, 200) ? rows[0]?.createdAt ?? null : null,
  };
}

export async function sendMessage(input: {
  organizationId: string;
  conversationId: string;
  senderId: string;
  senderRole: string;
  body: string;
  attachmentIds?: string[];
  replyToId?: string;
}) {
  const db = getDb();
  const { conversation } = await getConversation(
    input.organizationId,
    input.senderId,
    input.conversationId,
  );
  if (conversation.isLocked) throw new ConflictError('Conversation is locked');

  const moderation = moderate(input.body);
  if (moderation.status === 'blocked') {
    throw new ConflictError(`Message rejected: ${moderation.reasons.join(', ')}`);
  }

  const ids = await participantIds(input.conversationId);
  const others = ids.filter((id) => id !== input.senderId);
  const blocks = await db
    .select({ blockerId: blockedUsers.userId, blockedId: blockedUsers.blockedUserId })
    .from(blockedUsers)
    .where(
      or(
        and(eq(blockedUsers.userId, input.senderId), inArray(blockedUsers.blockedUserId, others)),
        and(eq(blockedUsers.blockedUserId, input.senderId), inArray(blockedUsers.userId, others)),
      ),
    );
  if (blocks.length) {
    throw new ForbiddenError('Messaging is blocked');
  }

  return db.transaction(async (tx) => {
    const [message] = await tx
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        senderId: input.senderId,
        body: input.body,
        attachmentIds: input.attachmentIds ?? [],
        replyToId: input.replyToId,
        moderationStatus: moderation.status === 'flagged' ? 'hidden' : 'visible',
      })
      .returning();
    await tx
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, input.conversationId));
    await tx
      .update(conversationParticipants)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(conversationParticipants.conversationId, input.conversationId),
          eq(conversationParticipants.userId, input.senderId),
        ),
      );
    return { message: message!, moderation };
  });
}

export async function markConversationRead(organizationId: string, userId: string, conversationId: string) {
  await getConversation(organizationId, userId, conversationId);
  const db = getDb();
  const [row] = await db
    .update(conversationParticipants)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId),
      ),
    )
    .returning();
  return row!;
}

export async function addParticipants(
  organizationId: string,
  userId: string,
  conversationId: string,
  newParticipantIds: string[],
) {
  const { conversation } = await getConversation(organizationId, userId, conversationId);
  if (conversation.type === 'direct') throw new ConflictError('Cannot add participants to a direct conversation');
  const db = getDb();
  const members = await db
    .select({ id: users.id, organizationId: users.organizationId })
    .from(users)
    .where(inArray(users.id, newParticipantIds));
  if (members.length !== new Set(newParticipantIds).size) throw new NotFoundError('Participant not found');
  if (members.some((member) => member.organizationId !== organizationId)) {
    throw new ForbiddenError('Cross-tenant participant');
  }
  if (!members.length) return [];
  return db
    .insert(conversationParticipants)
    .values(newParticipantIds.map((id) => ({ conversationId, userId: id })))
    .onConflictDoNothing()
    .returning();
}

export async function reportMessage(
  organizationId: string,
  reporterId: string,
  messageId: string,
  reason: string,
  details?: string,
) {
  const db = getDb();
  const [message] = await db
    .select({ id: messages.id, conversationId: messages.conversationId })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  if (!message) throw new NotFoundError('Message not found');
  await getConversation(organizationId, reporterId, message.conversationId);
  const [report] = await db
    .insert(messageReports)
    .values({ messageId, reporterId, reason, details })
    .returning();
  return report!;
}

export async function listModerationQueue(organizationId: string, status = 'open') {
  const db = getDb();
  return db
    .select({
      id: messageReports.id,
      reason: messageReports.reason,
      details: messageReports.details,
      status: messageReports.status,
      createdAt: messageReports.createdAt,
      messageId: messages.id,
      body: messages.body,
      senderId: messages.senderId,
      conversationId: messages.conversationId,
      reporterId: messageReports.reporterId,
    })
    .from(messageReports)
    .innerJoin(messages, eq(messages.id, messageReports.messageId))
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(conversations.organizationId, organizationId), eq(messageReports.status, status)))
    .orderBy(asc(messageReports.createdAt))
    .limit(200);
}

export async function resolveReport(
  organizationId: string,
  reviewerId: string,
  reportId: string,
  action: 'hide' | 'remove' | 'dismiss',
) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [report] = await tx
      .select({ report: messageReports, conversationId: messages.conversationId })
      .from(messageReports)
      .innerJoin(messages, eq(messages.id, messageReports.messageId))
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(eq(messageReports.id, reportId), eq(conversations.organizationId, organizationId)))
      .for('update')
      .limit(1);
    if (!report) throw new NotFoundError('Report not found');

    if (action !== 'dismiss') {
      await tx
        .update(messages)
        .set({
          moderationStatus: action === 'remove' ? 'removed' : 'hidden',
          deletedAt: action === 'remove' ? new Date() : null,
        })
        .where(eq(messages.id, report.report.messageId));
    }
    const [updated] = await tx
      .update(messageReports)
      .set({
        status: action === 'dismiss' ? 'dismissed' : 'actioned',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      })
      .where(eq(messageReports.id, reportId))
      .returning();
    return updated!;
  });
}

export async function blockUser(userId: string, blockedUserId: string) {
  if (userId === blockedUserId) throw new ConflictError('Cannot block yourself');
  const db = getDb();
  const [row] = await db
    .insert(blockedUsers)
    .values({ userId, blockedUserId })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function unblockUser(userId: string, blockedUserId: string) {
  const db = getDb();
  const [row] = await db
    .delete(blockedUsers)
    .where(and(eq(blockedUsers.userId, userId), eq(blockedUsers.blockedUserId, blockedUserId)))
    .returning();
  return row ?? null;
}

export async function listBlockedUsers(userId: string) {
  const db = getDb();
  return db
    .select({
      id: blockedUsers.id,
      blockedUserId: blockedUsers.blockedUserId,
      createdAt: blockedUsers.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(blockedUsers)
    .innerJoin(users, eq(users.id, blockedUsers.blockedUserId))
    .where(eq(blockedUsers.userId, userId));
}

// ---------------------------------------------------------------------------
// Forums
// ---------------------------------------------------------------------------

export async function listForums(organizationId: string, courseId?: string) {
  const db = getDb();
  const conditions = [eq(forums.organizationId, organizationId)];
  if (courseId) conditions.push(eq(forums.courseId, courseId));
  return db
    .select()
    .from(forums)
    .where(and(...conditions))
    .orderBy(asc(forums.title));
}

export async function createForum(data: typeof forums.$inferInsert) {
  const db = getDb();
  const [row] = await db.insert(forums).values(data).returning();
  return row!;
}

export async function listForumTopics(organizationId: string, forumId: string) {
  const db = getDb();
  const [forum] = await db
    .select()
    .from(forums)
    .where(and(eq(forums.id, forumId), eq(forums.organizationId, organizationId)))
    .limit(1);
  if (!forum) throw new NotFoundError('Forum not found');

  const topics = await db
    .select({
      id: forumTopics.id,
      forumId: forumTopics.forumId,
      authorId: forumTopics.authorId,
      title: forumTopics.title,
      body: forumTopics.body,
      isPinned: forumTopics.isPinned,
      isLocked: forumTopics.isLocked,
      status: forumTopics.status,
      createdAt: forumTopics.createdAt,
      updatedAt: forumTopics.updatedAt,
      lastPostAt: sql<Date | null>`(select max(${forumPosts.createdAt}) from ${forumPosts} where ${forumPosts.topicId} = ${forumTopics.id})`,
      replyCount: sql<number>`(select count(*)::int from ${forumPosts} where ${forumPosts.topicId} = ${forumTopics.id} and ${forumPosts.deletedAt} is null)`,
    })
    .from(forumTopics)
    .where(eq(forumTopics.forumId, forumId))
    .limit(200);

  return { forum, topics: sortForumTopics(topics) };
}

export async function createForumTopic(input: {
  organizationId: string;
  forumId: string;
  authorId: string;
  authorRole: string;
  title: string;
  body: string;
}) {
  const db = getDb();
  const [forum] = await db
    .select()
    .from(forums)
    .where(and(eq(forums.id, input.forumId), eq(forums.organizationId, input.organizationId)))
    .limit(1);
  if (!forum) throw new NotFoundError('Forum not found');
  if (!canPostToForum(forum, { organizationId: input.organizationId, role: input.authorRole })) {
    throw new ForbiddenError('Forum is locked');
  }
  const moderation = moderate(input.body);
  if (moderation.status === 'blocked') throw new ConflictError('Post rejected');

  const [topic] = await db
    .insert(forumTopics)
    .values({
      forumId: input.forumId,
      authorId: input.authorId,
      title: input.title,
      body: input.body,
      status: moderation.status === 'flagged' ? 'removed' : 'open',
    })
    .returning();
  return topic!;
}

export async function getForumTopic(organizationId: string, topicId: string) {
  const db = getDb();
  const [row] = await db
    .select({ topic: forumTopics, forum: forums })
    .from(forumTopics)
    .innerJoin(forums, eq(forums.id, forumTopics.forumId))
    .where(and(eq(forumTopics.id, topicId), eq(forums.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new NotFoundError('Topic not found');
  const posts = await db
    .select({
      id: forumPosts.id,
      topicId: forumPosts.topicId,
      authorId: forumPosts.authorId,
      body: forumPosts.body,
      parentPostId: forumPosts.parentPostId,
      isAcceptedAnswer: forumPosts.isAcceptedAnswer,
      moderationStatus: forumPosts.moderationStatus,
      createdAt: forumPosts.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(forumPosts)
    .leftJoin(users, eq(users.id, forumPosts.authorId))
    .where(
      and(
        eq(forumPosts.topicId, topicId),
        isNull(forumPosts.deletedAt),
        sql`${forumPosts.moderationStatus} <> 'removed'`,
      ),
    )
    .orderBy(asc(forumPosts.createdAt));
  return { ...row, posts };
}

export async function createForumPost(input: {
  organizationId: string;
  topicId: string;
  authorId: string;
  authorRole: string;
  body: string;
  parentPostId?: string;
}) {
  const db = getDb();
  const { topic, forum } = await getForumTopic(input.organizationId, input.topicId);
  if (!canPostToForum({ ...topic, organizationId: forum.organizationId }, { organizationId: input.organizationId, role: input.authorRole })) {
    throw new ForbiddenError('Topic is locked');
  }
  if (forum.isLocked) throw new ForbiddenError('Forum is locked');
  const moderation = moderate(input.body);
  if (moderation.status === 'blocked') throw new ConflictError('Post rejected');

  const [post] = await db
    .insert(forumPosts)
    .values({
      topicId: input.topicId,
      authorId: input.authorId,
      body: input.body,
      parentPostId: input.parentPostId,
      moderationStatus: moderation.status === 'flagged' ? 'hidden' : 'visible',
    })
    .returning();
  return post!;
}

export async function moderateForumPost(
  organizationId: string,
  postId: string,
  action: 'hide' | 'remove' | 'restore' | 'accept_answer',
) {
  const db = getDb();
  const [post] = await db
    .select({ id: forumPosts.id, topicId: forumPosts.topicId })
    .from(forumPosts)
    .innerJoin(forumTopics, eq(forumTopics.id, forumPosts.topicId))
    .innerJoin(forums, eq(forums.id, forumTopics.forumId))
    .where(and(eq(forumPosts.id, postId), eq(forums.organizationId, organizationId)))
    .limit(1);
  if (!post) throw new NotFoundError('Post not found');

  if (action === 'accept_answer') {
    await db
      .update(forumPosts)
      .set({ isAcceptedAnswer: false })
      .where(eq(forumPosts.topicId, post.topicId));
    const [row] = await db
      .update(forumPosts)
      .set({ isAcceptedAnswer: true })
      .where(eq(forumPosts.id, postId))
      .returning();
    return row!;
  }

  const [row] = await db
    .update(forumPosts)
    .set({
      moderationStatus: action === 'remove' ? 'removed' : action === 'hide' ? 'hidden' : 'visible',
      deletedAt: action === 'remove' ? new Date() : null,
    })
    .where(eq(forumPosts.id, postId))
    .returning();
  return row!;
}

export async function setTopicFlags(
  organizationId: string,
  topicId: string,
  flags: { isPinned?: boolean; isLocked?: boolean; status?: string },
) {
  const db = getDb();
  const [row] = await db
    .update(forumTopics)
    .set({ ...flags, updatedAt: new Date() })
    .where(
      and(
        eq(forumTopics.id, topicId),
        inArray(
          forumTopics.forumId,
          db.select({ id: forums.id }).from(forums).where(eq(forums.organizationId, organizationId)),
        ),
      ),
    )
    .returning();
  return row ?? null;
}
