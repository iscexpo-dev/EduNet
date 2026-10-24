/**
 * Runtime configuration validation for the standalone web server.
 *
 * Build-time validation in next.config.js guarantees the public API URL is
 * present when producing a container image. This check catches a container
 * started with the wrong runtime environment, which would otherwise emit a CSP
 * that blocks every API call.
 */
export async function register() {
  if (process.env.NODE_ENV !== 'production') return;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!apiUrl) {
    throw new Error('NEXT_PUBLIC_API_URL is required in production');
  }

  let parsed: URL;
  try {
    parsed = new URL(apiUrl);
  } catch {
    throw new Error('NEXT_PUBLIC_API_URL must be a valid absolute URL');
  }

  const loopback = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !loopback) {
    throw new Error('NEXT_PUBLIC_API_URL must use https outside local development');
  }
}
