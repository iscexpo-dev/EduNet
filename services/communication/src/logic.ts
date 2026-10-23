/**
 * Communication safety and access rules. Moderation is intentionally
 * deterministic and conservative: blocked messages are rejected, flagged
 * messages are stored for review, and student-to-teacher messaging can be
 * restricted by the caller.
 */

export type ModerationStatus = 'allowed' | 'flagged' | 'blocked';

export interface ModerationResult {
  status: ModerationStatus;
  reasons: string[];
}

export interface ModerationOptions {
  bannedTerms?: readonly string[];
  maxLinks?: number;
  maxLength?: number;
}

const DEFAULT_MAX_LENGTH = 5000;
const DEFAULT_MAX_LINKS = 3;

const URL_PATTERN = /https?:\/\/[^\s]+/gi;
const REPEATED_CHARACTERS = /(.)\1{9,}/;

/**
 * Word-boundary aware term matching, so "ass" does not match "class".
 * Terms are compared case-insensitively and normalised for simple leetspeak.
 */
export function containsBannedTerm(text: string, terms: readonly string[]): string | null {
  if (!terms.length) return null;
  const normalised = text
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's');

  for (const term of terms) {
    const cleaned = term.trim().toLowerCase();
    if (!cleaned) continue;
    const escaped = cleaned.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    if (pattern.test(normalised)) return term;
  }
  return null;
}

export function countLinks(text: string): number {
  return (text.match(URL_PATTERN) ?? []).length;
}

export function moderateMessage(text: string, options: ModerationOptions = {}): ModerationResult {
  const reasons: string[] = [];
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;

  if (!text.trim()) return { status: 'blocked', reasons: ['empty'] };
  if (text.length > maxLength) reasons.push('too_long');

  const banned = containsBannedTerm(text, options.bannedTerms ?? []);
  if (banned) reasons.push('banned_term');

  if (countLinks(text) > (options.maxLinks ?? DEFAULT_MAX_LINKS)) reasons.push('too_many_links');
  if (REPEATED_CHARACTERS.test(text)) reasons.push('spam_repetition');

  if (reasons.includes('banned_term')) return { status: 'blocked', reasons };
  if (reasons.length) return { status: 'flagged', reasons };
  return { status: 'allowed', reasons: [] };
}

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

export interface ConversationMember {
  userId: string;
  organizationId: string;
  role: string;
  lastReadAt?: Date | null;
}

export interface ConversationAccess {
  organizationId: string;
  type: string;
  createdBy: string | null;
  isArchived?: boolean;
}

export type AccessDecision =
  | { ok: true }
  | { ok: false; code: 'cross_tenant' | 'not_a_member' | 'archived' | 'support_only' };

export function canAccessConversation(
  member: ConversationMember,
  conversation: ConversationAccess,
  participantIds: readonly string[],
): AccessDecision {
  if (member.organizationId !== conversation.organizationId) {
    return { ok: false, code: 'cross_tenant' };
  }
  if (conversation.type === 'support') {
    const privileged = ['support_agent', 'admin', 'super_admin', 'school_admin'].includes(member.role);
    if (!privileged && !participantIds.includes(member.userId)) {
      return { ok: false, code: 'support_only' };
    }
  }
  if (!participantIds.includes(member.userId)) return { ok: false, code: 'not_a_member' };
  if (conversation.isArchived) return { ok: false, code: 'archived' };
  return { ok: true };
}

/**
 * Students may only start direct conversations with staff who teach them;
 * callers supply the allowed staff ids from the enrollment graph.
 */
export function canStartDirectConversation(
  senderRole: string,
  recipientRole: string,
  allowedStaffIds: readonly string[],
  recipientId: string,
): boolean {
  if (senderRole !== 'student') return true;
  const staffRoles = ['teacher', 'tutor', 'mentor', 'counselor', 'school_admin', 'support_agent'];
  if (!staffRoles.includes(recipientRole)) return false;
  return allowedStaffIds.includes(recipientId);
}

export function isBlocked(
  senderId: string,
  recipientId: string,
  blocks: readonly { blockerId: string; blockedId: string }[],
): boolean {
  return blocks.some(
    (block) =>
      (block.blockerId === recipientId && block.blockedId === senderId) ||
      (block.blockerId === senderId && block.blockedId === recipientId),
  );
}

// ---------------------------------------------------------------------------
// Read state
// ---------------------------------------------------------------------------

export interface MessageSummary {
  id: string;
  createdAt: Date;
  senderId: string;
}

export function unreadCount(messages: readonly MessageSummary[], lastReadAt: Date | null | undefined, userId: string): number {
  if (!lastReadAt) return messages.filter((message) => message.senderId !== userId).length;
  return messages.filter(
    (message) => message.senderId !== userId && message.createdAt.getTime() > lastReadAt.getTime(),
  ).length;
}

// ---------------------------------------------------------------------------
// Forum ordering
// ---------------------------------------------------------------------------

export interface ForumTopicSummary {
  id: string;
  isPinned: boolean;
  lastPostAt: Date | null;
  createdAt: Date;
}

/** Pinned topics first, then most recent activity. Stable by id. */
export function sortForumTopics<T extends ForumTopicSummary>(topics: readonly T[]): T[] {
  return [...topics].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const aTime = (a.lastPostAt ?? a.createdAt).getTime();
    const bTime = (b.lastPostAt ?? b.createdAt).getTime();
    if (aTime !== bTime) return bTime - aTime;
    return a.id.localeCompare(b.id);
  });
}

export function canPostToForum(
  topic: { isLocked: boolean; organizationId: string },
  member: { organizationId: string; role: string },
): boolean {
  if (topic.organizationId !== member.organizationId) return false;
  if (topic.isLocked) return ['teacher', 'admin', 'school_admin', 'content_moderator', 'super_admin'].includes(member.role);
  return true;
}
