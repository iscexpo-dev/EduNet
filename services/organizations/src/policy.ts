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

export interface OrganizationUpdate {
  name?: string;
  address?: string;
  isActive?: boolean;
}

/**
 * Only descriptive fields are mutable. Codes, types, ids and timestamps are
 * server-managed so a caller cannot repoint an organization's identity.
 */
export function sanitizeOrganizationUpdate(input: unknown): OrganizationUpdate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid organization update');
  }

  const source = input as Record<string, unknown>;
  const result: OrganizationUpdate = {};

  if ('name' in source) {
    if (typeof source.name !== 'string') throw new Error('name must be a string');
    const name = source.name.trim();
    if (name.length === 0 || name.length > 200) {
      throw new Error('name must be between 1 and 200 characters');
    }
    result.name = name;
  }

  if ('address' in source) {
    if (typeof source.address !== 'string') throw new Error('address must be a string');
    const address = source.address.trim();
    if (address.length > 500) throw new Error('address must be at most 500 characters');
    result.address = address;
  }

  if ('isActive' in source) {
    if (typeof source.isActive !== 'boolean') throw new Error('isActive must be a boolean');
    result.isActive = source.isActive;
  }

  if (Object.keys(result).length === 0) {
    throw new Error('At least one of name, address or isActive is required');
  }

  return result;
}

/** Tenant isolation: an account may only read or mutate its own organization. */
export function canAccessOrganization(
  userOrganizationId: string | undefined,
  targetOrganizationId: string,
): boolean {
  return Boolean(userOrganizationId) && userOrganizationId === targetOrganizationId;
}
