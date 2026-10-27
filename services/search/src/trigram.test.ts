import { afterEach, describe, expect, it, vi } from 'vitest';
import { trigramEnabled } from './db';

describe('trigramEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to disabled when SEARCH_USE_TRIGRAM is unset', () => {
    vi.stubEnv('SEARCH_USE_TRIGRAM', undefined);
    expect(trigramEnabled()).toBe(false);
  });

  it('is enabled for SEARCH_USE_TRIGRAM=true', () => {
    vi.stubEnv('SEARCH_USE_TRIGRAM', 'true');
    expect(trigramEnabled()).toBe(true);
  });

  it('is disabled for any other value', () => {
    vi.stubEnv('SEARCH_USE_TRIGRAM', 'false');
    expect(trigramEnabled()).toBe(false);
    vi.stubEnv('SEARCH_USE_TRIGRAM', '1');
    expect(trigramEnabled()).toBe(false);
  });
});
