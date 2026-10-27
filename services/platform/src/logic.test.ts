import { describe, expect, it } from 'vitest';
import {
  activeTerm,
  appendAuditEvent,
  calculateWeightedGrade,
  canAccessAttendanceClass,
  canTransitionDataRequest,
  computeAuditHash,
  dataRequestDueAt,
  evaluateFeatureFlag,
  hasActiveConsent,
  isAttendanceAtRisk,
  isDataRequestOverdue,
  isValidAcademicYear,
  letterGrade,
  mergeSettings,
  missingConsents,
  resolveAttendanceStudentScope,
  resolveAttendanceViewer,
  summariseAttendance,
  termWithinYear,
  verifyAuditChain,
} from './logic';

const at = (iso: string) => new Date(iso);

describe('attendance', () => {
  const records = [
    { studentId: 's1', status: 'present' as const },
    { studentId: 's1', status: 'absent' as const },
    { studentId: 's1', status: 'late' as const },
    { studentId: 's1', status: 'excused' as const },
    { studentId: 's2', status: 'present' as const },
    { studentId: 's2', status: 'present' as const },
  ];

  it('summarises per student and counts excused/late as attending', () => {
    const summaries = summariseAttendance(records);
    expect(summaries.find((s) => s.studentId === 's1')).toMatchObject({
      present: 1,
      absent: 1,
      late: 1,
      excused: 1,
      total: 4,
      rate: 75,
    });
    expect(summaries.find((s) => s.studentId === 's2')?.rate).toBe(100);
  });

  it('flags at-risk students below threshold', () => {
    const s1 = summariseAttendance(records).find((s) => s.studentId === 's1')!;
    expect(isAttendanceAtRisk(s1, 80)).toBe(true);
    expect(isAttendanceAtRisk(s1, 75)).toBe(false);
  });

  it('handles no records', () => {
    expect(summariseAttendance([])).toEqual([]);
  });
});

describe('attendance access scope', () => {
  const STUDENT = 'student-1';
  const OTHER_STUDENT = 'student-2';
  const PARENT = 'parent-1';

  it('maps roles to attendance viewers', () => {
    expect(resolveAttendanceViewer('admin')).toBe('admin');
    expect(resolveAttendanceViewer('school_admin')).toBe('admin');
    expect(resolveAttendanceViewer('teacher')).toBe('teacher');
    expect(resolveAttendanceViewer('student')).toBe('student');
    expect(resolveAttendanceViewer('parent')).toBe('parent');
    expect(resolveAttendanceViewer('tutor')).toBe('denied');
    expect(resolveAttendanceViewer('mentor')).toBe('denied');
    expect(resolveAttendanceViewer(undefined)).toBe('denied');
  });

  it('limits students to their own records', () => {
    expect(
      resolveAttendanceStudentScope('student', STUDENT, [], STUDENT),
    ).toEqual({ allowed: true, studentIds: [STUDENT] });
    expect(
      resolveAttendanceStudentScope('student', STUDENT, [], OTHER_STUDENT),
    ).toEqual({ allowed: false });
    expect(
      resolveAttendanceStudentScope('student', undefined, [], undefined),
    ).toEqual({ allowed: false });
  });

  it('limits parents to linked children with attendance permission', () => {
    expect(
      resolveAttendanceStudentScope('parent', PARENT, [STUDENT], STUDENT),
    ).toEqual({ allowed: true, studentIds: [STUDENT] });
    expect(
      resolveAttendanceStudentScope('parent', PARENT, [STUDENT], OTHER_STUDENT),
    ).toEqual({ allowed: false });
    expect(
      resolveAttendanceStudentScope('parent', PARENT, [STUDENT], undefined),
    ).toEqual({ allowed: true, studentIds: [STUDENT] });
    expect(
      resolveAttendanceStudentScope('parent', PARENT, [], undefined),
    ).toEqual({ allowed: true, studentIds: [] });
  });

  it('leaves teachers and admins unrestricted by student', () => {
    expect(resolveAttendanceStudentScope('teacher', 't1', [], OTHER_STUDENT)).toEqual({
      allowed: true,
      studentIds: null,
    });
    expect(resolveAttendanceStudentScope('admin', 'a1', [], undefined)).toEqual({
      allowed: true,
      studentIds: null,
    });
  });

  it('restricts teachers to their homeroom or taught classes', () => {
    expect(canAccessAttendanceClass('teacher', 'class-1', ['class-1'])).toBe(true);
    expect(canAccessAttendanceClass('teacher', 'class-2', ['class-1'])).toBe(false);
    expect(canAccessAttendanceClass('admin', 'class-2', [])).toBe(true);
    expect(canAccessAttendanceClass('student', 'class-1', ['class-1'])).toBe(false);
    expect(canAccessAttendanceClass('denied', 'class-1', ['class-1'])).toBe(false);
  });
});

describe('grading', () => {
  it('computes weighted percentages', () => {
    expect(
      calculateWeightedGrade([
        { score: 8, maxScore: 10, weight: 1 },
        { score: 20, maxScore: 20, weight: 1 },
      ]),
    ).toBe(90);
  });

  it('renormalises when categories are missing', () => {
    expect(calculateWeightedGrade([{ score: 5, maxScore: 10, weight: 3 }])).toBe(50);
    expect(calculateWeightedGrade([])).toBe(0);
  });

  it('caps scores at max and ignores zero-weight items', () => {
    expect(
      calculateWeightedGrade([
        { score: 50, maxScore: 10, weight: 1 },
        { score: 0, maxScore: 10, weight: 0 },
      ]),
    ).toBe(100);
  });

  it('maps letter grades and pass mark', () => {
    expect(letterGrade(95)).toBe('A+');
    expect(letterGrade(85)).toBe('A');
    expect(letterGrade(72)).toBe('B');
    expect(letterGrade(61)).toBe('C');
    expect(letterGrade(50)).toBe('D');
    expect(letterGrade(49)).toBe('F');
  });
});

describe('academic calendar', () => {
  const year = { startsOn: at('2026-01-01T00:00:00Z'), endsOn: at('2026-12-31T00:00:00Z') };
  const terms = [
    { name: 'spring', startsOn: at('2026-01-01T00:00:00Z'), endsOn: at('2026-04-30T00:00:00Z') },
    { name: 'autumn', startsOn: at('2026-08-01T00:00:00Z'), endsOn: at('2026-12-15T00:00:00Z') },
  ];

  it('validates years and term containment', () => {
    expect(isValidAcademicYear(year)).toBe(true);
    expect(isValidAcademicYear({ startsOn: year.endsOn, endsOn: year.startsOn })).toBe(false);
    expect(termWithinYear(terms[0]!, year)).toBe(true);
    expect(
      termWithinYear({ startsOn: at('2025-12-01T00:00:00Z'), endsOn: at('2026-02-01T00:00:00Z') }, year),
    ).toBe(false);
  });

  it('finds the active term', () => {
    expect(activeTerm(terms, at('2026-09-01T00:00:00Z'))?.name).toBe('autumn');
    expect(activeTerm(terms, at('2026-06-01T00:00:00Z'))).toBeNull();
  });
});

describe('feature flags', () => {
  const flag = {
    key: 'ai-tutor',
    isEnabled: true,
    rolloutPercentage: 50,
    enabledOrganizationIds: null,
    enabledUserIds: null,
  };

  it('is off when disabled or out of rollout', () => {
    expect(evaluateFeatureFlag({ ...flag, isEnabled: false }, { organizationId: 'o1', userId: 'u1' })).toBe(false);
    expect(evaluateFeatureFlag({ ...flag, rolloutPercentage: 0 }, { organizationId: 'o1', userId: 'u1' })).toBe(false);
  });

  it('is deterministic per user', () => {
    const first = evaluateFeatureFlag(flag, { organizationId: 'o1', userId: 'u1' });
    for (let index = 0; index < 5; index += 1) {
      expect(evaluateFeatureFlag(flag, { organizationId: 'o1', userId: 'u1' })).toBe(first);
    }
  });

  it('honours explicit org and user targeting', () => {
    expect(
      evaluateFeatureFlag({ ...flag, enabledOrganizationIds: ['o1'] }, { organizationId: 'o2' }),
    ).toBe(false);
    expect(
      evaluateFeatureFlag({ ...flag, enabledUserIds: ['u9'] }, { organizationId: 'o1', userId: 'u1' }),
    ).toBe(false);
    expect(
      evaluateFeatureFlag({ ...flag, enabledUserIds: ['u1'] }, { organizationId: 'o1', userId: 'u1' }),
    ).toBe(true);
  });

  it('treats full rollout as always on', () => {
    expect(evaluateFeatureFlag({ ...flag, rolloutPercentage: 100 }, { organizationId: 'o1' })).toBe(true);
  });
});

describe('settings', () => {
  it('merges overrides without mutating defaults', () => {
    const defaults = { theme: 'light', locale: 'en', flags: { ai: false } };
    const merged = mergeSettings(defaults, { locale: 'bn' });
    expect(merged).toEqual({ theme: 'light', locale: 'bn', flags: { ai: false } });
    expect(defaults.locale).toBe('en');
  });
});

describe('privacy requests', () => {
  it('enforces the request lifecycle', () => {
    expect(canTransitionDataRequest('received', 'verifying')).toBe(true);
    expect(canTransitionDataRequest('verifying', 'completed')).toBe(false);
    expect(canTransitionDataRequest('processing', 'completed')).toBe(true);
    expect(canTransitionDataRequest('completed', 'processing')).toBe(false);
  });

  it('calculates deadlines and overdue state', () => {
    const due = dataRequestDueAt(at('2026-01-01T00:00:00Z'));
    expect(due.toISOString()).toBe('2026-01-31T00:00:00.000Z');
    expect(isDataRequestOverdue({ dueAt: due, status: 'processing' }, at('2026-02-01T00:00:00Z'))).toBe(true);
    expect(isDataRequestOverdue({ dueAt: due, status: 'completed' }, at('2026-02-01T00:00:00Z'))).toBe(false);
  });

  it('checks consent expiry and withdrawal', () => {
    const now = at('2026-01-15T00:00:00Z');
    expect(hasActiveConsent([{ purpose: 'ai', granted: true }], 'ai', now)).toBe(true);
    expect(hasActiveConsent([{ purpose: 'ai', granted: false }], 'ai', now)).toBe(false);
    expect(
      hasActiveConsent([{ purpose: 'ai', granted: true, expiresAt: at('2026-01-01T00:00:00Z') }], 'ai', now),
    ).toBe(false);
    expect(
      hasActiveConsent([{ purpose: 'ai', granted: true, withdrawnAt: at('2026-01-02T00:00:00Z') }], 'ai', now),
    ).toBe(false);
    expect(
      missingConsents([{ purpose: 'ai', granted: true }], ['ai', 'analytics'], now),
    ).toEqual(['analytics']);
  });
});

describe('audit hash chain', () => {
  const base = {
    organizationId: 'org-1',
    actorId: 'user-1',
    action: 'course.publish',
    resourceType: 'course',
    resourceId: 'course-1',
    createdAt: at('2026-01-01T00:00:00Z'),
  };

  it('links events and verifies the chain', () => {
    const first = appendAuditEvent(null, base);
    const second = appendAuditEvent(first, { ...base, action: 'course.archive', createdAt: at('2026-01-01T01:00:00Z') });
    expect(first.previousHash).toBeNull();
    expect(second.previousHash).toBe(first.hash);
    expect(verifyAuditChain([first, second])).toEqual({ valid: true, brokenAt: null });
  });

  it('detects tampering', () => {
    const first = appendAuditEvent(null, base);
    const second = appendAuditEvent(first, { ...base, action: 'course.archive' });
    const tampered = { ...second, action: 'course.delete' };
    expect(verifyAuditChain([first, tampered])).toEqual({ valid: false, brokenAt: 1 });
    expect(verifyAuditChain([{ ...first, hash: 'bad' }])).toEqual({ valid: false, brokenAt: 0 });
  });

  it('is order-insensitive for metadata keys', () => {
    const a = computeAuditHash({ ...base, metadata: { a: 1, b: 2 } }, null);
    const b = computeAuditHash({ ...base, metadata: { b: 2, a: 1 } }, null);
    expect(a).toBe(b);
  });

  it('changes when the previous hash changes', () => {
    expect(computeAuditHash(base, null)).not.toBe(computeAuditHash(base, 'prev'));
  });
});
