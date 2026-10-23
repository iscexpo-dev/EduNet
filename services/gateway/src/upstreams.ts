/**
 * Route-to-service map for the EduNet gateway.
 *
 * The web client uses one origin. Each prefix below belongs to exactly one
 * service; the gateway forwards the original path, query and body unchanged.
 */

export const SERVICE_PORTS = {
  identity: 3001,
  organizations: 3002,
  users: 3003,
  courses: 3004,
  enrollments: 3005,
  assignments: 3006,
  submissions: 3007,
  content: 3008,
  assessments: 3009,
  notifications: 3010,
  parents: 3011,
  search: 3012,
  analytics: 3013,
  engagement: 3014,
  communication: 3015,
  support: 3016,
  platform: 3017,
  ai: 3018,
} as const;

export type ServiceName = keyof typeof SERVICE_PORTS;

export const ROUTE_TO_SERVICE = {
  '/api/auth': 'identity',
  '/api/organizations': 'organizations',
  '/api/users': 'users',
  '/api/courses': 'courses',
  '/api/enrollments': 'enrollments',
  '/api/assignments': 'assignments',
  '/api/submissions': 'submissions',
  '/api/content': 'content',
  '/api/assessments': 'assessments',
  '/api/notifications': 'notifications',
  '/api/parents': 'parents',
  '/api/search': 'search',
  '/api/analytics': 'analytics',
  '/api/engagement': 'engagement',
  '/api/communication': 'communication',
  '/api/support': 'support',
  '/api/platform': 'platform',
  '/api/ai': 'ai',
} as const satisfies Record<string, ServiceName>;

export type RoutePrefix = keyof typeof ROUTE_TO_SERVICE;

export interface Upstream {
  prefix: RoutePrefix;
  service: ServiceName;
  baseUrl: string;
}

export function envKeyFor(service: ServiceName): string {
  return `${service.toUpperCase()}_URL`;
}

export function defaultBaseUrl(service: ServiceName): string {
  return `http://127.0.0.1:${SERVICE_PORTS[service]}`;
}

function pathOnly(originalUrl: string): string {
  const queryIndex = originalUrl.indexOf('?');
  return queryIndex === -1 ? originalUrl : originalUrl.slice(0, queryIndex);
}

/**
 * Resolves the upstream for an original request URL.
 *
 * Matching is segment-aware: `/api/courses` matches `/api/courses` and
 * `/api/courses/123`, but not `/api/courses-archive`. Unknown paths return
 * `undefined` so the gateway answers 404 instead of guessing a service.
 */
export function resolveUpstream(
  originalUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): Upstream | undefined {
  const path = pathOnly(originalUrl);
  const prefix = (Object.keys(ROUTE_TO_SERVICE) as RoutePrefix[]).find(
    (candidate) => path === candidate || path.startsWith(`${candidate}/`),
  );
  if (!prefix) return undefined;

  const service = ROUTE_TO_SERVICE[prefix];
  const configured = env[envKeyFor(service)];
  const baseUrl = (configured && configured.trim()) || defaultBaseUrl(service);
  return { prefix, service, baseUrl: baseUrl.replace(/\/+$/, '') };
}
