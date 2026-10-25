import { Request, Response } from 'express';
import { createLogger } from '@edunet/observability';
import {
  globalSearch,
  recordSearchEvent,
  searchAssignments,
  searchCourses,
  searchOrganizations,
  searchUsers,
  type AssignmentSort,
  type CourseSort,
  type OrganizationSort,
  type UserSort,
} from './db';
import {
  isSearchQueryTooLong,
  normalizeSearchQuery,
  parseSearchLocale,
  parseSearchPagination,
  parseSearchType,
  parseSortBy,
  parseSortOrder,
} from './normalize';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    organizationId?: string;
  };
}

const logger = createLogger();

function countResults(results: unknown): number {
  if (Array.isArray(results)) return results.length;
  if (results && typeof results === 'object') {
    return Object.values(results as Record<string, unknown>).reduce<number>(
      (total, value) => total + (Array.isArray(value) ? value.length : 0),
      0,
    );
  }
  return 0;
}

// Search handlers
export async function searchHandler(req: AuthRequest, res: Response) {
  try {
    const rawQuery = req.query.q;
    if (typeof rawQuery !== 'string' || rawQuery.trim().length === 0) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }
    if (isSearchQueryTooLong(rawQuery)) {
      return res.status(400).json({ error: 'Search query is too long' });
    }

    const normalizedQuery = normalizeSearchQuery(rawQuery);
    if (!normalizedQuery) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }

    const type = parseSearchType(req.query.type);
    if (!type) {
      return res.status(400).json({ error: 'Invalid search type' });
    }

    const { limit, offset } = parseSearchPagination(req.query as Record<string, unknown>);
    const sortBy = parseSortBy(type, req.query.sortBy);
    const sortOrder = parseSortOrder(req.query.sortOrder);
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const locale = parseSearchLocale(req.query.locale);

    const isAdmin = req.user?.role === 'admin';
    const requestedOrganization =
      typeof req.query.organizationId === 'string' && req.query.organizationId.trim() !== ''
        ? req.query.organizationId.trim()
        : undefined;
    // Only an administrator may search a different tenant. Everyone else is
    // pinned to the organization in their access token.
    const organizationId =
      isAdmin && requestedOrganization
        ? requestedOrganization
        : req.user?.organizationId;

    if (!organizationId && type !== 'organizations') {
      return res.status(403).json({ error: 'Organization context is required' });
    }

    let results;
    switch (type) {
      case 'courses':
        results = await searchCourses(
          normalizedQuery,
          organizationId,
          limit,
          offset,
          sortBy as CourseSort,
          sortOrder,
        );
        break;
      case 'users':
        results = await searchUsers(
          normalizedQuery,
          organizationId,
          role,
          limit,
          offset,
          sortBy as UserSort,
          sortOrder,
        );
        break;
      case 'assignments':
        results = await searchAssignments(
          normalizedQuery,
          organizationId,
          limit,
          offset,
          sortBy as AssignmentSort,
          sortOrder,
        );
        break;
      case 'organizations': {
        // Non-admins can only see their own organization. Administrators may
        // pass organizationId to narrow the search, or omit it for all tenants.
        const organizationScope = isAdmin ? requestedOrganization : organizationId;
        results = await searchOrganizations(
          normalizedQuery,
          organizationScope,
          limit,
          offset,
          sortBy as OrganizationSort,
          sortOrder,
        );
        break;
      }
      case 'all':
      default:
        results = await globalSearch(normalizedQuery, organizationId, limit);
        break;
    }

    if (organizationId) {
      void recordSearchEvent({
        query: rawQuery,
        normalizedQuery,
        locale,
        organizationId,
        userId: req.user?.id,
        resultCount: countResults(results),
      }).catch((error: unknown) => {
        logger.warn('search_analytics_failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }

    res.json(results);
  } catch (error: unknown) {
    logger.error('search_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Search failed' });
  }
}
