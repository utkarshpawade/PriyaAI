import {
  AGENT_SAMPLE_RATE,
  FRAME_MS,
  MAX_TURN_MS,
  SILENCE_ENDPOINT_MS,
  VAD_ENERGY_THRESHOLD,
  VAD_SPEECH_FRAMES,
  concatPcm16,
  detectLanguage,
  encodeWav,
  rmsEnergy,
  type Language,
  type LanguageMode,
  type ProviderInfo,
} from '@rvagent/shared';
import { assertOk } from '../http/sse.js';
import type { SttOpenOptions, SttProvider, SttStream } from '../types.js';

/**
 * Sarvam AI speech-to-text.
 *
 * Verified against the live Sarvam reference: `POST https://api.sarvam.ai/speech-to-text`,
 * `api-subscription-key` header, multipart form with `file`, `model` and
 * `language_code`, responding `{ request_id, transcript, language_code }`.
 *
 * Sarvam's REST endpoint is per-utterance rather than streaming, so this
 * adapter brings its own endpointing: the same energy VAD the browser worklet
 * uses buffers a turn locally and posts it the moment the caller stops talking.
 * The trade-off is real and worth stating out loud — you pay one network round
 * trip after end-of-speech instead of transcribing during it — but Sarvam's
 * Hinglish accuracy is materially better than the alternatives on Indian
 * accents, which is the whole reason it is offered.
 */

export interface SarvamSttOptions {
  apiKey: string;
  /** `saarika:v2.5` is the transcription-optimised model; `saaras:v3` also translates. */
  model?: string;
  endpoint?: string;
}

const DEFAULT_MODEL = 'saarika:v2.5';
const DEFAULT_ENDPOINT = 'https://api.sarvam.ai/speech-to-text';
const SILENCE_FRAMES_TO_END = Math.ceil(SILENCE_ENDPOINT_MS / FRAME_MS);
const MAX_FRAMES_PER_TURN = Math.ceil(MAX_TURN_MS / FRAME_MS);

export class SarvamSttProvider implements SttProvider {
  readonly info: ProviderInfo;
  readonly transcribesServerSide = true;

  constructor(private readonly options: SarvamSttOptions) {
    this.info = { name: 'Sarvam Saarika', model: options.model ?? DEFAULT_MODEL, mode: 'live' };
  }

  open(options: SttOpenOptions): SttStream {
    return new SarvamSttStream(
      {
        apiKey: this.options.apiKey,
        model: this.options.model ?? DEFAULT_MODEL,
        endpoint: this.options.endpoint ?? DEFAULT_ENDPOINT,
      },
      options,
    );
  }
}

class SarvamSttStream implements SttStream {
  private frames: Int16Array[] = [];
  private voicedFrames = 0;
  private silentFrames = 0;
  private speaking = false;
  private closed = false;

  constructor(
    private readonly config: { apiKey: string; model: string; endpoint: string },
    private readonly options: SttOpenOptions,
  ) {}

  write(frame: Int16Array): void {
    if (this.closed) return;

    const voiced = rmsEnergy(frame) >= VAD_ENERGY_THRESHOLD;

    if (voiced) {
      this.silentFrames = 0;
      this.voicedFrames += 1;
      if (!this.speaking && this.voicedFrames >= VAD_SPEECH_FRAMES) {
        this.speaking = true;
        this.options.onEvent({ type: 'speech_started' });
      }
    } else {
      this.voicedFrames = 0;
    }

    if (!this.speaking) return;

    this.frames.push(frame);

    if (!voiced) {
      this.silentFrames += 1;
      if (this.silentFrames >= SILENCE_FRAMES_TO_END) {
        void this.flush();
        return;
      }
    }

    if (this.frames.length >= MAX_FRAMES_PER_TURN) void this.flush();
  }

  finalize(): void {
    if (this.speaking) void this.flush();
  }

  close(): void {
    this.closed = true;
    this.frames = [];
  }

  private async flush(): Promise<void> {
    const frames = this.frames;
    this.frames = [];
    this.speaking = false;
    this.silentFrames = 0;
    this.options.onEvent({ type: 'utterance_end' });

    if (frames.length === 0) return;

    const audio = concatPcm16(frames);
    // Drop sub-300 ms blips: coughs and door slams cost a request otherwise.
    if (audio.length < AGENT_SAMPLE_RATE * 0.3) return;

    try {
      const transcript = await this.transcribe(audio);
      if (transcript.text.trim().length > 0 && !this.closed) {
        this.options.onEvent({
          type: 'final',
          text: transcript.text.trim(),
          language: transcript.language,
        });
      }
    } catch (error) {
      this.options.onEvent({
        type: 'error',
        message: error instanceof Error ? error.message : 'Sarvam transcription failed',
      });
    }
  }

  private async transcribe(audio: Int16Array): Promise<{ text: string; language: Language }> {
    const wav = encodeWav(audio, AGENT_SAMPLE_RATE);
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'turn.wav');
    form.append('model', this.config.model);
    form.append('language_code', toSarvamLanguage(this.options.languageMode));

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: { 'api-subscription-key': this.config.apiKey },
      body: form,
    });
    await assertOk('Sarvam STT', response);

    const payload = (await response.json()) as { transcript?: string; language_code?: string };
    const text = payload.transcript ?? '';
    return { text, language: detectLanguage(text).language };
  }
}

/** `unknown` asks Sarvam to auto-detect, which is what Hinglish needs. */
function toSarvamLanguage(mode: LanguageMode): string {
  if (mode === 'hi') return 'hi-IN';
  if (mode === 'en') return 'en-IN';
  return 'unknown';
}
