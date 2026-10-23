import { describe, expect, it } from 'vitest';
import {
  canTransitionTicket,
  classifyTicket,
  detectCrisis,
  escalatePriority,
  isSlaBreached,
  searchResources,
  slaDueAt,
} from './logic';

const at = (iso: string) => new Date(iso);

describe('SLA', () => {
  it('sets due dates per priority', () => {
    const created = at('2026-01-01T09:00:00Z');
    expect(slaDueAt(created, 'urgent').toISOString()).toBe('2026-01-01T10:00:00.000Z');
    expect(slaDueAt(created, 'low').toISOString()).toBe('2026-01-04T09:00:00.000Z');
  });

  it('detects breaches only while unresolved', () => {
    const ticket = { slaDueAt: at('2026-01-01T10:00:00Z'), status: 'open' as const };
    expect(isSlaBreached(ticket, at('2026-01-01T10:01:00Z'))).toBe(true);
    expect(isSlaBreached(ticket, at('2026-01-01T09:59:00Z'))).toBe(false);
    expect(isSlaBreached({ ...ticket, status: 'resolved' }, at('2026-01-02T00:00:00Z'))).toBe(false);
    expect(isSlaBreached({ slaDueAt: null, status: 'open' }, at('2026-01-02T00:00:00Z'))).toBe(false);
  });
});

describe('ticket workflow', () => {
  it('allows valid transitions only', () => {
    expect(canTransitionTicket('open', 'pending')).toBe(true);
    expect(canTransitionTicket('open', 'resolved')).toBe(true);
    expect(canTransitionTicket('resolved', 'closed')).toBe(true);
    expect(canTransitionTicket('closed', 'resolved')).toBe(false);
    expect(canTransitionTicket('pending', 'pending')).toBe(false);
  });

  it('escalates one step and caps at urgent', () => {
    expect(escalatePriority('normal', { breached: true })).toEqual({ priority: 'high', changed: true });
    expect(escalatePriority('urgent', { breached: true })).toEqual({ priority: 'urgent', changed: false });
    expect(escalatePriority('low', {})).toEqual({ priority: 'low', changed: false });
  });
});

describe('classification', () => {
  it('routes crisis language to urgent safety tickets', () => {
    const result = classifyTicket({ subject: 'I need help', description: 'I want to die' });
    expect(result.crisis).toBe(true);
    expect(result.priority).toBe('urgent');
    expect(result.category).toBe('general');
  });

  it('detects crisis terms case-insensitively', () => {
    expect(detectCrisis('I am thinking about SELF HARM').crisis).toBe(true);
    expect(detectCrisis('The class was fine').crisis).toBe(false);
  });

  it('classifies common categories and priorities', () => {
    expect(classifyTicket({ subject: 'Cannot login', description: 'password reset fails' }).category).toBe('account');
    expect(classifyTicket({ subject: 'Refund', description: 'billing issue' }).category).toBe('billing');
    expect(classifyTicket({ subject: 'Bug', description: 'app crash on lesson page' }).category).toBe('technical');
    expect(classifyTicket({ subject: 'Exam', description: 'grade is missing' }).category).toBe('academic');
    expect(classifyTicket({ subject: 'Help', description: 'this is urgent, deadline tomorrow' }).priority).toBe('high');
    expect(classifyTicket({ subject: 'Question', description: 'no rush at all' }).priority).toBe('low');
    expect(classifyTicket({ subject: 'Threat', description: 'a student is being bullied' }).priority).toBe('urgent');
  });
});

describe('resource search', () => {
  const resources = [
    { id: '1', slug: 'reset-password', title: 'Reset your password', category: 'account', body: 'Use the login page.', locale: 'en' },
    { id: '2', slug: 'offline', title: 'Using EduNet offline', category: 'technical', body: 'Lessons download when online.', locale: 'en' },
    { id: '3', slug: 'bn-password', title: 'পাসওয়ার্ড রিসেট', category: 'account', body: 'লগইন পাতা ব্যবহার করুন।', locale: 'bn' },
  ];

  it('ranks title matches above body matches', () => {
    expect(searchResources(resources, 'password', 'en').map((r) => r.id)).toEqual(['1']);
  });

  it('filters by locale and returns all for empty query', () => {
    expect(searchResources(resources, 'পাসওয়ার্ড', 'bn').map((r) => r.id)).toEqual(['3']);
    expect(searchResources(resources, '', 'en')).toHaveLength(2);
  });

  it('is stable for equal scores', () => {
    const tied = [
      { id: 'b', slug: 'b', title: 'Lesson help', category: 'x', body: '', locale: 'en' },
      { id: 'a', slug: 'a', title: 'Lesson guide', category: 'x', body: '', locale: 'en' },
    ];
    expect(searchResources(tied, 'lesson').map((r) => r.id)).toEqual(['a', 'b']);
  });
});
