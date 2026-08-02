/**
 * Minimal Server-Sent Events reader.
 *
 * All three LLM adapters stream SSE and none of them needs the full spec
 * (no retry, no event ids), so a 40-line reader beats pulling in a dependency
 * whose reconnect logic would fight our AbortController-driven barge-in.
 */
export async function* readSseLines(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      if (signal.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        buffer = buffer.slice(newlineIndex + 1);
        if (line.startsWith('data:')) yield line.slice(5).trim();
        newlineIndex = buffer.indexOf('\n');
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith('data:')) yield tail.slice(5).trim();
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

/** Streams raw bytes from a fetch response body. */
export async function* readBytes(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      if (signal.aborted) return;
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

/** Status codes worth retrying: rate limits and transient upstream failures. */
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

/**
 * One retry, and never more than a three-second pause.
 *
 * The whole retry budget has to fit inside the orchestrator's generation cap,
 * or the retry is worse than useless: it burns the turn and the caller hears
 * nothing at all. Measured against Groq's free tier, a longer budget produced
 * turns that aborted at exactly the cap with no speech, where a short budget
 * degrades to the offline responder and the caller still gets an answer.
 */
const MAX_ATTEMPTS = 2;
const MAX_BACKOFF_MS = 3_000;

/**
 * `fetch` with bounded retry on rate limits and transient errors.
 *
 * Free and low tiers rate-limit aggressively — Groq's free tier is 8000 tokens
 * per minute, which a system prompt plus tool schemas can exhaust in two turns —
 * and a 429 that surfaces as a dead turn is the worst possible demo failure.
 * The provider's own `retry-after` hint is honoured when present, since it knows
 * exactly when the window reopens.
 *
 * Aborts win immediately: barge-in must never be delayed by a pending retry.
 */
export async function fetchWithRetry(
  url: string | URL,
  init: RequestInit,
  signal: AbortSignal,
): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const response = await fetch(url, { ...init, signal });
    if (response.ok || !RETRYABLE_STATUS.has(response.status) || attempt === MAX_ATTEMPTS) {
      return response;
    }

    lastResponse = response;
    const waitMs = retryDelayMs(response, attempt, await response.clone().text().catch(() => ''));
    await sleep(waitMs, signal);
  }

  return lastResponse as Response;
}

/** Prefers the server's own hint, then the message body, then exponential backoff. */
function retryDelayMs(response: Response, attempt: number, body: string): number {
  const header = response.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, MAX_BACKOFF_MS);
  }

  // Groq embeds "Please try again in 17.295s" in the error message.
  const hinted = /try again in ([\d.]+)s/i.exec(body)?.[1];
  if (hinted) return Math.min(Number(hinted) * 1000, MAX_BACKOFF_MS);

  return Math.min(2 ** (attempt - 1) * 500, MAX_BACKOFF_MS);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export class ProviderHttpError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    body: string,
  ) {
    super(`${provider} responded ${status}: ${body.slice(0, 400)}`);
    this.name = 'ProviderHttpError';
  }
}

export async function assertOk(provider: string, response: Response): Promise<void> {
  if (response.ok) return;
  const body = await response.text().catch(() => '');
  throw new ProviderHttpError(provider, response.status, body);
}

export function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
