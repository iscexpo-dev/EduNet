/**
 * Content-Security-Policy construction shared by proxy and tests.
 *
 * Next.js injects inline bootstrap scripts; a nonce lets production run
 * without `script-src 'unsafe-inline'`. Styles keep `unsafe-inline` because
 * Next/Tailwind emit inline style attributes, and the app loads Bengali fonts
 * from Google Fonts. Development additionally needs eval for React refresh.
 */

export interface CspOptions {
  nonce: string;
  apiOrigin?: string;
  development?: boolean;
}

export function buildContentSecurityPolicy(options: CspOptions): string {
  const { nonce, apiOrigin, development = false } = options;

  const scriptSrc = development
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const connectSrc = ["'self'", apiOrigin].filter(Boolean).join(' ');

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src ${connectSrc}`,
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(development ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

export function apiOriginFromUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.origin;
  } catch {
    return undefined;
  }
}
