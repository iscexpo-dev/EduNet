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

export interface RelationshipUpdate {
  relationship?: string;
  isPrimary?: boolean;
  canViewGrades?: boolean;
  canViewAttendance?: boolean;
  canViewAssignments?: boolean;
}

const UPDATABLE_KEYS = [
  'relationship',
  'isPrimary',
  'canViewGrades',
  'canViewAttendance',
  'canViewAssignments',
] as const;

const BOOLEAN_KEYS = [
  'isPrimary',
  'canViewGrades',
  'canViewAttendance',
  'canViewAssignments',
] as const;

/**
 * Whitelists relationship fields so a caller cannot reassign parentId/childId
 * or overwrite server-managed columns through mass assignment.
 */
export function sanitizeRelationshipUpdate(input: unknown): RelationshipUpdate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid relationship update');
  }

  const source = input as Record<string, unknown>;
  const result: RelationshipUpdate = {};

  if ('relationship' in source) {
    if (typeof source.relationship !== 'string') {
      throw new Error('relationship must be a string');
    }
    const relationship = source.relationship.trim();
    if (relationship.length === 0 || relationship.length > 50) {
      throw new Error('relationship must be between 1 and 50 characters');
    }
    result.relationship = relationship;
  }

  for (const key of BOOLEAN_KEYS) {
    if (key in source) {
      if (typeof source[key] !== 'boolean') {
        throw new Error(`${key} must be a boolean`);
      }
      result[key] = source[key] as boolean;
    }
  }

  if (Object.keys(result).length === 0) {
    throw new Error(`At least one of ${UPDATABLE_KEYS.join(', ')} is required`);
  }

  return result;
}

export interface ParentRelationship {
  parentId: string;
  canViewGrades: boolean;
  canViewAttendance: boolean;
  canViewAssignments: boolean;
}

export function canReadChildGrades(
  role: string,
  userId: string,
  relationship: ParentRelationship | null,
): boolean {
  if (role !== 'parent') return true;
  return Boolean(relationship && relationship.parentId === userId && relationship.canViewGrades);
}

export function canReadChildAssignments(
  role: string,
  userId: string,
  relationship: ParentRelationship | null,
): boolean {
  if (role !== 'parent') return true;
  return Boolean(relationship && relationship.parentId === userId && relationship.canViewAssignments);
}

export function canReadChildAttendance(
  role: string,
  userId: string,
  relationship: ParentRelationship | null,
): boolean {
  if (role !== 'parent') return true;
  return Boolean(relationship && relationship.parentId === userId && relationship.canViewAttendance);
}

export function canManageRelationship(
  role: string,
  userId: string,
  organizationId: string | undefined,
  relationshipParentId: string,
  relationshipOrganizationId: string | undefined,
): boolean {
  if (role === 'parent') return relationshipParentId === userId;
  if (role === 'admin') {
    return Boolean(organizationId) && relationshipOrganizationId === organizationId;
  }
  return false;
}
