import { isPrivilegedRole } from '@edunet/rbac';

export interface Pagination {
  limit: number;
  offset: number;
}

export function parsePagination(
  query: Record<string, unknown>,
  defaultLimit = 50,
  maxLimit = 200,
): Pagination {
  const rawLimit = typeof query.limit === 'string' ? Number(query.limit) : defaultLimit;
  const rawOffset = typeof query.offset === 'string' ? Number(query.offset) : 0;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), maxLimit)
    : defaultLimit;
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;
  return { limit, offset };
}

export interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  avatarUrl?: string;
}

const ALLOWED_KEYS = ['firstName', 'lastName', 'phoneNumber', 'avatarUrl'] as const;

/**
 * Profile edits may not change role, email, organization or verification
 * state. Unknown keys are rejected rather than silently ignored so privilege
 * escalation attempts are visible.
 */
export function sanitizeProfileUpdate(input: unknown): ProfileUpdate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid profile update');
  }

  const source = input as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (!(ALLOWED_KEYS as readonly string[]).includes(key)) {
      throw new Error(`${key} cannot be changed through this endpoint`);
    }
  }

  const result: ProfileUpdate = {};

  if ('firstName' in source) {
    if (typeof source.firstName !== 'string') throw new Error('firstName must be a string');
    const firstName = source.firstName.trim();
    if (firstName.length === 0 || firstName.length > 100) {
      throw new Error('firstName must be between 1 and 100 characters');
    }
    result.firstName = firstName;
  }

  if ('lastName' in source) {
    if (typeof source.lastName !== 'string') throw new Error('lastName must be a string');
    const lastName = source.lastName.trim();
    if (lastName.length === 0 || lastName.length > 100) {
      throw new Error('lastName must be between 1 and 100 characters');
    }
    result.lastName = lastName;
  }

  if ('phoneNumber' in source) {
    if (typeof source.phoneNumber !== 'string') throw new Error('phoneNumber must be a string');
    const phoneNumber = source.phoneNumber.trim();
    if (phoneNumber.length > 20) throw new Error('phoneNumber must be at most 20 characters');
    result.phoneNumber = phoneNumber;
  }

  if ('avatarUrl' in source) {
    if (typeof source.avatarUrl !== 'string') throw new Error('avatarUrl must be a string');
    const avatarUrl = source.avatarUrl.trim();
    if (avatarUrl.length > 2000) throw new Error('avatarUrl must be at most 2000 characters');
    result.avatarUrl = avatarUrl;
  }

  if (Object.keys(result).length === 0) {
    throw new Error(`At least one of ${ALLOWED_KEYS.join(', ')} is required`);
  }

  return result;
}

/**
 * A user may always read their own record. Teachers, tutors, mentors and
 * privileged administrators may read other records in the same organization
 * (the database query already enforces the tenant boundary).
 */
export function canReadUser(
  requesterId: string,
  requesterRole: string,
  targetId: string,
): boolean {
  if (requesterId === targetId) return true;
  if (isPrivilegedRole(requesterRole)) return true;
  return requesterRole === 'teacher' || requesterRole === 'tutor' || requesterRole === 'mentor';
}
