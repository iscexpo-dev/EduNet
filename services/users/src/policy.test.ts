import { describe, it, expect } from 'vitest';
import { canReadUser, parsePagination, sanitizeProfileUpdate } from './policy';

describe('parsePagination', () => {
  it('defaults and clamps', () => {
    expect(parsePagination({})).toEqual({ limit: 50, offset: 0 });
    expect(parsePagination({ limit: '500', offset: '-2' })).toEqual({ limit: 200, offset: 0 });
    expect(parsePagination({ offset: 'nope' }).offset).toBe(0);
  });
});

describe('sanitizeProfileUpdate', () => {
  it('accepts allowed profile fields', () => {
    expect(
      sanitizeProfileUpdate({ firstName: ' Ada ', lastName: 'Lovelace', phoneNumber: '+8801000000000' }),
    ).toEqual({ firstName: 'Ada', lastName: 'Lovelace', phoneNumber: '+8801000000000' });
  });

  it('rejects privilege and identity fields', () => {
    expect(() => sanitizeProfileUpdate({ role: 'super_admin' })).toThrow();
    expect(() => sanitizeProfileUpdate({ organizationId: 'org-2' })).toThrow();
    expect(() => sanitizeProfileUpdate({ email: 'new@example.com' })).toThrow();
    expect(() => sanitizeProfileUpdate({ isVerified: true })).toThrow();
  });

  it('rejects invalid or empty updates', () => {
    expect(() => sanitizeProfileUpdate(null)).toThrow();
    expect(() => sanitizeProfileUpdate({})).toThrow();
    expect(() => sanitizeProfileUpdate({ firstName: '   ' })).toThrow();
    expect(() => sanitizeProfileUpdate({ phoneNumber: 123 })).toThrow();
    expect(() => sanitizeProfileUpdate({ avatarUrl: 'x'.repeat(2001) })).toThrow();
  });
});

describe('canReadUser', () => {
  it('always allows self', () => {
    expect(canReadUser('user-1', 'student', 'user-1')).toBe(true);
  });

  it('allows teaching and privileged roles to read others', () => {
    expect(canReadUser('teacher-1', 'teacher', 'student-1')).toBe(true);
    expect(canReadUser('tutor-1', 'tutor', 'student-1')).toBe(true);
    expect(canReadUser('admin-1', 'admin', 'student-1')).toBe(true);
    expect(canReadUser('admin-1', 'school_admin', 'student-1')).toBe(true);
  });

  it('rejects unrelated students and parents reading others', () => {
    expect(canReadUser('student-1', 'student', 'student-2')).toBe(false);
    expect(canReadUser('parent-1', 'parent', 'student-2')).toBe(false);
  });
});
