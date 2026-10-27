/**
 * Pure authorization and validation helpers for course analytics. Keeping
 * these free of database imports lets the rules be unit tested without
 * PostgreSQL and keeps tenant scoping explicit at the handler boundary.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DEFAULT_ENGAGEMENT_DAYS = 30;
export const MAX_ENGAGEMENT_DAYS = 365;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Course analytics are visible to an administrator in the course's
 * organization or to the teacher who owns the course. Route-level role checks
 * remain, but ownership must also be enforced here because a teacher in another
 * organization must not read a course they do not own.
 */
export function canViewCourseAnalytics(
  role: string | undefined,
  userId: string | undefined,
  teacherId: string | null | undefined,
): boolean {
  if (!role || !userId) return false;
  if (role === 'admin') return true;
  return role === 'teacher' && Boolean(teacherId) && teacherId === userId;
}

/** Parses the `days` window for engagement, bounding it to a sane range. */
export function parseEngagementDays(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_ENGAGEMENT_DAYS;
  }
  const days =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(days) || days < 1 || days > MAX_ENGAGEMENT_DAYS) {
    throw new Error(`days must be an integer between 1 and ${MAX_ENGAGEMENT_DAYS}`);
  }
  return days;
}

/** Percent of max points, rounded to two decimals; null when ungraded. */
export function scorePercent(
  grade: number | string | null | undefined,
  maxPoints: number | string | null | undefined,
): number | null {
  const score = Number(grade);
  const max = Number(maxPoints);
  if (grade === null || grade === undefined || !Number.isFinite(score)) return null;
  if (!Number.isFinite(max) || max <= 0) return null;
  return Math.round((Math.min(Math.max(score, 0), max) / max) * 10000) / 100;
}
