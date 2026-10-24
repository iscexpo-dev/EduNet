import { Request, Response } from 'express';
import { z } from 'zod';
import { hasPermission } from '@edunet/rbac';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  addFeedback,
  archiveConversation,
  closeDb,
  createConversation,
  getConversation,
  getPromptTemplate,
  getUsageToday,
  hasAiConsent,
  listConversations,
  listMessages,
  listPromptTemplates,
  recordAuditEvent,
  recordUsage,
  saveMessage,
  updateConversationTitle,
  upsertPromptTemplate,
} from './db';
import {
  assessSafety,
  buildPrompt,
  checkQuota,
  crisisResponse,
  estimateTokens,
  formatCitations,
  modelFallbackChain,
  selectModel,
  type ContextChunk,
  type ModelCandidate,
  type PromptMessage,
} from './logic';
import { ProviderUnavailableError, generateWithFallback } from './provider';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    organizationId?: string;
  };
}

const DEFAULT_SYSTEM_PROMPT =
  'You are EduNet, a patient tutor for school students. Explain concepts step by step, use short paragraphs, and ask a checking question at the end.';

const DAILY_TOKEN_LIMIT = Number(process.env.AI_DAILY_TOKEN_LIMIT) || 50_000;
const DEFAULT_MAX_OUTPUT = Number(process.env.AI_MAX_OUTPUT_TOKENS) || 1_024;
const CONSENT_REQUIRED =
  process.env.AI_REQUIRE_CONSENT === 'true' ||
  (process.env.NODE_ENV === 'production' && process.env.AI_REQUIRE_CONSENT !== 'false');

function modelCandidates(): ModelCandidate[] {
  const primary = process.env.AI_MODEL || 'gpt-4o-mini';
  const fallback = process.env.AI_FALLBACK_MODEL;
  const candidates: ModelCandidate[] = [
    { model: primary, priority: 10, maxTokens: Number(process.env.AI_MODEL_MAX_TOKENS) || 8_192 },
  ];
  if (fallback && fallback !== primary) {
    candidates.push({
      model: fallback,
      priority: 1,
      maxTokens: Number(process.env.AI_FALLBACK_MAX_TOKENS) || 4_096,
    });
  }
  return modelFallbackChain(candidates);
}

function fail(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: 'Invalid request', details: error.flatten() });
  }
  if (error instanceof NotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof ForbiddenError) return res.status(403).json({ error: error.message });
  if (error instanceof ConflictError) return res.status(409).json({ error: error.message });
  if (error instanceof ProviderUnavailableError) {
    return res.status(503).json({ error: 'AI is temporarily unavailable' });
  }
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

function safeTitle(message: string): string {
  const singleLine = message.replace(/\s+/g, ' ').trim();
  return singleLine.length > 80 ? `${singleLine.slice(0, 79)}…` : singleLine || 'New conversation';
}

const contextChunkSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(20_000),
});

const messageSchema = z.object({
  message: z.string().min(1).max(8_000),
  context: z.array(contextChunkSchema).max(20).optional(),
  templateKey: z.string().min(1).max(80).optional(),
  maxTokens: z.number().int().min(64).max(4_096).optional(),
});

const conversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

const feedbackSchema = z.object({
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: z.string().max(2_000).optional(),
});

async function auditSafely(input: Parameters<typeof recordAuditEvent>[0]): Promise<void> {
  try {
    await recordAuditEvent(input);
  } catch {
    // Auditing must never turn a successful answer into a failed request.
  }
}

async function usageSafely(input: Parameters<typeof recordUsage>[0]): Promise<void> {
  try {
    await recordUsage(input);
  } catch {
    // Metering is best-effort; the answer has already been generated.
  }
}

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
    const input = conversationSchema.parse(req.body ?? {});
    const conversation = await createConversation({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
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
    const conversation = await getConversation(
      ctx.organizationId,
      ctx.user.id,
      req.params.id!,
    );
    const messages = await listMessages(ctx.organizationId, ctx.user.id, conversation.id);
    return res.json({ ...conversation, messages });
  } catch (error) {
    return fail(res, error);
  }
}

export async function listMessagesHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(200).optional() })
      .parse(req.query);
    return res.json(
      await listMessages(ctx.organizationId, ctx.user.id, req.params.id!, limit ?? 50),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function archiveConversationHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    return res.json(
      await archiveConversation(ctx.organizationId, ctx.user.id, req.params.id!),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function sendMessageHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!hasPermission(ctx.user.role, 'ai:use')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const input = messageSchema.parse(req.body);
    const conversation = await getConversation(
      ctx.organizationId,
      ctx.user.id,
      req.params.id!,
    );

    if (CONSENT_REQUIRED && !(await hasAiConsent(ctx.organizationId, ctx.user.id))) {
      return res.status(403).json({
        error: 'AI processing consent required',
        code: 'ai_consent_required',
      });
    }

    const safety = assessSafety(input.message, { redactPii: true });
    const safetyFlags = {
      categories: safety.categories,
      requiresHuman: safety.requiresHuman,
    };

    if (!safety.allowed) {
      await saveMessage({
        conversationId: conversation.id,
        role: 'user',
        content: input.message,
        safetyFlags,
      });

      const isCrisis = safety.categories.includes('crisis');
      const crisis = isCrisis ? crisisResponse(process.env.AI_COUNSELOR_URL) : null;
      const content = crisis
        ? crisis.message
        : 'I cannot help with that request. If you are working on school material, ask me a specific study question and I will guide you.';

      const assistant = await saveMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content,
        safetyFlags,
      });

      await auditSafely({
        organizationId: ctx.organizationId,
        userId: ctx.user.id,
        action: 'chat',
        input: input.message,
        output: content,
        blocked: true,
        reason: safety.categories.join(',') || 'safety',
      });

      return res.status(200).json({
        conversationId: conversation.id,
        blocked: true,
        categories: safety.categories,
        requiresHuman: safety.requiresHuman,
        message: assistant,
        actions: crisis?.actions ?? [],
      });
    }

    const [historyRows, usage] = await Promise.all([
      listMessages(ctx.organizationId, ctx.user.id, conversation.id, 20),
      getUsageToday(ctx.organizationId),
    ]);

    const template = input.templateKey
      ? await getPromptTemplate(ctx.organizationId, input.templateKey)
      : null;
    const systemPrompt = template?.systemPrompt ?? process.env.AI_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT;

    const history: PromptMessage[] = historyRows
      .filter((row) => row.role === 'user' || row.role === 'assistant')
      .map((row) => ({ role: row.role as 'user' | 'assistant', content: row.content }));

    const contextChunks: ContextChunk[] = input.context ?? [];
    const requestedTokens = input.maxTokens ?? DEFAULT_MAX_OUTPUT;
    const prompt = buildPrompt({
      systemPrompt,
      context: contextChunks,
      history,
      message: safety.redacted,
      maxContextCharacters: 6_000,
      maxHistoryMessages: 12,
    });

    const estimatedInput = prompt.reduce(
      (total, item) => total + estimateTokens(item.content),
      0,
    );
    const quota = checkQuota({
      usedTokensToday: usage.tokensIn + usage.tokensOut,
      dailyTokenLimit: DAILY_TOKEN_LIMIT,
      requestedTokens: estimatedInput + requestedTokens,
    });
    if (!quota.allowed) {
      return res.status(429).json({
        error: 'Daily AI quota exceeded',
        code: 'ai_quota_exceeded',
        remaining: quota.remaining,
      });
    }

    const selected = selectModel(modelCandidates(), { requestedTokens });
    if (!selected) {
      return res.status(503).json({ error: 'No AI model is configured for this request' });
    }

    const userMessage = await saveMessage({
      conversationId: conversation.id,
      role: 'user',
      content: input.message,
      tokensIn: estimatedInput,
      safetyFlags,
    });

    const startedAt = Date.now();
    let completion;
    try {
      completion = await generateWithFallback({
        messages: prompt,
        models: [{ model: selected.model, maxTokens: selected.maxTokens }],
        requestedTokens,
      });
    } catch (error) {
      await auditSafely({
        organizationId: ctx.organizationId,
        userId: ctx.user.id,
        action: 'chat',
        model: selected.model,
        input: input.message,
        blocked: true,
        reason: 'provider_unavailable',
        latencyMs: Date.now() - startedAt,
      });
      return fail(res, error);
    }

    const assistant = await saveMessage({
      conversationId: conversation.id,
      role: 'assistant',
      content: completion.content,
      model: completion.model,
      tokensIn: completion.tokensIn,
      tokensOut: completion.tokensOut,
    });

    if (!conversation.title || conversation.title === 'New conversation') {
      await updateConversationTitle(
        ctx.organizationId,
        ctx.user.id,
        conversation.id,
        safeTitle(input.message),
      );
    }

    await usageSafely({
      organizationId: ctx.organizationId,
      model: completion.model,
      tokensIn: completion.tokensIn,
      tokensOut: completion.tokensOut,
      costMicros:
        completion.tokensIn * (Number(process.env.AI_COST_IN_MICROS_PER_TOKEN) || 1) +
        completion.tokensOut * (Number(process.env.AI_COST_OUT_MICROS_PER_TOKEN) || 3),
    });

    await auditSafely({
      organizationId: ctx.organizationId,
      userId: ctx.user.id,
      action: 'chat',
      model: completion.model,
      input: input.message,
      output: completion.content,
      latencyMs: Date.now() - startedAt,
    });

    return res.status(201).json({
      conversationId: conversation.id,
      blocked: false,
      categories: safety.categories,
      requiresHuman: safety.requiresHuman,
      userMessage,
      message: assistant,
      citations: formatCitations(contextChunks),
    });
  } catch (error) {
    return fail(res, error);
  }
}

export async function feedbackHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    const input = feedbackSchema.parse(req.body);
    return res.status(201).json(
      await addFeedback(req.params.id!, ctx.user.id, input.rating, input.comment),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export async function usageHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!hasPermission(ctx.user.role, 'ai:admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const usage = await getUsageToday(ctx.organizationId);
    return res.json({
      ...usage,
      dailyTokenLimit: DAILY_TOKEN_LIMIT,
      remaining: Math.max(0, DAILY_TOKEN_LIMIT - usage.tokensIn - usage.tokensOut),
    });
  } catch (error) {
    return fail(res, error);
  }
}

export async function listPromptTemplatesHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!hasPermission(ctx.user.role, 'ai:admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.json(await listPromptTemplates(ctx.organizationId));
  } catch (error) {
    return fail(res, error);
  }
}

export async function upsertPromptTemplateHandler(req: AuthRequest, res: Response) {
  const ctx = context(req, res);
  if (!ctx) return;
  try {
    if (!hasPermission(ctx.user.role, 'ai:admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const input = z
      .object({
        key: z.string().min(1).max(80),
        name: z.string().min(1).max(120),
        systemPrompt: z.string().min(1).max(20_000),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    return res.status(201).json(
      await upsertPromptTemplate({
        organizationId: ctx.organizationId,
        ...input,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
}

export { closeDb };
