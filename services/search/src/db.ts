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
 * characters and nukta variants). Expression indexes are intentionally not
 * required for the pilot's data volume; a trigram index is the next step once
 * query plans show a need.
 */

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
  const relevance = buildRelevance(fields, terms);

  return getDb()
    .select()
    .from(courses)
    .where(
      and(
        eq(courses.isActive, true),
        isNull(courses.deletedAt),
        eq(courses.organizationId, organizationId),
        and(...buildTermConditions(fields, terms)),
      ),
    )
    .orderBy(
      ...buildOrderBy(relevance, sortBy, sortOrder, {
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
  const relevance = buildRelevance(fields, terms);

  const conditions: SQL[] = [
    eq(users.organizationId, organizationId),
    isNull(users.deletedAt),
    and(...buildTermConditions(fields, terms)) as SQL,
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
      ...buildOrderBy(relevance, sortBy, sortOrder, {
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
  const relevance = buildRelevance(fields, terms);

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
        and(...buildTermConditions(fields, terms)),
      ),
    )
    .orderBy(
      ...buildOrderBy(relevance, sortBy, sortOrder, {
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
  const relevance = buildRelevance(fields, terms);

  const conditions: SQL[] = [
    eq(organizations.isActive, true),
    isNull(organizations.deletedAt),
    and(...buildTermConditions(fields, terms)) as SQL,
  ];
  if (organizationId) {
    conditions.push(eq(organizations.id, organizationId));
  }

  return getDb()
    .select()
    .from(organizations)
    .where(and(...conditions))
    .orderBy(
      ...buildOrderBy(relevance, sortBy, sortOrder, {
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
