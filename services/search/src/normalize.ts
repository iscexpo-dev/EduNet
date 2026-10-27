/**
 * Query parsing and text normalization for search.
 *
 * The same normalization is applied inside SQL in `db.ts`. Keep both sides in
 * sync: lowercase, Bengali digits, zero-width characters and nukta variants
 * must map to the same form or a query will not match a normalized column.
 */

const BENGALI_DIGITS = '০১২৩৪৫৬৭৮৯';
const ASCII_DIGITS = '0123456789';

const INVISIBLE_CHARACTERS = ['\u200B', '\u200C', '\u200D', '\uFEFF', '\u00AD'];

/** Precomposed nukta letters have decomposed canonical forms. */
const NUKTA_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['\u09DC', '\u09A1\u09BC'],
  ['\u09DD', '\u09A2\u09BC'],
  ['\u09DF', '\u09AF\u09BC'],
];

const BENGALI_DIGIT_MAP = new Map(
  Array.from(BENGALI_DIGITS).map((digit, index) => [digit, ASCII_DIGITS[index]])
);

export const MAX_SEARCH_QUERY_LENGTH = 300;
export const MAX_SEARCH_TERMS = 10;
export const DEFAULT_SEARCH_LIMIT = 20;
export const MAX_SEARCH_LIMIT = 100;

export type SearchType = 'all' | 'courses' | 'users' | 'assignments' | 'organizations';
export type SearchLocale = 'en' | 'bn';
export type SortOrder = 'asc' | 'desc';
export type SearchSortBy = 'relevance' | 'title' | 'name' | 'email' | 'dueDate' | 'createdAt';

const SEARCH_TYPES: readonly SearchType[] = [
  'all',
  'courses',
  'users',
  'assignments',
  'organizations',
];

const SORT_FIELDS: Record<SearchType, readonly SearchSortBy[]> = {
  all: ['relevance'],
  courses: ['relevance', 'title', 'createdAt'],
  users: ['relevance', 'name', 'email', 'createdAt'],
  assignments: ['relevance', 'title', 'dueDate', 'createdAt'],
  organizations: ['relevance', 'name', 'createdAt'],
};

export function isSearchQueryTooLong(value: string): boolean {
  return value.length > MAX_SEARCH_QUERY_LENGTH;
}

/**
 * Produces the canonical form used for both matching and analytics.
 * Returns an empty string when the input has no searchable characters.
 */
export function normalizeSearchQuery(value: string): string {
  let normalized = value;

  for (const character of INVISIBLE_CHARACTERS) {
    normalized = normalized.split(character).join('');
  }
  for (const [from, to] of NUKTA_REPLACEMENTS) {
    normalized = normalized.split(from).join(to);
  }

  normalized = Array.from(normalized, (character) => BENGALI_DIGIT_MAP.get(character) ?? character)
    .join('')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();

  return normalized;
}

/**
 * Splits a normalized query into AND terms. Whitespace is the separator; edge
 * punctuation is dropped so "গণিত?" behaves like "গণিত". Duplicate terms are
 * removed and the count is capped to keep the generated SQL bounded.
 */
export function tokenizeSearchQuery(value: string): string[] {
  const normalized = normalizeSearchQuery(value);
  if (!normalized) return [];

  const terms: string[] = [];
  const seen = new Set<string>();

  for (const rawTerm of normalized.split(' ')) {
    const term = rawTerm.replace(/^\p{P}+|\p{P}+$/gu, '');
    if (!term || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
    if (terms.length >= MAX_SEARCH_TERMS) break;
  }

  return terms;
}

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function parseSearchType(value: unknown): SearchType | undefined {
  if (value === undefined || value === null || value === '') return 'all';
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return SEARCH_TYPES.find((type) => type === normalized);
}

export function parseSortBy(type: SearchType, value: unknown): SearchSortBy {
  if (typeof value !== 'string') return 'relevance';
  const normalized = value.trim();
  return SORT_FIELDS[type].find((field) => field === normalized) ?? 'relevance';
}

export function parseSortOrder(value: unknown): SortOrder {
  if (typeof value !== 'string') return 'desc';
  return value.trim().toLowerCase() === 'asc' ? 'asc' : 'desc';
}

export function parseSearchLocale(value: unknown): SearchLocale {
  if (typeof value !== 'string') return 'en';
  return value.trim().toLowerCase() === 'bn' ? 'bn' : 'en';
}

export function parseSearchPagination(query: Record<string, unknown>): {
  limit: number;
  offset: number;
} {
  const rawLimit = typeof query.limit === 'string' ? Number(query.limit) : DEFAULT_SEARCH_LIMIT;
  const rawOffset = typeof query.offset === 'string' ? Number(query.offset) : 0;

  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_SEARCH_LIMIT)
    : DEFAULT_SEARCH_LIMIT;
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.trunc(rawOffset), 0) : 0;

  return { limit, offset };
}
