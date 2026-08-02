import type { ProviderInfo } from '@rvagent/shared';
import { assertOk, fetchWithRetry, readSseLines, safeJsonParse } from '../http/sse.js';
import type { LlmMessage, LlmProvider, LlmRequest, LlmStreamEvent } from '../types.js';

/**
 * Streaming client for the OpenAI Chat Completions wire format.
 *
 * Shared by the OpenAI and Groq adapters, which differ only in base URL, model
 * and the name of the output-token field. Duplicating the streaming tool-call
 * reassembly into two files would mean fixing the same fragmentation bug twice.
 */

export interface OpenAiCompatibleConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  info: ProviderInfo;
  /**
   * Groq deprecated `max_tokens` in favour of `max_completion_tokens`; OpenAI
   * still expects the former on this endpoint.
   */
  maxTokensField: 'max_tokens' | 'max_completion_tokens';
}

interface ChatDelta {
  content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface ChatChunk {
  choices?: Array<{ delta?: ChatDelta; finish_reason?: string | null }>;
  error?: { message?: string };
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly info: ProviderInfo;

  constructor(private readonly config: OpenAiCompatibleConfig) {
    this.info = config.info;
  }

  async *stream(request: LlmRequest, signal: AbortSignal): AsyncIterable<LlmStreamEvent> {
    const response = await fetchWithRetry(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        stream: true,
        temperature: request.temperature ?? 0.6,
        [this.config.maxTokensField]: request.maxOutputTokens ?? 400,
        messages: [{ role: 'system', content: request.system }, ...toMessages(request.messages)],
        ...(request.tools.length > 0
          ? {
              tools: request.tools.map((tool) => ({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.parameters,
                },
              })),
              tool_choice: 'auto',
              // One tool per turn keeps the conversation legible and stops the
              // model batching a lookup with a write it has not justified yet.
              parallel_tool_calls: false,
            }
          : {}),
      }),
    }, signal);
    await assertOk(this.info.name, response);
    if (!response.body) {
      yield { type: 'done', finishReason: 'empty' };
      return;
    }

    // Tool calls arrive fragmented: `index` identifies the call, `id` and
    // `function.name` appear once, and `function.arguments` dribbles in as JSON
    // text across many chunks. Parsing a half-written object is the classic bug,
    // so calls are accumulated by index and only emitted once the stream ends.
    const partialCalls = new Map<number, { id: string; name: string; args: string }>();
    let finishReason = 'stop';

    for await (const data of readSseLines(response.body, signal)) {
      if (data === '[DONE]') break;
      const chunk = safeJsonParse<ChatChunk>(data);
      if (chunk?.error?.message) {
        throw new Error(`${this.info.name}: ${chunk.error.message}`);
      }

      const choice = chunk?.choices?.[0];
      if (!choice) continue;

      if (choice.finish_reason) finishReason = choice.finish_reason;
      if (choice.delta?.content) yield { type: 'text', text: choice.delta.content };

      for (const fragment of choice.delta?.tool_calls ?? []) {
        const existing = partialCalls.get(fragment.index) ?? { id: '', name: '', args: '' };
        partialCalls.set(fragment.index, {
          id: fragment.id ?? existing.id,
          name: fragment.function?.name ?? existing.name,
          args: existing.args + (fragment.function?.arguments ?? ''),
        });
      }
    }

    for (const [index, call] of [...partialCalls.entries()].sort((a, b) => a[0] - b[0])) {
      if (call.name.length === 0) continue;
      yield {
        type: 'tool_call',
        call: {
          id: call.id || `${this.info.name.toLowerCase()}-${index}`,
          name: call.name,
          args: safeJsonParse<Record<string, unknown>>(call.args || '{}') ?? {},
        },
      };
    }

    yield { type: 'done', finishReason };
  }

  async complete(request: LlmRequest, signal?: AbortSignal): Promise<string> {
    const controller = new AbortController();
    signal?.addEventListener('abort', () => controller.abort(), { once: true });

    let text = '';
    for await (const event of this.stream(request, controller.signal)) {
      if (event.type === 'text') text += event.text;
    }
    return text;
  }
}

function toMessages(messages: readonly LlmMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.args) },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}
