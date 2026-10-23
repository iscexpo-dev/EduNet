import { describe, expect, it } from 'vitest';
import {
  canAccessConversation,
  canPostToForum,
  canStartDirectConversation,
  containsBannedTerm,
  countLinks,
  isBlocked,
  moderateMessage,
  sortForumTopics,
  unreadCount,
} from './logic';

const at = (iso: string) => new Date(iso);

describe('moderation', () => {
  it('allows normal messages', () => {
    expect(moderateMessage('Please review chapter 3 before class.')).toEqual({
      status: 'allowed',
      reasons: [],
    });
  });

  it('blocks empty and banned messages', () => {
    expect(moderateMessage('   ').status).toBe('blocked');
    expect(moderateMessage('you are an idiot', { bannedTerms: ['idiot'] })).toEqual({
      status: 'blocked',
      reasons: ['banned_term'],
    });
  });

  it('matches whole words only', () => {
    expect(containsBannedTerm('the class starts now', ['ass'])).toBeNull();
    expect(containsBannedTerm('what an ass', ['ass'])).toBe('ass');
  });

  it('normalises simple leetspeak', () => {
    expect(containsBannedTerm('you 1d10t', ['idiot'])).toBe('idiot');
  });

  it('flags long, link-heavy and repetitive messages', () => {
    expect(moderateMessage('a'.repeat(6000)).status).toBe('flagged');
    expect(moderateMessage('https://a.com https://b.com https://c.com https://d.com').reasons).toContain(
      'too_many_links',
    );
    expect(moderateMessage('hellooooooooooo').reasons).toContain('spam_repetition');
  });

  it('counts links', () => {
    expect(countLinks('see https://a.com and http://b.org')).toBe(2);
  });
});

describe('conversation access', () => {
  const conversation = {
    organizationId: 'org-1',
    type: 'direct',
    createdBy: 'u1',
  };
  const member = { userId: 'u1', organizationId: 'org-1', role: 'student' };

  it('requires the same tenant and membership', () => {
    expect(canAccessConversation(member, conversation, ['u1', 'u2'])).toEqual({ ok: true });
    expect(canAccessConversation({ ...member, organizationId: 'org-2' }, conversation, ['u1'])).toEqual({
      ok: false,
      code: 'cross_tenant',
    });
    expect(canAccessConversation({ ...member, userId: 'u3' }, conversation, ['u1'])).toEqual({
      ok: false,
      code: 'not_a_member',
    });
  });

  it('restricts archived conversations', () => {
    expect(
      canAccessConversation(member, { ...conversation, isArchived: true }, ['u1']),
    ).toEqual({ ok: false, code: 'archived' });
  });

  it('limits support conversations to participants and support staff', () => {
    const support = { ...conversation, type: 'support' };
    expect(
      canAccessConversation({ ...member, userId: 'u9' }, support, ['u1']),
    ).toEqual({ ok: false, code: 'support_only' });
    expect(
      canAccessConversation({ ...member, userId: 'agent', role: 'support_agent' }, support, ['u1']),
    ).toEqual({ ok: false, code: 'not_a_member' });
  });
});

describe('contact rules', () => {
  it('restricts student-initiated direct messages to known staff', () => {
    expect(canStartDirectConversation('student', 'teacher', ['t1'], 't1')).toBe(true);
    expect(canStartDirectConversation('student', 'teacher', ['t1'], 't2')).toBe(false);
    expect(canStartDirectConversation('student', 'student', ['s2'], 's2')).toBe(false);
    expect(canStartDirectConversation('teacher', 'student', [], 's2')).toBe(true);
  });

  it('detects blocks in either direction', () => {
    const blocks = [{ blockerId: 'u2', blockedId: 'u1' }];
    expect(isBlocked('u1', 'u2', blocks)).toBe(true);
    expect(isBlocked('u2', 'u1', blocks)).toBe(true);
    expect(isBlocked('u1', 'u3', blocks)).toBe(false);
  });
});

describe('read state', () => {
  const messages = [
    { id: 'm1', createdAt: at('2026-01-01T10:00:00Z'), senderId: 'u2' },
    { id: 'm2', createdAt: at('2026-01-01T10:05:00Z'), senderId: 'u1' },
    { id: 'm3', createdAt: at('2026-01-01T10:10:00Z'), senderId: 'u2' },
  ];

  it('counts all inbound messages when never read', () => {
    expect(unreadCount(messages, null, 'u1')).toBe(2);
  });

  it('counts only newer inbound messages', () => {
    expect(unreadCount(messages, at('2026-01-01T10:07:00Z'), 'u1')).toBe(1);
    expect(unreadCount(messages, at('2026-01-01T10:11:00Z'), 'u1')).toBe(0);
  });
});

describe('forum ordering', () => {
  it('puts pinned topics first then newest activity', () => {
    const topics = [
      { id: 'a', isPinned: false, lastPostAt: at('2026-01-02T00:00:00Z'), createdAt: at('2026-01-01T00:00:00Z') },
      { id: 'b', isPinned: true, lastPostAt: null, createdAt: at('2025-01-01T00:00:00Z') },
      { id: 'c', isPinned: false, lastPostAt: null, createdAt: at('2026-01-03T00:00:00Z') },
    ];
    expect(sortForumTopics(topics).map((topic) => topic.id)).toEqual(['b', 'c', 'a']);
  });

  it('locks posting for students but allows staff', () => {
    const topic = { isLocked: true, organizationId: 'org-1' };
    expect(canPostToForum(topic, { organizationId: 'org-1', role: 'student' })).toBe(false);
    expect(canPostToForum(topic, { organizationId: 'org-1', role: 'teacher' })).toBe(true);
    expect(canPostToForum(topic, { organizationId: 'org-2', role: 'teacher' })).toBe(false);
  });
});
