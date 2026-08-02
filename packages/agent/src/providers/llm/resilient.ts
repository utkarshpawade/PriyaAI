import type { ProviderInfo } from '@rvagent/shared';
import type { LlmProvider, LlmRequest, LlmStreamEvent } from '../types.js';

/**
 * Wraps a live LLM and falls back to a second provider when it fails.
 *
 * This is the provider-interface architecture paying for itself. On a free tier
 * a rate limit is not an edge case — Groq allows 8000 tokens per minute and a
 * single turn costs ~2.8k — and the alternative to falling back is the agent
 * going silent mid-call, which is the worst possible outcome in a live demo.
 * Degrading to the deterministic rule-based responder keeps the conversation,
 * the slot extraction and the guardrails all working; only the phrasing gets
 * less fluent.
 *
 * The fallback only fires if the primary failed *before emitting anything*.
 * Once tokens are on the wire, switching would duplicate half a sentence.
 */
export class ResilientLlmProvider implements LlmProvider {
  constructor(
    private readonly primary: LlmProvider,
    private readonly fallback: LlmProvider,
    private readonly onFallback?: (error: Error) => void,
  ) {}

  get info(): ProviderInfo {
    return this.primary.info;
  }

  async *stream(request: LlmRequest, signal: AbortSignal): AsyncIterable<LlmStreamEvent> {
    let emitted = false;

    try {
      for await (const event of this.primary.stream(request, signal)) {
        emitted = true;
        yield event;
      }
      return;
    } catch (error) {
      // A barge-in abort is not a provider failure; let it propagate.
      if (signal.aborted) return;
      if (emitted) throw error;
      this.onFallback?.(error instanceof Error ? error : new Error(String(error)));
    }

    yield* this.fallback.stream(request, signal);
  }

  async complete(request: LlmRequest, signal?: AbortSignal): Promise<string> {
    try {
      return await this.primary.complete(request, signal);
    } catch (error) {
      if (signal?.aborted) return '';
      this.onFallback?.(error instanceof Error ? error : new Error(String(error)));
      // An empty string makes the summarizer take its deterministic template
      // path, which is exactly the right degradation here.
      return '';
    }
  }
}
