import { OpenAiCompatibleProvider } from './openai-compatible.js';

/**
 * Groq — the default LLM for this project.
 *
 * Groq serves an OpenAI-compatible endpoint at `https://api.groq.com/openai/v1`,
 * so it reuses the shared chat-completions client. What it buys is inference
 * speed: token throughput on their LPUs is high enough that `llmFirstTokenMs`
 * stops being a meaningful part of the latency budget, which matters more in a
 * live phone call than raw model quality does.
 *
 * Model choice, verified against the live `/models` endpoint on this account:
 * the Llama models (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`) were
 * deprecated in June 2026 with migration pointed at the `gpt-oss` family.
 * `openai/gpt-oss-20b` is the default here — in side-by-side tool-calling tests
 * on Hinglish input it converted "75 lakh" to 7500000 correctly where the 120b
 * variant returned 75.
 */

export interface GroqOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'openai/gpt-oss-20b';
const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

export class GroqLlmProvider extends OpenAiCompatibleProvider {
  constructor(options: GroqOptions) {
    const model = options.model ?? DEFAULT_MODEL;
    super({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      model,
      info: { name: 'Groq', model, mode: 'live' },
      // Groq deprecated `max_tokens` on this endpoint.
      maxTokensField: 'max_completion_tokens',
    });
  }
}
