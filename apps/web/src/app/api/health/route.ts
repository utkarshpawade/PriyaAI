import { NextResponse } from 'next/server';
import { VOICE_INTERNAL_URL } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Proxies the voice server's health endpoint so the browser can read it without
 * a second CORS origin, and so the dashboard degrades gracefully when the
 * realtime server is not running.
 */
export async function GET() {
  try {
    const response = await fetch(`${VOICE_INTERNAL_URL}/healthz`, {
      signal: AbortSignal.timeout(3_000),
      cache: 'no-store',
    });
    if (!response.ok) {
      return NextResponse.json(
        { reachable: false, error: `Voice server replied ${response.status}.` },
        { status: 200 },
      );
    }
    return NextResponse.json({ reachable: true, ...(await response.json()) });
  } catch {
    return NextResponse.json({
      reachable: false,
      error: `Voice server not reachable at ${VOICE_INTERNAL_URL}. Start it with \`pnpm dev\`.`,
    });
  }
}
