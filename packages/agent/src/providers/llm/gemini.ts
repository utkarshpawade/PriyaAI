import type { ProviderInfo } from '@rvagent/shared';
import type { ToolDefinition } from '../../tools/definitions.js';
import { assertOk, fetchWithRetry, readSseLines, safeJsonParse } from '../http/sse.js';
import type { LlmMessage, LlmProvider, LlmRequest, LlmStreamEvent } from '../types.js';

/**
 * Google Gemini via the Generative Language REST API.
 *
 * Verified against the live reference:
 * `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`,
 * `x-goog-api-key` header, `tools: [{ functionDeclarations: [...] }]`,
 * `systemInstruction: { parts: [{ text }] }`, and responses whose parts carry
 * either `text` or `functionCall: { name, args }`. Function results go back as a
 * `user` turn containing `functionResponse: { name, response }` — Gemini has no
 * dedicated tool role, which is the detail most from-memory implementations get
 * wrong.
 *
 * Default provider for this project: it is fast, cheap, and noticeably better
 * at Hinglish than the alternatives at the same price point.
 */

export interface GeminiOptions {
  apiKey: string;
  model?: string;
}

const DEFAULT_MODEL = 'gemini-2.5-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
}

interface GeminiChunk {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
}

export class GeminiLlmProvider implements LlmProvider {
  readonly info: ProviderInfo;

  constructor(private readonly options: GeminiOptions) {
    this.info = { name: 'Google Gemini', model: options.model ?? DEFAULT_MODEL, mode: 'live' };
  }

  async *stream(request: LlmRequest, signal: AbortSignal): AsyncIterable<LlmStreamEvent> {
    const model = this.options.model ?? DEFAULT_MODEL;
    const url = new URL(`${BASE_URL}/${model}:streamGenerateContent`);
    url.searchParams.set('alt', 'sse');

    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': this.options.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(buildBody(request)),
      },
      signal,
    );
    await assertOk('Gemini', response);
    if (!response.body) {
      yield { type: 'done', finishReason: 'empty' };
      return;
    }

    let finishReason = 'stop';
    let callIndex = 0;

    for await (const data of readSseLines(response.body, signal)) {
      if (data === '[DONE]') break;
      const chunk = safeJsonParse<GeminiChunk>(data);
      const candidate = chunk?.candidates?.[0];
      if (!candidate) continue;

      if (candidate.finishReason) finishReason = candidate.finishReason;

      for (const part of candidate.content?.parts ?? []) {
        if (part.text) yield { type: 'text', text: part.text };
        if (part.functionCall) {
          callIndex += 1;
          yield {
            type: 'tool_call',
            call: {
              id: `gemini-${callIndex}`,
              name: part.functionCall.name,
              args: part.functionCall.args ?? {},
            },
          };
        }
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

function buildBody(request: LlmRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contents: toContents(request.messages),
    systemInstruction: { parts: [{ text: request.system }] },
    generationConfig: {
      temperature: request.temperature ?? 0.6,
      maxOutputTokens: request.maxOutputTokens ?? 400,
    },
  };

  if (request.tools.length > 0) {
    body.tools = [{ functionDeclarations: request.tools.map(toFunctionDeclaration) }];
    body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
  }
  return body;
}

function toFunctionDeclaration(tool: ToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

function toContents(messages: readonly LlmMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: message.toolName ?? 'unknown',
              response: safeJsonParse<Record<string, unknown>>(message.content) ?? {
                result: message.content,
              },
            },
          },
        ],
      };
    }

    if (message.role === 'assistant' && message.toolCalls?.length) {
      const parts: GeminiPart[] = [];
      if (message.content.trim().length > 0) parts.push({ text: message.content });
      for (const call of message.toolCalls) {
        parts.push({ functionCall: { name: call.name, args: call.args } });
      }
      return { role: 'model', parts };
    }

    return {
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    };
  });
}
