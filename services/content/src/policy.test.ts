import { describe, expect, it } from 'vitest';
import {
  MAX_NOTE_LENGTH,
  MAX_OBJECTIVE_LENGTH,
  MAX_PAGE_SIZE,
  canManageCourse,
  canOwnPersonalState,
  clampPagination,
  isUuid,
  parseNoteContent,
  parseObjectiveInput,
  parseObjectiveUpdate,
} from './policy';

const UUID = '3f8d2c1a-5b6e-4f7a-9c8d-1e2f3a4b5c6d';

describe('isUuid', () => {
  it('accepts a valid v4 uuid', () => {
    expect(isUuid(UUID)).toBe(true);
  });

  it('rejects non-string and malformed values', () => {
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('3f8d2c1a-5b6e-4f7a-9c8d-1e2f3a4b5c6')).toBe(false);
  });
});

describe('canManageCourse', () => {
  it('allows administrators', () => {
    expect(canManageCourse('admin', 'admin-1', 'teacher-1')).toBe(true);
  });

  it('allows the owning teacher', () => {
    expect(canManageCourse('teacher', 'teacher-1', 'teacher-1')).toBe(true);
  });

  it('rejects another teacher', () => {
    expect(canManageCourse('teacher', 'teacher-2', 'teacher-1')).toBe(false);
  });

  it('rejects students, missing users and unowned courses', () => {
    expect(canManageCourse('student', 'student-1', 'teacher-1')).toBe(false);
    expect(canManageCourse(undefined, 'teacher-1', 'teacher-1')).toBe(false);
    expect(canManageCourse('teacher', undefined, 'teacher-1')).toBe(false);
    expect(canManageCourse('teacher', 'teacher-1', null)).toBe(false);
  });
});

describe('canOwnPersonalState', () => {
  it('only allows students', () => {
    expect(canOwnPersonalState('student')).toBe(true);
    expect(canOwnPersonalState('teacher')).toBe(false);
    expect(canOwnPersonalState(undefined)).toBe(false);
  });
});

describe('parseObjectiveInput', () => {
  it('trims description and defaults order to zero', () => {
    expect(parseObjectiveInput({ description: '  Fractions  ' })).toEqual({
      description: 'Fractions',
      order: 0,
    });
  });

  it('accepts numeric strings for order', () => {
    expect(parseObjectiveInput({ description: 'Algebra', order: '3' })).toEqual({
      description: 'Algebra',
      order: 3,
    });
  });

  it('rejects missing, blank and over-long descriptions', () => {
    expect(() => parseObjectiveInput({})).toThrow(/description is required/);
    expect(() => parseObjectiveInput({ description: '   ' })).toThrow(/description is required/);
    expect(() =>
      parseObjectiveInput({ description: 'x'.repeat(MAX_OBJECTIVE_LENGTH + 1) }),
    ).toThrow(/at most/);
  });

  it('rejects negative or non-integer order', () => {
    expect(() => parseObjectiveInput({ description: 'A', order: -1 })).toThrow(/non-negative/);
    expect(() => parseObjectiveInput({ description: 'A', order: 1.5 })).toThrow(/non-negative/);
    expect(() => parseObjectiveInput({ description: 'A', order: 'abc' })).toThrow(/non-negative/);
  });

  it('rejects a non-object payload', () => {
    expect(() => parseObjectiveInput(null)).toThrow(/required/);
    expect(() => parseObjectiveInput('Objectives')).toThrow(/required/);
  });
});

describe('parseObjectiveUpdate', () => {
  it('returns only supplied fields', () => {
    expect(parseObjectiveUpdate({ order: 2 })).toEqual({ order: 2 });
    expect(parseObjectiveUpdate({ description: ' Updated ' })).toEqual({
      description: 'Updated',
    });
  });

  it('rejects empty updates and invalid values', () => {
    expect(() => parseObjectiveUpdate({})).toThrow(/No updatable fields/);
    expect(() => parseObjectiveUpdate({ description: '  ' })).toThrow(/required/);
    expect(() => parseObjectiveUpdate({ order: -5 })).toThrow(/non-negative/);
  });
});

describe('parseNoteContent', () => {
  it('trims and returns note content', () => {
    expect(parseNoteContent({ content: '  remember this  ' })).toBe('remember this');
  });

  it('rejects missing, blank and over-long notes', () => {
    expect(() => parseNoteContent({})).toThrow(/content is required/);
    expect(() => parseNoteContent({ content: '   ' })).toThrow(/content is required/);
    expect(() => parseNoteContent({ content: 42 })).toThrow(/content is required/);
    expect(() => parseNoteContent({ content: 'x'.repeat(MAX_NOTE_LENGTH + 1) })).toThrow(
      /at most/,
    );
  });
});

describe('clampPagination', () => {
  it('applies defaults when absent', () => {
    expect(clampPagination({})).toEqual({ limit: 50, offset: 0 });
  });

  it('clamps limit and prevents negative offsets', () => {
    expect(clampPagination({ limit: '5000', offset: '-10' })).toEqual({
      limit: MAX_PAGE_SIZE,
      offset: 0,
    });
    expect(clampPagination({ limit: '0', offset: '7' })).toEqual({ limit: 1, offset: 7 });
  });

  it('falls back to defaults for non-numeric values', () => {
    expect(clampPagination({ limit: 'abc', offset: 'xyz' })).toEqual({
      limit: 50,
      offset: 0,
    });
  });
});
