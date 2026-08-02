import { AGENT_SAMPLE_RATE, bufferToPcm16, type Language, type ProviderInfo } from '@rvagent/shared';
import { assertOk, fetchWithRetry, readBytes } from '../http/sse.js';
import type { TtsProvider } from '../types.js';

/**
 * ElevenLabs streaming text-to-speech.
 *
 * Verified against the live reference: `POST /v1/text-to-speech/{voice_id}/stream`,
 * `xi-api-key` header, `output_format=pcm_24000` for raw 24 kHz PCM16 that needs
 * no resampling, and `model_id=eleven_flash_v2_5` — the low-latency multilingual
 * model, which is the only reason to pick ElevenLabs over Sarvam here.
 *
 * `optimize_streaming_latency` is set to 3: it trades a little prosody quality
 * for a materially earlier first byte, which is the right trade in a live call.
 */

export interface ElevenLabsOptions {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  optimizeStreamingLatency?: number;
}

const DEFAULT_MODEL = 'eleven_flash_v2_5';
const BASE_URL = 'https://api.elevenlabs.io/v1/text-to-speech';

const LANGUAGE_CODES: Record<Language, string> = { hi: 'hi', 'hi-en': 'hi', en: 'en' };

export class ElevenLabsTtsProvider implements TtsProvider {
  readonly info: ProviderInfo;
  readonly synthesizesServerSide = true;

  constructor(private readonly options: ElevenLabsOptions) {
    this.info = {
      name: 'ElevenLabs',
      model: options.modelId ?? DEFAULT_MODEL,
      mode: 'live',
    };
  }

  async *synthesize(
    text: string,
    language: Language,
    signal: AbortSignal,
  ): AsyncIterable<Int16Array> {
    const url = new URL(`${BASE_URL}/${this.options.voiceId}/stream`);
    url.searchParams.set('output_format', `pcm_${AGENT_SAMPLE_RATE}`);
    url.searchParams.set(
      'optimize_streaming_latency',
      String(this.options.optimizeStreamingLatency ?? 3),
    );

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'xi-api-key': this.options.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: this.options.modelId ?? DEFAULT_MODEL,
        language_code: LANGUAGE_CODES[language],
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
          style: 0.15,
          use_speaker_boost: true,
          speed: 1.0,
        },
        apply_text_normalization: 'auto',
      }),
    }, signal);
    await assertOk('ElevenLabs', response);
    if (!response.body) return;

    // pcm_24000 is raw little-endian PCM16 with no container, but chunk
    // boundaries can land mid-sample, so a carry byte is required.
    let carry: Uint8Array | null = null;

    for await (const chunk of readBytes(response.body, signal)) {
      const joined: Uint8Array = carry ? concatBytes(carry, chunk) : chunk;
      const usableLength: number = joined.length - (joined.length % 2);
      carry = usableLength < joined.length ? joined.subarray(usableLength) : null;
      if (usableLength === 0) continue;
      yield bufferToPcm16(Buffer.from(joined.buffer, joined.byteOffset, usableLength));
    }
  }
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array {
  const out = new Uint8Array(first.length + second.length);
  out.set(first, 0);
  out.set(second, first.length);
  return out;
}
