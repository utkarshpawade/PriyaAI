import type { ProviderInfo } from '@rvagent/shared';
import { assertOk, readSseLines, safeJsonParse } from '../http/sse.js';
import type { LlmMessage, LlmProvider, LlmRequest, LlmStreamEvent } from '../types.js';

/**
 * OpenAI Chat Completions.
 *
 * Streaming tool calls arrive fragmented: `delta.tool_calls[]` carries an
 * `index`, the `id` and `function.name` appear once, and `function.arguments`
 * dribbles in as JSON text across many chunks. They are therefore accumulated
 * by index and only emitted once the stream finishes — parsing a half-written
 * argument object is the classic bug here.
 */

export interface OpenAiOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

interface OpenAiDelta {
  content?: string | null;
  tool_calls?: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface OpenAiChunk {
  choices?: Array<{ delta?: OpenAiDelta; finish_reason?: string | null }>;
}

export class OpenAiLlmProvider implements LlmProvider {
  readonly info: ProviderInfo;

  constructor(private readonly options: OpenAiOptions) {
    this.info = { name: 'OpenAI', model: options.model ?? DEFAULT_MODEL, mode: 'live' };
  }

  async *stream(request: LlmRequest, signal: AbortSignal): AsyncIterable<LlmStreamEvent> {
    const response = await fetch(`${this.options.baseUrl ?? DEFAULT_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.options.model ?? DEFAULT_MODEL,
        stream: true,
        temperature: request.temperature ?? 0.6,
        max_tokens: request.maxOutputTokens ?? 400,
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
            }
          : {}),
      }),
    });
    await assertOk('OpenAI', response);
    if (!response.body) {
      yield { type: 'done', finishReason: 'empty' };
      return;
    }

    const partialCalls = new Map<number, { id: string; name: string; args: string }>();
    let finishReason = 'stop';

    for await (const data of readSseLines(response.body, signal)) {
      if (data === '[DONE]') break;
      const chunk = safeJsonParse<OpenAiChunk>(data);
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
          id: call.id || `openai-${index}`,
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
