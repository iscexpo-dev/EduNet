import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Liveness probe for the web container/orchestrator.
 *
 * It intentionally reports only process health: the web app has no database
 * dependency of its own and upstream readiness is probed on the gateway.
 */
export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'web',
    timestamp: new Date().toISOString(),
  });
}
