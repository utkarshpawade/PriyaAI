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
