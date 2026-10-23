/**
 * AI safety, quota and prompt-assembly policy. The model provider is
 * replaceable; these rules are not. Everything here is pure so the safety
 * posture is testable without network access.
 */

export type SafetyCategory =
  | 'crisis'
  | 'prompt_injection'
  | 'pii'
  | 'abuse'
  | 'unsafe_request'
  | 'age_inappropriate';

export interface SafetyAssessment {
  allowed: boolean;
  categories: SafetyCategory[];
  requiresHuman: boolean;
  redacted: string;
  reason?: string;
}

const CRISIS_PATTERNS = [
  /kill myself/i,
  /want to die/i,
  /end my life/i,
  /self[- ]?harm/i,
  /suicid/i,
  /hurt myself/i,
];

const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) (instructions|prompts)/i,
  /disregard (the )?(system|developer) (prompt|message)/i,
  /reveal (your|the) (system|hidden) prompt/i,
  /you are now (dan|developer mode|unrestricted)/i,
  /print (the )?(api|secret|token|password)/i,
];

const ABUSE_PATTERNS = [
  /\b(fuck|shit|bitch|bastard)\b/i,
  /\b(kill|hurt|attack) (him|her|them|you)\b/i,
];

const UNSAFE_REQUEST_PATTERNS = [
  /how (do|can) i (make|build) (a )?(bomb|explosive|weapon)/i,
  /how to (hack|ddos|phish)/i,
  /bypass (the )?(exam|proctoring|security)/i,
  /write (my|the) (exam|assignment) for me/i,
];

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE = /(?:\+?\d[\s-]?){9,15}/g;
const EMAIL_TEST = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_TEST = /(?:\+?\d[\s-]?){9,15}/;

export function redactPii(text: string): string {
  return text.replace(EMAIL, '[email redacted]').replace(PHONE, (match) =>
    match.replace(/\d/g, '#'),
  );
}

export function assessSafety(
  text: string,
  options: { studentAge?: number; redactPii?: boolean } = {},
): SafetyAssessment {
  const categories: SafetyCategory[] = [];
  if (CRISIS_PATTERNS.some((pattern) => pattern.test(text))) categories.push('crisis');
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(text))) categories.push('prompt_injection');
  if (ABUSE_PATTERNS.some((pattern) => pattern.test(text))) categories.push('abuse');
  if (UNSAFE_REQUEST_PATTERNS.some((pattern) => pattern.test(text))) categories.push('unsafe_request');
  if (typeof options.studentAge === 'number' && options.studentAge < 13 && /\b(dating|sex|alcohol|vape)\b/i.test(text)) {
    categories.push('age_inappropriate');
  }
  if (EMAIL_TEST.test(text) || PHONE_TEST.test(text)) categories.push('pii');

  const blocked = categories.some((category) =>
    ['crisis', 'prompt_injection', 'unsafe_request', 'age_inappropriate'].includes(category),
  );

  return {
    allowed: !blocked,
    categories,
    requiresHuman: categories.includes('crisis') || categories.includes('abuse'),
    redacted: options.redactPii === false ? text : redactPii(text),
    reason: blocked ? `Blocked: ${categories.join(', ')}` : undefined,
  };
}

// ---------------------------------------------------------------------------
// Quotas
// ---------------------------------------------------------------------------

export interface QuotaInput {
  usedTokensToday: number;
  dailyTokenLimit: number;
  requestedTokens: number;
}

export type QuotaDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; remaining: number; reason: 'daily_limit' | 'invalid_request' };

export function checkQuota(input: QuotaInput): QuotaDecision {
  if (input.dailyTokenLimit <= 0 || input.requestedTokens <= 0) {
    return { allowed: false, remaining: 0, reason: 'invalid_request' };
  }
  const remaining = Math.max(0, input.dailyTokenLimit - input.usedTokensToday);
  if (input.requestedTokens > remaining) {
    return { allowed: false, remaining, reason: 'daily_limit' };
  }
  return { allowed: true, remaining: remaining - input.requestedTokens };
}

/** Rough token estimate used before the provider returns exact usage. */
export function estimateTokens(text: string): number {
  if (!text.trim()) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateCostCents(tokensIn: number, tokensOut: number, perMillionIn: number, perMillionOut: number): number {
  return Math.ceil(((tokensIn * perMillionIn + tokensOut * perMillionOut) / 1_000_000) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

export interface ContextChunk {
  id: string;
  title?: string;
  content: string;
}

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function truncateContext(
  chunks: readonly ContextChunk[],
  maxCharacters: number,
): ContextChunk[] {
  const result: ContextChunk[] = [];
  let used = 0;
  for (const chunk of chunks) {
    if (used >= maxCharacters) break;
    const remaining = maxCharacters - used;
    if (chunk.content.length <= remaining) {
      result.push(chunk);
      used += chunk.content.length;
    } else if (remaining > 20) {
      result.push({ ...chunk, content: `${chunk.content.slice(0, remaining - 1)}…` });
      used += remaining;
    }
  }
  return result;
}

export function buildPrompt(input: {
  systemPrompt: string;
  context?: readonly ContextChunk[];
  history?: readonly PromptMessage[];
  message: string;
  maxContextCharacters?: number;
  maxHistoryMessages?: number;
}): PromptMessage[] {
  const context = truncateContext(input.context ?? [], input.maxContextCharacters ?? 6000);
  const history = (input.history ?? []).slice(-(input.maxHistoryMessages ?? 12));

  const system = [
    input.systemPrompt.trim(),
    'Rules: be age-appropriate, cite provided context when used, never invent sources, never request personal data, and escalate safety concerns to a human.',
    context.length
      ? `Context:\n${context
          .map((chunk, index) => `[${index + 1}] ${chunk.title ?? chunk.id}\n${chunk.content}`)
          .join('\n\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return [{ role: 'system', content: system }, ...history, { role: 'user', content: input.message }];
}

export function formatCitations(chunks: readonly ContextChunk[]): string[] {
  return chunks.map((chunk, index) => `[${index + 1}] ${chunk.title ?? chunk.id}`);
}

// ---------------------------------------------------------------------------
// Model fallback
// ---------------------------------------------------------------------------

export interface ModelCandidate {
  model: string;
  priority: number;
  maxTokens: number;
}

/** Deterministic ordered fallback list, highest priority first. */
export function modelFallbackChain(candidates: readonly ModelCandidate[]): ModelCandidate[] {
  return [...candidates].sort((a, b) => b.priority - a.priority || a.model.localeCompare(b.model));
}

export function selectModel(
  candidates: readonly ModelCandidate[],
  options: { requestedTokens: number },
): ModelCandidate | null {
  return (
    modelFallbackChain(candidates).find((candidate) => candidate.maxTokens >= options.requestedTokens) ?? null
  );
}

// ---------------------------------------------------------------------------
// Crisis response
// ---------------------------------------------------------------------------

export const CRISIS_RESPONSE =
  'I am really sorry you are going through this. I am an AI and cannot keep you safe on my own. Please contact a trusted adult, your school counsellor, or local emergency services right now. If you are in immediate danger, call your local emergency number.';

export function crisisResponse(counselorUrl?: string): { message: string; actions: string[] } {
  return {
    message: CRISIS_RESPONSE,
    actions: [
      'Talk to a trusted adult or school counsellor',
      'Contact local emergency services if in immediate danger',
      ...(counselorUrl ? [`Book a counsellor: ${counselorUrl}`] : []),
    ],
  };
}
