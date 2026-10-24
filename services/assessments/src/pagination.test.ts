import { describe, it, expect } from 'vitest';
import { parsePagination } from './pagination';

describe('parsePagination', () => {
  it('applies defaults when no query parameters are provided', () => {
    expect(parsePagination({ query: {} })).toEqual({ limit: 50, offset: 0 });
  });

  it('reads numeric query parameters', () => {
    expect(parsePagination({ query: { limit: '25', offset: '10' } })).toEqual({
      limit: 25,
      offset: 10,
    });
  });

  it('clamps the limit to the configured maximum', () => {
    expect(parsePagination({ query: { limit: '100000' } }, 50, 200)).toEqual({
      limit: 200,
      offset: 0,
    });
  });

  it('never returns a limit below one', () => {
    expect(parsePagination({ query: { limit: '0' } }).limit).toBe(1);
    expect(parsePagination({ query: { limit: '-5' } }).limit).toBe(1);
  });

  it('falls back to the default for non-numeric input', () => {
    expect(parsePagination({ query: { limit: 'abc' } }).limit).toBe(50);
    expect(parsePagination({ query: { offset: 'Infinity' } }).offset).toBe(0);
  });

  it('never returns a negative offset and truncates fractions', () => {
    expect(parsePagination({ query: { offset: '-10' } }).offset).toBe(0);
    expect(parsePagination({ query: { limit: '12.9', offset: '3.9' } })).toEqual({
      limit: 12,
      offset: 3,
    });
  });

  it('honours a custom default limit', () => {
    expect(parsePagination({ query: {} }, 10, 20).limit).toBe(10);
  });
});
