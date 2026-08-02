import {
  AGENT_SAMPLE_RATE,
  FRAME_MS,
  bufferToPcm16,
  decodeWav,
  resamplePcm16,
  type Language,
  type ProviderInfo,
} from '@rvagent/shared';
import { assertOk } from '../http/sse.js';
import type { TtsProvider } from '../types.js';

/**
 * Sarvam Bulbul text-to-speech.
 *
 * Verified against the live Sarvam reference: `POST https://api.sarvam.ai/text-to-speech`,
 * `api-subscription-key` header, body `{ text, language_code, speaker, model,
 * speech_sample_rate }`, responding `{ request_id, audios: [base64 wav] }`.
 * Note `language_code` — not `target_language_code`, which is what the older
 * examples floating around use and what a from-memory implementation would have
 * sent.
 *
 * The endpoint returns a complete clip rather than a stream, so the adapter
 * re-chunks it into 20 ms frames on a real-time cadence. The orchestrator
 * already synthesises sentence by sentence, so time-to-first-audio is one short
 * sentence of synthesis rather than the whole reply.
 */

export interface SarvamTtsOptions {
  apiKey: string;
  model?: string;
  speaker?: string;
  endpoint?: string;
  pace?: number;
}

const DEFAULT_MODEL = 'bulbul:v2';
const DEFAULT_SPEAKER = 'anushka';
const DEFAULT_ENDPOINT = 'https://api.sarvam.ai/text-to-speech';
/** Bulbul v2 rejects anything longer; the orchestrator chunks well below this. */
const MAX_CHARS = 1_500;

const LANGUAGE_CODES: Record<Language, string> = {
  hi: 'hi-IN',
  'hi-en': 'hi-IN',
  en: 'en-IN',
};

export class SarvamTtsProvider implements TtsProvider {
  readonly info: ProviderInfo;
  readonly synthesizesServerSide = true;

  constructor(private readonly options: SarvamTtsOptions) {
    this.info = {
      name: 'Sarvam Bulbul',
      model: `${options.model ?? DEFAULT_MODEL} / ${options.speaker ?? DEFAULT_SPEAKER}`,
      mode: 'live',
    };
  }

  async *synthesize(
    text: string,
    language: Language,
    signal: AbortSignal,
  ): AsyncIterable<Int16Array> {
    const response = await fetch(this.options.endpoint ?? DEFAULT_ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'api-subscription-key': this.options.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: text.slice(0, MAX_CHARS),
        language_code: LANGUAGE_CODES[language],
        speaker: this.options.speaker ?? DEFAULT_SPEAKER,
        model: this.options.model ?? DEFAULT_MODEL,
        speech_sample_rate: AGENT_SAMPLE_RATE,
        pace: this.options.pace ?? 1.0,
        enable_preprocessing: true,
      }),
    });
    await assertOk('Sarvam TTS', response);

    const payload = (await response.json()) as { audios?: string[] };
    for (const base64 of payload.audios ?? []) {
      if (signal.aborted) return;
      yield* emitFrames(Buffer.from(base64, 'base64'), signal);
    }
  }
}

/** Splits a decoded clip into 20 ms frames, resampling if the API ignored our rate. */
async function* emitFrames(clip: Buffer, signal: AbortSignal): AsyncGenerator<Int16Array> {
  const decoded = decodeWav(clip);
  const samples =
    decoded.sampleRate > 0 && decoded.sampleRate !== AGENT_SAMPLE_RATE
      ? resamplePcm16(decoded.samples, decoded.sampleRate, AGENT_SAMPLE_RATE)
      : decoded.samples.length > 0
        ? decoded.samples
        : bufferToPcm16(clip);

  const frameSamples = (AGENT_SAMPLE_RATE * FRAME_MS) / 1000;
  for (let offset = 0; offset < samples.length; offset += frameSamples) {
    if (signal.aborted) return;
    yield samples.subarray(offset, Math.min(offset + frameSamples, samples.length));
  }
}
