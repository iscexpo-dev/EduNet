import type { PromptMessage } from './logic';

export interface ChatCompletionRequest {
  model: string;
  messages: PromptMessage[];
  maxTokens: number;
  temperature?: number;
}

export interface ChatCompletionResponse {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  finishReason: string;
}

export class ProviderUnavailableError extends Error {
  constructor(message = 'AI provider unavailable') {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

/**
 * OpenAI-compatible gateway call. Configuration is environment-driven so the
 * service can point at the Vercel AI gateway, Azure OpenAI, or a local model.
 * No provider secret is ever logged or returned to the client.
 */
export async function chatCompletion(
  request: ChatCompletionRequest,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ChatCompletionResponse> {
  const baseUrl = process.env.AI_GATEWAY_URL;
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!baseUrl || !apiKey) throw new ProviderUnavailableError('AI gateway is not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  const signal = options.signal ?? controller.signal;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        max_tokens: request.maxTokens,
        temperature: request.temperature ?? 0.3,
      }),
      signal,
    });

    if (!response.ok) {
      throw new ProviderUnavailableError(`AI provider returned ${response.status}`);
    }

    const payload = (await response.json()) as {
      model?: string;
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new ProviderUnavailableError('AI provider returned an empty response');

    return {
      content,
      model: payload.model ?? request.model,
      tokensIn: payload.usage?.prompt_tokens ?? 0,
      tokensOut: payload.usage?.completion_tokens ?? 0,
      finishReason: payload.choices?.[0]?.finish_reason ?? 'stop',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export interface GenerateOptions {
  messages: PromptMessage[];
  models: { model: string; maxTokens: number }[];
  requestedTokens: number;
  signal?: AbortSignal;
}

/**
 * Tries models in priority order. Provider errors and empty responses fall
 * through; the last error is surfaced so callers can return a clear 503.
 */
export async function generateWithFallback(options: GenerateOptions): Promise<ChatCompletionResponse> {
  const candidates = options.models.filter((candidate) => candidate.maxTokens >= options.requestedTokens);
  if (!candidates.length) throw new ProviderUnavailableError('No model can satisfy the token budget');

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await chatCompletion(
        {
          model: candidate.model,
          messages: options.messages,
          maxTokens: Math.min(candidate.maxTokens, options.requestedTokens),
        },
        { signal: options.signal },
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new ProviderUnavailableError();
}
