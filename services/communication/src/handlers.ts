import { Request, Response } from 'express';
import { z } from 'zod';
import { hasPermission, isPrivilegedRole } from '@edunet/rbac';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  addParticipants,
  blockUser,
  closeDb,
  createConversation,
  createForum,
  createForumPost,
  createForumTopic,
  getConversation,
  getForumTopic,
  listBlockedUsers,
  listConversations,
  listForumTopics,
  listForums,
  listMessages,
  listModerationQueue,
  markConversationRead,
  moderateForumPost,
  reportMessage,
  resolveReport,
  sendMessage,
  setTopicFlags,
  unblockUser,
} from './db';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    organizationId?: string;
  };
}

function fail(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: 'Invalid request', details: error.flatten() });
  }
  if (error instanceof NotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof ForbiddenError) return res.status(403).json({ error: error.message });
  if (error instanceof ConflictError) return res.status(409).json({ error: error.message });
  throw error;
}

function context(req: AuthRequest, res: Response) {
  const organizationId = req.user?.organizationId;
  if (!organizationId || !req.user) {
    res.status(403).json({ error: 'Organization context required' });
    return null;
  }
  return { organizationId, user: req.user };
}

const conversationSchema = z.object({
  type: z.enum(['direct', 'group', 'support']),
  title: z.string().max(200).optional(),
  participantIds: z.array(z.string().uuid()).min(1).max(100),
});

const messageSchema = z.object({
  body: z.string().min(1).max(5000),
  attachmentIds: z.array(z.string().uuid()).max(10).optional(),
  replyToId: z.string().uuid().optional(),
});

export async function listConversationsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await listConversations(ctx.organizationId, ctx.user.id));
  } catch (error) {
    return fail(res, error);
  }
}

export async function createConversationHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = conversationSchema.parse(req.body);
    if (input.type === 'support' && !isPrivilegedRole(ctx.user.role)) {
      return res.status(403).json({ error: 'Support conversations are created by support staff' });
    }
    const conversation = await createConversation({
      organizationId: ctx.organizationId,
      createdBy: ctx.user.id,
      ...input,
    });
    return res.status(201).json(conversation);
  } catch (error) {
    return fail(res, error);
  }
}

export async function getConversationHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await getConversation(ctx.organizationId, ctx.user.id, req.params.id!));
  } catch (error) {
    return fail(res, error);
  }
}

export async function listMessagesHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const query = z
      .object({ before: z.coerce.date().optional(), limit: z.coerce.number().int().min(1).max(200).optional() })
      .parse(req.query);
    return res.json(
      await listMessages(ctx.organizationId, ctx.user.id, req.params.id!, query),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function sendMessageHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = messageSchema.parse(req.body);
    const result = await sendMessage({
      organizationId: ctx.organizationId,
      conversationId: req.params.id!,
      senderId: ctx.user.id,
      senderRole: ctx.user.role,
      ...input,
    });
    return res.status(result.moderation.status === 'flagged' ? 202 : 201).json(result);
  } catch (error) {
    return fail(res, error);
  }
}

export async function markReadHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(
      await markConversationRead(ctx.organizationId, ctx.user.id, req.params.id!),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function addParticipantsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const { userIds } = z
      .object({ userIds: z.array(z.string().uuid()).min(1).max(50) })
      .parse(req.body);
    return res.json(
      await addParticipants(ctx.organizationId, ctx.user.id, req.params.id!, userIds),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function reportMessageHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({
        reason: z.enum(['spam', 'harassment', 'inappropriate', 'other']),
        details: z.string().max(2000).optional(),
      })
      .parse(req.body);
    return res.status(201).json(
      await reportMessage(ctx.organizationId, ctx.user.id, req.params.id!, input.reason, input.details),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function moderationQueueHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!hasPermission(ctx.user.role, 'message:moderate')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { status } = z.object({ status: z.enum(['open', 'actioned', 'dismissed']).optional() }).parse(req.query);
    return res.json(await listModerationQueue(ctx.organizationId, status));
  } catch (error) {
    return fail(res, error);
  }
}

export async function resolveReportHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!hasPermission(ctx.user.role, 'message:moderate')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { action } = z
      .object({ action: z.enum(['hide', 'remove', 'dismiss']) })
      .parse(req.body);
    return res.json(
      await resolveReport(ctx.organizationId, ctx.user.id, req.params.id!, action),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function blockUserHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.body);
    const row = await blockUser(ctx.user.id, userId);
    return res.status(row ? 201 : 200).json(row ?? { blocked: true });
  } catch (error) {
    return fail(res, error);
  }
}

export async function unblockUserHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const row = await unblockUser(ctx.user.id, req.params.userId!);
    if (!row) return res.status(404).json({ error: 'Block not found' });
    return res.status(204).send();
  } catch (error) {
    return fail(res, error);
  }
}

export async function listBlockedUsersHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await listBlockedUsers(ctx.user.id));
  } catch (error) {
    return fail(res, error);
  }
}

export async function listForumsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const { courseId } = z.object({ courseId: z.string().uuid().optional() }).parse(req.query);
    return res.json(await listForums(ctx.organizationId, courseId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function createForumHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!hasPermission(ctx.user.role, 'content:write')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const input = z
      .object({
        courseId: z.string().uuid().optional(),
        title: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
      })
      .parse(req.body);
    return res.status(201).json(await createForum({ ...input, organizationId: ctx.organizationId }));
  } catch (error) {
    return fail(res, error);
  }
}

export async function listForumTopicsHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await listForumTopics(ctx.organizationId, req.params.id!));
  } catch (error) {
    return fail(res, error);
  }
}

export async function createForumTopicHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({ title: z.string().min(1).max(200), body: z.string().min(1).max(10000) })
      .parse(req.body);
    return res.status(201).json(
      await createForumTopic({
        organizationId: ctx.organizationId,
        forumId: req.params.id!,
        authorId: ctx.user.id,
        authorRole: ctx.user.role,
        ...input,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function getForumTopicHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(await getForumTopic(ctx.organizationId, req.params.id!));
  } catch (error) {
    return fail(res, error);
  }
}

export async function createForumPostHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = z
      .object({
        body: z.string().min(1).max(10000),
        parentPostId: z.string().uuid().optional(),
      })
      .parse(req.body);
    return res.status(201).json(
      await createForumPost({
        organizationId: ctx.organizationId,
        topicId: req.params.id!,
        authorId: ctx.user.id,
        authorRole: ctx.user.role,
        ...input,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function moderateForumPostHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!hasPermission(ctx.user.role, 'content:moderate')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { action } = z
      .object({ action: z.enum(['hide', 'remove', 'restore', 'accept_answer']) })
      .parse(req.body);
    return res.json(await moderateForumPost(ctx.organizationId, req.params.id!, action));
  } catch (error) {
    return fail(res, error);
  }
}

export async function updateTopicHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!hasPermission(ctx.user.role, 'content:moderate')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const input = z
      .object({
        isPinned: z.boolean().optional(),
        isLocked: z.boolean().optional(),
        status: z.enum(['open', 'resolved', 'removed']).optional(),
      })
      .parse(req.body);
    const row = await setTopicFlags(ctx.organizationId, req.params.id!, input);
    if (!row) return res.status(404).json({ error: 'Topic not found' });
    return res.json(row);
  } catch (error) {
    return fail(res, error);
  }
}

export { closeDb };
