/**
 * Client-visible endpoints for the voice server.
 *
 * The voice server is deployed separately from this app (it holds WebSockets,
 * which serverless cannot), so its URL is configuration rather than a relative
 * path. Defaults point at the local `pnpm dev` port so nothing needs setting up.
 */
export const VOICE_WS_URL =
  process.env.NEXT_PUBLIC_VOICE_WS_URL?.replace(/\/$/, '') ?? 'ws://localhost:8787';

export const VOICE_HTTP_URL =
  process.env.NEXT_PUBLIC_VOICE_HTTP_URL?.replace(/\/$/, '') ?? 'http://localhost:8787';

/** Server-to-server base URL; inside Docker this differs from the public one. */
export const VOICE_INTERNAL_URL =
  process.env.VOICE_SERVER_URL?.replace(/\/$/, '') ?? VOICE_HTTP_URL;

export const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN;

export function browserSocketUrl(): string {
  return `${VOICE_WS_URL}/ws`;
}
