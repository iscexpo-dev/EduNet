import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGAGEMENT_DAYS,
  MAX_ENGAGEMENT_DAYS,
  canViewCourseAnalytics,
  isUuid,
  parseEngagementDays,
  scorePercent,
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
  });
});

describe('canViewCourseAnalytics', () => {
  it('allows an administrator', () => {
    expect(canViewCourseAnalytics('admin', 'admin-1', 'teacher-1')).toBe(true);
  });

  it('allows only the owning teacher', () => {
    expect(canViewCourseAnalytics('teacher', 'teacher-1', 'teacher-1')).toBe(true);
    expect(canViewCourseAnalytics('teacher', 'teacher-2', 'teacher-1')).toBe(false);
  });

  it('rejects other roles and missing identity', () => {
    expect(canViewCourseAnalytics('student', 'student-1', 'teacher-1')).toBe(false);
    expect(canViewCourseAnalytics(undefined, 'teacher-1', 'teacher-1')).toBe(false);
    expect(canViewCourseAnalytics('teacher', undefined, 'teacher-1')).toBe(false);
    expect(canViewCourseAnalytics('teacher', 'teacher-1', null)).toBe(false);
  });
});

describe('parseEngagementDays', () => {
  it('defaults when absent or empty', () => {
    expect(parseEngagementDays(undefined)).toBe(DEFAULT_ENGAGEMENT_DAYS);
    expect(parseEngagementDays(null)).toBe(DEFAULT_ENGAGEMENT_DAYS);
    expect(parseEngagementDays('')).toBe(DEFAULT_ENGAGEMENT_DAYS);
  });

  it('accepts numbers and numeric strings', () => {
    expect(parseEngagementDays(7)).toBe(7);
    expect(parseEngagementDays('90')).toBe(90);
    expect(parseEngagementDays(MAX_ENGAGEMENT_DAYS)).toBe(MAX_ENGAGEMENT_DAYS);
  });

  it('rejects fractions, zero, out-of-range and non-numeric values', () => {
    expect(() => parseEngagementDays(0)).toThrow(/between 1/);
    expect(() => parseEngagementDays(1.5)).toThrow(/between 1/);
    expect(() => parseEngagementDays(MAX_ENGAGEMENT_DAYS + 1)).toThrow(/between 1/);
    expect(() => parseEngagementDays('abc')).toThrow(/between 1/);
  });
});

describe('scorePercent', () => {
  it('calculates a rounded percentage', () => {
    expect(scorePercent(8, 10)).toBe(80);
    expect(scorePercent('7.5', 10)).toBe(75);
    expect(scorePercent(2, 3)).toBe(66.67);
  });

  it('clamps negatives and over-max scores', () => {
    expect(scorePercent(-5, 10)).toBe(0);
    expect(scorePercent(15, 10)).toBe(100);
  });

  it('returns null for ungraded or invalid maxima', () => {
    expect(scorePercent(null, 10)).toBeNull();
    expect(scorePercent(undefined, 10)).toBeNull();
    expect(scorePercent(5, 0)).toBeNull();
    expect(scorePercent(5, null)).toBeNull();
  });
});
