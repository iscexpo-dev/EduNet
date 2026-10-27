/**
 * Pure validation and authorization helpers for content-owned personal state
 * (learning objectives, bookmarks and notes). Keeping these free of database
 * imports lets the rules be unit tested without PostgreSQL.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_OBJECTIVE_LENGTH = 1_000;
export const MAX_NOTE_LENGTH = 20_000;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 50;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Only the course's owning teacher or an administrator may edit its content. */
export function canManageCourse(
  role: string | undefined,
  userId: string | undefined,
  teacherId: string | null | undefined,
): boolean {
  if (!role || !userId) return false;
  if (role === 'admin') return true;
  return role === 'teacher' && Boolean(teacherId) && teacherId === userId;
}

/** Personal bookmarks and notes are student-owned by construction. */
export function canOwnPersonalState(role: string | undefined): boolean {
  return role === 'student';
}

export interface ObjectiveInput {
  description: string;
  order: number;
}

export function parseObjectiveInput(body: unknown): ObjectiveInput {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Objective payload is required');
  }
  const value = body as Record<string, unknown>;
  const description =
    typeof value.description === 'string' ? value.description.trim() : '';
  if (!description) throw new Error('description is required');
  if (description.length > MAX_OBJECTIVE_LENGTH) {
    throw new Error(`description must be at most ${MAX_OBJECTIVE_LENGTH} characters`);
  }

  const rawOrder = value.order;
  const order =
    rawOrder === undefined || rawOrder === null
      ? 0
      : typeof rawOrder === 'number'
        ? rawOrder
        : typeof rawOrder === 'string' && rawOrder.trim() !== ''
          ? Number(rawOrder)
          : Number.NaN;
  if (!Number.isInteger(order) || order < 0 || order > 100_000) {
    throw new Error('order must be a non-negative integer');
  }

  return { description, order };
}

export function parseObjectiveUpdate(
  body: unknown,
): Partial<ObjectiveInput> {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Objective payload is required');
  }
  const value = body as Record<string, unknown>;
  const update: Partial<ObjectiveInput> = {};

  if (value.description !== undefined) {
    const description =
      typeof value.description === 'string' ? value.description.trim() : '';
    if (!description) throw new Error('description is required');
    if (description.length > MAX_OBJECTIVE_LENGTH) {
      throw new Error(`description must be at most ${MAX_OBJECTIVE_LENGTH} characters`);
    }
    update.description = description;
  }

  if (value.order !== undefined) {
    const order =
      typeof value.order === 'number'
        ? value.order
        : typeof value.order === 'string' && value.order.trim() !== ''
          ? Number(value.order)
          : Number.NaN;
    if (!Number.isInteger(order) || order < 0 || order > 100_000) {
      throw new Error('order must be a non-negative integer');
    }
    update.order = order;
  }

  if (Object.keys(update).length === 0) {
    throw new Error('No updatable fields supplied');
  }

  return update;
}

/** Notes are trimmed and length-bounded; empty notes are rejected. */
export function parseNoteContent(body: unknown): string {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Note payload is required');
  }
  const value = (body as Record<string, unknown>).content;
  if (typeof value !== 'string') throw new Error('content is required');
  const content = value.trim();
  if (!content) throw new Error('content is required');
  if (content.length > MAX_NOTE_LENGTH) {
    throw new Error(`content must be at most ${MAX_NOTE_LENGTH} characters`);
  }
  return content;
}

export function clampPagination(
  query: Record<string, unknown>,
  defaults: { limit?: number; offset?: number } = {},
): { limit: number; offset: number } {
  const rawLimit =
    typeof query.limit === 'string' ? Number(query.limit) : (defaults.limit ?? DEFAULT_PAGE_SIZE);
  const rawOffset =
    typeof query.offset === 'string' ? Number(query.offset) : (defaults.offset ?? 0);

  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_PAGE_SIZE)
    : (defaults.limit ?? DEFAULT_PAGE_SIZE);
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;

  return { limit, offset };
}
