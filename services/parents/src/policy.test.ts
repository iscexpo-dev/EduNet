import { describe, it, expect } from 'vitest';
import {
  canManageRelationship,
  canReadChildAssignments,
  canReadChildAttendance,
  canReadChildGrades,
  parsePagination,
  sanitizeRelationshipUpdate,
  type ParentRelationship,
} from './policy';

const relationship = (overrides: Partial<ParentRelationship> = {}): ParentRelationship => ({
  parentId: 'parent-1',
  canViewGrades: true,
  canViewAttendance: true,
  canViewAssignments: true,
  ...overrides,
});

describe('parsePagination', () => {
  it('defaults and clamps values', () => {
    expect(parsePagination({})).toEqual({ limit: 50, offset: 0 });
    expect(parsePagination({ limit: '500', offset: '5' })).toEqual({ limit: 200, offset: 5 });
    expect(parsePagination({ limit: '0', offset: '-3' })).toEqual({ limit: 1, offset: 0 });
    expect(parsePagination({ limit: 'abc', offset: 'Infinity' })).toEqual({ limit: 50, offset: 0 });
  });
});

describe('sanitizeRelationshipUpdate', () => {
  it('keeps only whitelisted fields', () => {
    expect(
      sanitizeRelationshipUpdate({
        relationship: ' guardian ',
        canViewGrades: false,
        parentId: 'attacker',
        childId: 'attacker-child',
        id: 'other',
      }),
    ).toEqual({ relationship: 'guardian', canViewGrades: false });
  });

  it('rejects invalid payloads', () => {
    expect(() => sanitizeRelationshipUpdate(null)).toThrow();
    expect(() => sanitizeRelationshipUpdate([])).toThrow();
    expect(() => sanitizeRelationshipUpdate({})).toThrow();
    expect(() => sanitizeRelationshipUpdate({ canViewGrades: 'yes' })).toThrow();
    expect(() => sanitizeRelationshipUpdate({ relationship: '   ' })).toThrow();
    expect(() => sanitizeRelationshipUpdate({ relationship: 'x'.repeat(51) })).toThrow();
  });
});

describe('parent read permissions', () => {
  it('allows a linked parent only when the flag is set', () => {
    expect(canReadChildGrades('parent', 'parent-1', relationship())).toBe(true);
    expect(canReadChildGrades('parent', 'parent-1', relationship({ canViewGrades: false }))).toBe(false);
    expect(canReadChildGrades('parent', 'parent-2', relationship())).toBe(false);
    expect(canReadChildGrades('parent', 'parent-1', null)).toBe(false);

    expect(canReadChildAssignments('parent', 'parent-1', relationship())).toBe(true);
    expect(canReadChildAssignments('parent', 'parent-1', relationship({ canViewAssignments: false }))).toBe(false);

    expect(canReadChildAttendance('parent', 'parent-1', relationship())).toBe(true);
    expect(canReadChildAttendance('parent', 'parent-1', relationship({ canViewAttendance: false }))).toBe(false);
  });

  it('allows staff without a parent relationship', () => {
    expect(canReadChildGrades('admin', 'admin-1', null)).toBe(true);
    expect(canReadChildAssignments('teacher', 'teacher-1', null)).toBe(true);
    expect(canReadChildAttendance('admin', 'admin-1', null)).toBe(true);
  });
});

describe('canManageRelationship', () => {
  it('lets parents manage only their own relationship', () => {
    expect(canManageRelationship('parent', 'parent-1', 'org-1', 'parent-1', 'org-1')).toBe(true);
    expect(canManageRelationship('parent', 'parent-2', 'org-1', 'parent-1', 'org-1')).toBe(false);
  });

  it('lets admins manage only within their organization', () => {
    expect(canManageRelationship('admin', 'admin-1', 'org-1', 'parent-1', 'org-1')).toBe(true);
    expect(canManageRelationship('admin', 'admin-1', 'org-1', 'parent-1', 'org-2')).toBe(false);
    expect(canManageRelationship('admin', 'admin-1', undefined, 'parent-1', 'org-1')).toBe(false);
  });

  it('rejects unrelated roles', () => {
    expect(canManageRelationship('teacher', 'teacher-1', 'org-1', 'parent-1', 'org-1')).toBe(false);
    expect(canManageRelationship('student', 'student-1', 'org-1', 'parent-1', 'org-1')).toBe(false);
  });
});
