import { describe, it, expect } from 'vitest';
import {
  canAccessOrganization,
  parsePagination,
  sanitizeOrganizationUpdate,
} from './policy';

describe('parsePagination', () => {
  it('defaults and clamps', () => {
    expect(parsePagination({})).toEqual({ limit: 50, offset: 0 });
    expect(parsePagination({ limit: '999', offset: '-1' })).toEqual({ limit: 200, offset: 0 });
    expect(parsePagination({ limit: 'nope' }).limit).toBe(50);
  });
});

describe('sanitizeOrganizationUpdate', () => {
  it('accepts whitelisted fields', () => {
    expect(sanitizeOrganizationUpdate({ name: ' School ', isActive: false })).toEqual({
      name: 'School',
      isActive: false,
    });
  });

  it('drops server-managed fields', () => {
    expect(
      sanitizeOrganizationUpdate({ name: 'School', code: 'hijack', type: 'district', id: 'x' }),
    ).toEqual({ name: 'School' });
  });

  it('rejects invalid input', () => {
    expect(() => sanitizeOrganizationUpdate(null)).toThrow();
    expect(() => sanitizeOrganizationUpdate({})).toThrow();
    expect(() => sanitizeOrganizationUpdate({ name: '' })).toThrow();
    expect(() => sanitizeOrganizationUpdate({ isActive: 'true' })).toThrow();
    expect(() => sanitizeOrganizationUpdate({ address: 'x'.repeat(501) })).toThrow();
  });
});

describe('canAccessOrganization', () => {
  it('allows only the caller organization', () => {
    expect(canAccessOrganization('org-1', 'org-1')).toBe(true);
    expect(canAccessOrganization('org-1', 'org-2')).toBe(false);
    expect(canAccessOrganization(undefined, 'org-1')).toBe(false);
  });
});
