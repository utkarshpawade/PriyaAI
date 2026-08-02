import { OpenAiCompatibleProvider } from './openai-compatible.js';

/**
 * OpenAI Chat Completions.
 *
 * A thin binding over the shared OpenAI-compatible client; the streaming and
 * tool-call reassembly logic lives there because Groq speaks the same wire
 * format.
 */

export interface OpenAiOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export class OpenAiLlmProvider extends OpenAiCompatibleProvider {
  constructor(options: OpenAiOptions) {
    const model = options.model ?? DEFAULT_MODEL;
    super({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      model,
      info: { name: 'OpenAI', model, mode: 'live' },
      maxTokensField: 'max_tokens',
    });
  }
}
