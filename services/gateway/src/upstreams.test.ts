import { describe, expect, it } from 'vitest';
import { ROUTE_TO_SERVICE, defaultBaseUrl, resolveUpstream } from './upstreams';

describe('gateway route resolution', () => {
  it('maps every documented prefix to a distinct service', () => {
    const services = Object.values(ROUTE_TO_SERVICE);
    expect(new Set(services).size).toBe(services.length);
    expect(Object.keys(ROUTE_TO_SERVICE)).toHaveLength(18);
  });

  it('resolves a prefix and nested path', () => {
    expect(resolveUpstream('/api/ai/conversations/123', {} as NodeJS.ProcessEnv)).toMatchObject({
      prefix: '/api/ai',
      service: 'ai',
      baseUrl: defaultBaseUrl('ai'),
    });
    expect(resolveUpstream('/api/courses/abc/lessons?limit=10', {} as NodeJS.ProcessEnv)).toMatchObject({
      prefix: '/api/courses',
      service: 'courses',
    });
  });

  it('is segment-aware and rejects lookalike prefixes', () => {
    expect(resolveUpstream('/api/courses-archive', {} as NodeJS.ProcessEnv)).toBeUndefined();
    expect(resolveUpstream('/api/unknown', {} as NodeJS.ProcessEnv)).toBeUndefined();
    expect(resolveUpstream('/health', {} as NodeJS.ProcessEnv)).toBeUndefined();
  });

  it('honours per-service environment overrides without a trailing slash', () => {
    const upstream = resolveUpstream('/api/ai/messages', {
      AI_URL: 'https://ai.internal.example/',
    } as NodeJS.ProcessEnv);
    expect(upstream?.baseUrl).toBe('https://ai.internal.example');
  });

  it('ignores blank overrides and falls back to the local port', () => {
    const upstream = resolveUpstream('/api/platform/flags', {
      PLATFORM_URL: '   ',
    } as NodeJS.ProcessEnv);
    expect(upstream?.baseUrl).toBe(defaultBaseUrl('platform'));
    expect(defaultBaseUrl('platform')).toBe('http://127.0.0.1:3017');
  });
});
