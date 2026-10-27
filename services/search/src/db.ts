import {
  assignments,
  courses,
  getDb,
  organizations,
  searchAnalyticsEvents,
  users,
} from '@edunet/database';
import {
  and,
  asc,
  count,
  desc,
  eq,
  isNull,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import {
  escapeLikePattern,
  tokenizeSearchQuery,
  type SortOrder,
} from './normalize';

/**
 * Search uses SQL-side relevance rather than loading rows and sorting in
 * memory: pagination must stay correct for Bengali and English content.
 *
 * Columns are normalized inside SQL (lowercase, Bengali digits, invisible
 * characters and nukta variants). The default matcher is normalized LIKE
 * relevance scoring. When `SEARCH_USE_TRIGRAM=true` and migration
 * `0005_trigram_search.sql` has been applied (creating the `pg_trgm`
 * extension and GIN trigram indexes), search uses trigram similarity for
 * fuzzy/typo-tolerant matching instead. The trigram path is opt-in because it
 * requires the extension and indexes to be present in the target database.
 */
export function trigramEnabled(): boolean {
  return process.env.SEARCH_USE_TRIGRAM?.toLowerCase() === 'true';
}

type SearchExpression = AnyColumn | SQL;

interface SearchField {
  column: SearchExpression;
  weight: number;
}

const BENGALI_DIGITS = '০১২৩৪৫৬৭৮৯';
const ASCII_DIGITS = '0123456789';
const INVISIBLE_CHARACTERS = ['\u200B', '\u200C', '\u200D', '\uFEFF', '\u00AD'];

/** Precomposed nukta letters have decomposed canonical forms. */
const NUKTA_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['\u09DC', '\u09A1\u09BC'],
  ['\u09DD', '\u09A2\u09BC'],
  ['\u09DF', '\u09AF\u09BC'],
];

function normalizedColumn(column: SearchExpression): SQL {
  let expression: SQL = sql`${column}`;

  for (const character of INVISIBLE_CHARACTERS) {
    expression = sql`replace(${expression}, ${character}, '')`;
  }
  for (const [from, to] of NUKTA_REPLACEMENTS) {
    expression = sql`replace(${expression}, ${from}, ${to})`;
  }

  return sql`lower(translate(${expression}, ${BENGALI_DIGITS}, ${ASCII_DIGITS}))`;
}

function termCondition(column: SearchExpression, term: string): SQL {
  return sql`${normalizedColumn(column)} like ${`%${escapeLikePattern(term)}%`}`;
}

function termScore(column: SearchExpression, term: string, weight: number): SQL {
  const haystack = normalizedColumn(column);
  const escaped = escapeLikePattern(term);

  return sql`case
    when ${haystack} = ${term} then ${100 * weight}
    when ${haystack} like ${`${escaped}%`} then ${60 * weight}
    when ${haystack} like ${`% ${escaped}%`} then ${40 * weight}
    when ${haystack} like ${`%${escaped}%`} then ${20 * weight}
    else 0 end`;
}

/**
 * Every term must match at least one field. This makes "বাংলা গণিত" behave as
 * an AND search instead of returning anything containing either word.
 */
function buildTermConditions(fields: readonly SearchField[], terms: readonly string[]): SQL[] {
  return terms.map((term) => {
    const perField = fields.map((field) => termCondition(field.column, term));
    return or(...perField) as SQL;
  });
}

function buildRelevance(fields: readonly SearchField[], terms: readonly string[]): SQL {
  const parts = terms.flatMap((term) =>
    fields.map((field) => termScore(field.column, term, field.weight)),
  );
  if (parts.length === 0) return sql`0`;
  return sql`(${sql.join(parts, sql` + `)})`;
}

function buildTrigramTermConditions(
  fields: readonly SearchField[],
  terms: readonly string[],
): SQL[] {
  return terms.map((term) => {
    const perField = fields.map(
      (field) => sql`${field.column} % ${term}` as SQL,
    );
    return or(...perField) as SQL;
  });
}

function buildTrigramRelevance(
  fields: readonly SearchField[],
  terms: readonly string[],
): SQL {
  const parts = terms.flatMap((term) =>
    fields.map(
      (field) =>
        sql`similarity(lower(${field.column}), lower(${term})) * ${100 * field.weight}`,
    ),
  );
  if (parts.length === 0) return sql`0`;
  return sql`(${sql.join(parts, sql` + `)})`;
}

/**
 * Chooses between trigram fuzzy matching and normalized LIKE matching. The
 * trigram path requires `SEARCH_USE_TRIGRAM=true`, the `pg_trgm` extension
 * and the GIN indexes from migration `0005_trigram_search.sql`. Without them
 * the service falls back to LIKE, so the search stays correct even when the
 * migration has not been applied yet.
 */
function termConditions(
  fields: readonly SearchField[],
  terms: readonly string[],
): SQL[] {
  return trigramEnabled()
    ? buildTrigramTermConditions(fields, terms)
    : buildTermConditions(fields, terms);
}

function relevance(fields: readonly SearchField[], terms: readonly string[]): SQL {
  return trigramEnabled()
    ? buildTrigramRelevance(fields, terms)
    : buildRelevance(fields, terms);
}

function buildOrderBy(
  relevance: SQL,
  sortBy: string,
  sortOrder: SortOrder,
  columns: Record<string, AnyColumn>,
  tieBreaker: AnyColumn,
): SQL[] {
  if (sortBy === 'relevance') {
    return [desc(relevance), desc(tieBreaker)];
  }
  const column = columns[sortBy] ?? tieBreaker;
  return [sortOrder === 'asc' ? asc(column) : desc(column)];
}

export type CourseSort = 'relevance' | 'title' | 'createdAt';
export type UserSort = 'relevance' | 'name' | 'email' | 'createdAt';
export type AssignmentSort = 'relevance' | 'title' | 'dueDate' | 'createdAt';
export type OrganizationSort = 'relevance' | 'name' | 'createdAt';

export async function searchCourses(
  query: string,
  organizationId?: string,
  limit = 20,
  offset = 0,
  sortBy: CourseSort = 'relevance',
  sortOrder: SortOrder = 'desc',
) {
  if (!organizationId) return [];
  const terms = tokenizeSearchQuery(query);
  if (terms.length === 0) return [];

  const fields: SearchField[] = [
    { column: courses.title, weight: 4 },
    { column: courses.subject, weight: 2 },
    { column: courses.description, weight: 1 },
  ];
  const relevanceScore = relevance(fields, terms);

  return getDb()
    .select()
    .from(courses)
    .where(
      and(
        eq(courses.isActive, true),
        isNull(courses.deletedAt),
        eq(courses.organizationId, organizationId),
        and(...termConditions(fields, terms)),
      ),
    )
    .orderBy(
      ...buildOrderBy(relevanceScore, sortBy, sortOrder, {
        title: courses.title,
        createdAt: courses.createdAt,
      }, courses.createdAt),
    )
    .limit(limit)
    .offset(offset);
}

export async function searchUsers(
  query: string,
  organizationId?: string,
  role?: string,
  limit = 20,
  offset = 0,
  sortBy: UserSort = 'relevance',
  sortOrder: SortOrder = 'desc',
) {
  if (!organizationId) return [];
  const terms = tokenizeSearchQuery(query);
  if (terms.length === 0) return [];

  const fullName = sql`${users.firstName} || ' ' || ${users.lastName}`;
  const fields: SearchField[] = [
    { column: fullName, weight: 4 },
    { column: users.firstName, weight: 3 },
    { column: users.lastName, weight: 3 },
    { column: users.email, weight: 2 },
  ];
  const relevanceScore = relevance(fields, terms);

  const conditions: SQL[] = [
    eq(users.organizationId, organizationId),
    isNull(users.deletedAt),
    and(...termConditions(fields, terms)) as SQL,
  ];
  if (role) {
    conditions.push(eq(users.role, role));
  }

  return getDb()
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
      organizationId: users.organizationId,
      isVerified: users.isVerified,
    })
    .from(users)
    .where(and(...conditions))
    .orderBy(
      ...buildOrderBy(relevanceScore, sortBy, sortOrder, {
        name: users.firstName,
        email: users.email,
        createdAt: users.createdAt,
      }, users.createdAt),
    )
    .limit(limit)
    .offset(offset);
}

export async function searchAssignments(
  query: string,
  organizationId?: string,
  limit = 20,
  offset = 0,
  sortBy: AssignmentSort = 'relevance',
  sortOrder: SortOrder = 'desc',
) {
  if (!organizationId) return [];
  const terms = tokenizeSearchQuery(query);
  if (terms.length === 0) return [];

  const fields: SearchField[] = [
    { column: assignments.title, weight: 4 },
    { column: courses.title, weight: 2 },
    { column: assignments.description, weight: 1 },
  ];
  const relevanceScore = relevance(fields, terms);

  return getDb()
    .select({
      id: assignments.id,
      title: assignments.title,
      description: assignments.description,
      dueDate: assignments.dueDate,
      maxPoints: assignments.maxPoints,
      courseId: assignments.courseId,
    })
    .from(assignments)
    .innerJoin(courses, eq(assignments.courseId, courses.id))
    .where(
      and(
        eq(assignments.isActive, true),
        isNull(assignments.deletedAt),
        isNull(courses.deletedAt),
        eq(courses.organizationId, organizationId),
        and(...termConditions(fields, terms)),
      ),
    )
    .orderBy(
      ...buildOrderBy(relevanceScore, sortBy, sortOrder, {
        title: assignments.title,
        dueDate: assignments.dueDate,
        createdAt: assignments.createdAt,
      }, assignments.createdAt),
    )
    .limit(limit)
    .offset(offset);
}

export async function searchOrganizations(
  query: string,
  organizationId?: string,
  limit = 20,
  offset = 0,
  sortBy: OrganizationSort = 'relevance',
  sortOrder: SortOrder = 'desc',
) {
  const terms = tokenizeSearchQuery(query);
  if (terms.length === 0) return [];

  const fields: SearchField[] = [
    { column: organizations.name, weight: 4 },
    { column: organizations.code, weight: 2 },
    { column: organizations.address, weight: 1 },
  ];
  const relevanceScore = relevance(fields, terms);

  const conditions: SQL[] = [
    eq(organizations.isActive, true),
    isNull(organizations.deletedAt),
    and(...termConditions(fields, terms)) as SQL,
  ];
  if (organizationId) {
    conditions.push(eq(organizations.id, organizationId));
  }

  return getDb()
    .select()
    .from(organizations)
    .where(and(...conditions))
    .orderBy(
      ...buildOrderBy(relevanceScore, sortBy, sortOrder, {
        name: organizations.name,
        createdAt: organizations.createdAt,
      }, organizations.createdAt),
    )
    .limit(limit)
    .offset(offset);
}

export async function globalSearch(
  query: string,
  organizationId?: string,
  limit = 10,
) {
  const [coursesResult, usersResult, assignmentsResult] = await Promise.all([
    searchCourses(query, organizationId, limit, 0, 'relevance', 'desc'),
    searchUsers(query, organizationId, undefined, limit, 0, 'relevance', 'desc'),
    searchAssignments(query, organizationId, limit, 0, 'relevance', 'desc'),
  ]);

  return {
    courses: coursesResult,
    users: usersResult,
    assignments: assignmentsResult,
  };
}

export interface SubjectFacet {
  subject: string | null;
  count: number;
}

export interface RoleFacet {
  role: string;
  count: number;
}

export interface CourseFacets {
  total: number;
  bySubject: SubjectFacet[];
}

export interface UserFacets {
  total: number;
  byRole: RoleFacet[];
}

export interface AssignmentFacets {
  total: number;
}

export interface OrganizationFacets {
  total: number;
}

export interface SearchFacets {
  courses?: CourseFacets;
  users?: UserFacets;
  assignments?: AssignmentFacets;
  organizations?: OrganizationFacets;
}

/**
 * Returns facet counts for a search scope. Counts reflect the same tenant,
 * active/non-deleted and (when a query is given) term filters as the matching
 * search, so facets narrow as the user types. The facet limit caps the number
 * of returned values per grouped field.
 */
export async function searchFacets(
  type: 'all' | 'courses' | 'users' | 'assignments' | 'organizations',
  organizationId?: string,
  query?: string,
  role?: string,
  facetLimit = 10,
): Promise<SearchFacets> {
  const facets: SearchFacets = {};
  const terms = query ? tokenizeSearchQuery(query) : [];

  if (type === 'all' || type === 'courses') {
    if (!organizationId) return facets;
    const courseFields = [
      { column: courses.title, weight: 1 },
      { column: courses.subject, weight: 1 },
      { column: courses.description, weight: 1 },
    ];
    const courseConditions = [
      eq(courses.isActive, true),
      isNull(courses.deletedAt),
      eq(courses.organizationId, organizationId),
      ...(terms.length ? termConditions(courseFields, terms) : []),
    ];
    const [{ total: courseTotalRaw }] = await getDb()
      .select({ total: count() })
      .from(courses)
      .where(and(...courseConditions));
    const courseTotal = Number(courseTotalRaw ?? 0);
    const bySubjectRows = await getDb()
      .select({ subject: courses.subject, total: count() })
      .from(courses)
      .where(and(...courseConditions))
      .groupBy(courses.subject)
      .orderBy(desc(count()))
      .limit(facetLimit);
    facets.courses = {
      total: courseTotal,
      bySubject: bySubjectRows.map((row) => ({
        subject: row.subject ?? null,
        count: Number(row.total ?? 0),
      })),
    };
  }

  if (type === 'all' || type === 'users') {
    if (!organizationId) return facets;
    const userFields = [
      { column: users.firstName, weight: 1 },
      { column: users.lastName, weight: 1 },
      { column: users.email, weight: 1 },
    ];
    const userConditions = [
      eq(users.organizationId, organizationId),
      isNull(users.deletedAt),
      ...(terms.length ? termConditions(userFields, terms) : []),
    ];
    if (role) {
      userConditions.push(eq(users.role, role));
    }
    const [{ total: userTotalRaw }] = await getDb()
      .select({ total: count() })
      .from(users)
      .where(and(...userConditions));
    const userTotal = Number(userTotalRaw ?? 0);
    const byRoleRows = await getDb()
      .select({ role: users.role, total: count() })
      .from(users)
      .where(and(...userConditions))
      .groupBy(users.role)
      .orderBy(desc(count()))
      .limit(facetLimit);
    facets.users = {
      total: userTotal,
      byRole: byRoleRows.map((row) => ({
        role: row.role ?? '',
        count: Number(row.total ?? 0),
      })),
    };
  }

  if (type === 'all' || type === 'assignments') {
    if (!organizationId) return facets;
    const assignmentFields = [
      { column: assignments.title, weight: 1 },
      { column: courses.title, weight: 1 },
      { column: assignments.description, weight: 1 },
    ];
    const assignmentConditions = [
      eq(assignments.isActive, true),
      isNull(assignments.deletedAt),
      isNull(courses.deletedAt),
      eq(courses.organizationId, organizationId),
      ...(terms.length ? termConditions(assignmentFields, terms) : []),
    ];
    const [{ total: assignmentTotalRaw }] = await getDb()
      .select({ total: count() })
      .from(assignments)
        .innerJoin(courses, eq(assignments.courseId, courses.id))
        .where(and(...assignmentConditions));
    const assignmentTotal = Number(assignmentTotalRaw ?? 0);
    facets.assignments = { total: assignmentTotal };
  }

  if (type === 'all' || type === 'organizations') {
    const organizationConditions = [
      eq(organizations.isActive, true),
      isNull(organizations.deletedAt),
      ...(organizationId ? [eq(organizations.id, organizationId)] : []),
      ...(terms.length
        ? termConditions(
            [
              { column: organizations.name, weight: 1 },
              { column: organizations.code, weight: 1 },
              { column: organizations.address, weight: 1 },
            ],
            terms,
          )
        : []),
    ];
    const [{ total: organizationTotalRaw }] = await getDb()
      .select({ total: count() })
      .from(organizations)
      .where(and(...organizationConditions));
    const organizationTotal = Number(organizationTotalRaw ?? 0);
    facets.organizations = { total: organizationTotal };
  }

  return facets;
}

export interface SearchAnalyticsInput {
  query: string;
  normalizedQuery: string;
  locale: 'en' | 'bn';
  organizationId: string;
  userId?: string;
  resultCount: number;
}

/**
 * Persists one search event for KPI reporting. Callers treat failures as
 * non-fatal: analytics must never break a user's search.
 */
export async function recordSearchEvent(input: SearchAnalyticsInput): Promise<void> {
  await getDb()
    .insert(searchAnalyticsEvents)
    .values({
      organizationId: input.organizationId,
      userId: input.userId,
      query: input.query.slice(0, 300),
      normalizedQuery: input.normalizedQuery.slice(0, 300),
      locale: input.locale,
      resultCount: input.resultCount,
    });
}
