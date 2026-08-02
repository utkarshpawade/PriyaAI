import type { ProviderInfo } from '@rvagent/shared';
import { assertOk, fetchWithRetry, readSseLines, safeJsonParse } from '../http/sse.js';
import type { LlmMessage, LlmProvider, LlmRequest, LlmStreamEvent } from '../types.js';

/**
 * Anthropic Messages API.
 *
 * Verified against the live reference: `POST https://api.anthropic.com/v1/messages`
 * with `x-api-key` and `anthropic-version: 2023-06-01`, tools declared as
 * `{ name, description, input_schema }`, and results returned as a **user**
 * message containing `{ type: "tool_result", tool_use_id, content }`.
 *
 * Streaming arrives as indexed content blocks: a `tool_use` block opens with its
 * name and id, then its arguments stream in as `input_json_delta.partial_json`
 * fragments that only parse once the block closes.
 */

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';
const API_VERSION = '2023-06-01';

interface AnthropicEvent {
  type?: string;
  index?: number;
  content_block?: { type?: string; id?: string; name?: string; text?: string };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string;
  };
}

interface OpenBlock {
  type: 'text' | 'tool_use';
  id: string;
  name: string;
  json: string;
}

export class AnthropicLlmProvider implements LlmProvider {
  readonly info: ProviderInfo;

  constructor(private readonly options: AnthropicOptions) {
    this.info = { name: 'Anthropic Claude', model: options.model ?? DEFAULT_MODEL, mode: 'live' };
  }

  async *stream(request: LlmRequest, signal: AbortSignal): AsyncIterable<LlmStreamEvent> {
    const response = await fetchWithRetry(`${this.options.baseUrl ?? DEFAULT_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.options.apiKey,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.options.model ?? DEFAULT_MODEL,
        max_tokens: request.maxOutputTokens ?? 400,
        temperature: request.temperature ?? 0.6,
        stream: true,
        system: request.system,
        messages: toMessages(request.messages),
        ...(request.tools.length > 0
          ? {
              tools: request.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.parameters,
              })),
              tool_choice: { type: 'auto' },
            }
          : {}),
      }),
    }, signal);
    await assertOk('Anthropic', response);
    if (!response.body) {
      yield { type: 'done', finishReason: 'empty' };
      return;
    }

    const blocks = new Map<number, OpenBlock>();
    let finishReason = 'stop';

    for await (const data of readSseLines(response.body, signal)) {
      const event = safeJsonParse<AnthropicEvent>(data);
      if (!event?.type) continue;

      switch (event.type) {
        case 'content_block_start': {
          const block = event.content_block;
          if (event.index == null || !block) break;
          blocks.set(event.index, {
            type: block.type === 'tool_use' ? 'tool_use' : 'text',
            id: block.id ?? `anthropic-${event.index}`,
            name: block.name ?? '',
            json: '',
          });
          if (block.type !== 'tool_use' && block.text) {
            yield { type: 'text', text: block.text };
          }
          break;
        }

        case 'content_block_delta': {
          if (event.delta?.type === 'text_delta' && event.delta.text) {
            yield { type: 'text', text: event.delta.text };
            break;
          }
          if (event.delta?.type === 'input_json_delta' && event.index != null) {
            const block = blocks.get(event.index);
            if (block) block.json += event.delta.partial_json ?? '';
          }
          break;
        }

        case 'content_block_stop': {
          if (event.index == null) break;
          const block = blocks.get(event.index);
          blocks.delete(event.index);
          if (!block || block.type !== 'tool_use') break;
          yield {
            type: 'tool_call',
            call: {
              id: block.id,
              name: block.name,
              args: safeJsonParse<Record<string, unknown>>(block.json || '{}') ?? {},
            },
          };
          break;
        }

        case 'message_delta': {
          if (event.delta?.stop_reason) finishReason = event.delta.stop_reason;
          break;
        }

        case 'message_stop':
          break;
      }
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
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.toolCallId ?? 'unknown',
            content: message.content,
          },
        ],
      };
    }

    if (message.role === 'assistant' && message.toolCalls?.length) {
      const content: Array<Record<string, unknown>> = [];
      if (message.content.trim().length > 0) {
        content.push({ type: 'text', text: message.content });
      }
      for (const call of message.toolCalls) {
        content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.args });
      }
      return { role: 'assistant', content };
    }

    return { role: message.role, content: message.content };
  });
}
