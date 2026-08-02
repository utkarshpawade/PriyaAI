import { AGENT_SAMPLE_RATE, FRAME_MS, type Language, type ProviderInfo } from '@rvagent/shared';
import type { TtsProvider } from '../types.js';

/**
 * Zero-credential TTS.
 *
 * Emits a quiet, slowly-modulated tone for exactly as long as the text would
 * take to speak, streamed in 20 ms frames at a real-time cadence. That makes
 * the mock useful rather than decorative: barge-in, the client's jitter buffer
 * and the "agent is speaking" state all behave the way they will with a live
 * voice, because the timing is the same.
 */

/** Indian sales-call pace, measured across the phrasebook. */
const WORDS_PER_MINUTE = 150;
const MIN_UTTERANCE_MS = 400;
const TONE_HZ = 210;
const TONE_AMPLITUDE = 0.045;

export interface MockTtsOptions {
  /** Set false in tests so a 4-second utterance does not take 4 seconds. */
  realtime?: boolean;
  /** Emit digital silence instead of a tone. */
  silent?: boolean;
}

export class MockTtsProvider implements TtsProvider {
  readonly info: ProviderInfo = { name: 'MockTTS', model: 'tone-generator', mode: 'mock' };
  readonly synthesizesServerSide = true;

  private readonly realtime: boolean;
  private readonly silent: boolean;

  constructor(options: MockTtsOptions = {}) {
    this.realtime = options.realtime ?? true;
    this.silent = options.silent ?? false;
  }

  async *synthesize(
    text: string,
    _language: Language,
    signal: AbortSignal,
  ): AsyncIterable<Int16Array> {
    const totalMs = estimateSpeechMs(text);
    const frameSamples = (AGENT_SAMPLE_RATE * FRAME_MS) / 1000;
    const frameCount = Math.ceil(totalMs / FRAME_MS);
    let phase = 0;

    for (let index = 0; index < frameCount; index += 1) {
      if (signal.aborted) return;

      const frame = new Int16Array(frameSamples);
      if (!this.silent) {
        // A gentle envelope at the start and end keeps the tone from clicking.
        const envelope = Math.min(1, Math.min(index, frameCount - index - 1) / 5);
        for (let sample = 0; sample < frameSamples; sample += 1) {
          frame[sample] = Math.round(
            Math.sin(phase) * TONE_AMPLITUDE * envelope * 32_767,
          );
          phase += (2 * Math.PI * TONE_HZ) / AGENT_SAMPLE_RATE;
        }
      }

      yield frame;
      if (this.realtime) await sleep(FRAME_MS, signal);
    }
  }
}

export function estimateSpeechMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(MIN_UTTERANCE_MS, Math.round((words / WORDS_PER_MINUTE) * 60_000));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Browser-side speech synthesis.
 *
 * Produces no server audio at all; the orchestrator notices
 * `synthesizesServerSide === false` and sends the text to the client, which
 * speaks it with `window.speechSynthesis`. This is what makes the browser demo
 * work end to end with literally zero API keys.
 */
export class BrowserSpeechTtsProvider implements TtsProvider {
  readonly info: ProviderInfo = {
    name: 'BrowserSpeechSynthesis',
    model: 'window.speechSynthesis',
    mode: 'browser',
  };
  readonly synthesizesServerSide = false;

  // eslint-disable-next-line require-yield -- audio is produced on the client.
  async *synthesize(): AsyncIterable<Int16Array> {
    return;
  }
}
