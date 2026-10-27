import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SEARCH_TERMS,
  escapeLikePattern,
  isSearchQueryTooLong,
  normalizeSearchQuery,
  parseSearchLocale,
  parseSearchPagination,
  parseSearchType,
  parseSortBy,
  parseSortOrder,
  tokenizeSearchQuery,
} from './normalize';

describe('normalizeSearchQuery', () => {
  it('trims, collapses whitespace and lowercases Latin text', () => {
    expect(normalizeSearchQuery('  Intro   TO\tMath  ')).toBe('intro to math');
  });

  it('returns an empty string for blank output', () => {
    expect(normalizeSearchQuery(' \t\n ')).toBe('');
  });

  it('translates Bengali digits to ASCII digits', () => {
    expect(normalizeSearchQuery('শ্রেণী ১০')).toBe('শ্রেণী 10');
    expect(normalizeSearchQuery('০১২৩৪৫৬৭৮৯')).toBe('0123456789');
  });

  it('removes zero-width and soft-hyphen characters', () => {
    expect(normalizeSearchQuery('গণিত\u200B\u200C\u200D\uFEFF\u00AD')).toBe('গণিত');
  });

  it('normalizes precomposed nukta letters to their decomposed form', () => {
    expect(normalizeSearchQuery('\u09DC\u09DD\u09DF')).toBe('\u09A1\u09BC\u09A2\u09BC\u09AF\u09BC');
  });
});

describe('isSearchQueryTooLong', () => {
  it('allows the maximum query length and rejects longer input', () => {
    expect(isSearchQueryTooLong('ক'.repeat(MAX_SEARCH_QUERY_LENGTH))).toBe(false);
    expect(isSearchQueryTooLong('ক'.repeat(MAX_SEARCH_QUERY_LENGTH + 1))).toBe(true);
  });
});

describe('tokenizeSearchQuery', () => {
  it('splits normalized text and trims edge punctuation', () => {
    expect(tokenizeSearchQuery('  বাংলা,   গণিত?  ')).toEqual(['বাংলা', 'গণিত']);
  });

  it('keeps internal punctuation such as emails and C++', () => {
    expect(tokenizeSearchQuery('teacher@example.com C++')).toEqual(['teacher@example.com', 'c++']);
  });

  it('deduplicates terms and caps the term count', () => {
    expect(tokenizeSearchQuery('math math MATH')).toEqual(['math']);

    const query = Array.from({ length: MAX_SEARCH_TERMS + 2 }, (_, index) => `term${index}`).join(
      ' '
    );
    expect(tokenizeSearchQuery(query)).toHaveLength(MAX_SEARCH_TERMS);
  });

  it('returns no terms for punctuation-only or blank input', () => {
    expect(tokenizeSearchQuery('   ')).toEqual([]);
    expect(tokenizeSearchQuery('?!,')).toEqual([]);
  });
});

describe('escapeLikePattern', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLikePattern('50%_off\\now')).toBe('50\\%\\_off\\\\now');
  });
});

describe('parseSearchType', () => {
  it('defaults to all', () => {
    expect(parseSearchType(undefined)).toBe('all');
    expect(parseSearchType('')).toBe('all');
  });

  it('accepts known types case-insensitively', () => {
    expect(parseSearchType(' Courses ')).toBe('courses');
    expect(parseSearchType('USERS')).toBe('users');
    expect(parseSearchType('assignments')).toBe('assignments');
    expect(parseSearchType('organizations')).toBe('organizations');
  });

  it('rejects unknown and non-string values', () => {
    expect(parseSearchType('lessons')).toBeUndefined();
    expect(parseSearchType(['courses'])).toBeUndefined();
  });
});

describe('parseSortBy', () => {
  it('accepts fields supported by the search type', () => {
    expect(parseSortBy('courses', 'title')).toBe('title');
    expect(parseSortBy('users', 'email')).toBe('email');
    expect(parseSortBy('assignments', 'dueDate')).toBe('dueDate');
    expect(parseSortBy('organizations', 'name')).toBe('name');
  });

  it('falls back to relevance for unsupported or missing fields', () => {
    expect(parseSortBy('courses', 'email')).toBe('relevance');
    expect(parseSortBy('courses', undefined)).toBe('relevance');
    expect(parseSortBy('all', 'title')).toBe('relevance');
  });
});

describe('parseSortOrder', () => {
  it('defaults to descending and accepts ascending', () => {
    expect(parseSortOrder(undefined)).toBe('desc');
    expect(parseSortOrder('asc')).toBe('asc');
    expect(parseSortOrder(' ASC ')).toBe('asc');
    expect(parseSortOrder('sideways')).toBe('desc');
  });
});

describe('parseSearchLocale', () => {
  it('defaults to English and accepts Bengali', () => {
    expect(parseSearchLocale(undefined)).toBe('en');
    expect(parseSearchLocale('bn')).toBe('bn');
    expect(parseSearchLocale(' BN ')).toBe('bn');
    expect(parseSearchLocale('fr')).toBe('en');
  });
});

describe('parseSearchPagination', () => {
  it('applies defaults', () => {
    expect(parseSearchPagination({})).toEqual({ limit: DEFAULT_SEARCH_LIMIT, offset: 0 });
  });

  it('clamps and truncates limits', () => {
    expect(parseSearchPagination({ limit: '5', offset: '10' })).toEqual({
      limit: 5,
      offset: 10,
    });
    expect(parseSearchPagination({ limit: '9999' })).toEqual({
      limit: MAX_SEARCH_LIMIT,
      offset: 0,
    });
    expect(parseSearchPagination({ limit: '0' }).limit).toBe(1);
    expect(parseSearchPagination({ limit: '12.9', offset: '3.9' })).toEqual({
      limit: 12,
      offset: 3,
    });
  });

  it('falls back for invalid input and never returns a negative offset', () => {
    expect(parseSearchPagination({ limit: 'many', offset: 'Infinity' })).toEqual({
      limit: DEFAULT_SEARCH_LIMIT,
      offset: 0,
    });
    expect(parseSearchPagination({ offset: '-10' }).offset).toBe(0);
  });
});
