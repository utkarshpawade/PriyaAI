import type { Language } from '@rvagent/shared';
import { normalizeForTTS } from '../language/normalize-tts.js';
import type { TtsProvider } from '../providers/types.js';

export interface SpeechChunk {
  /** Text as it will appear in the transcript. */
  displayText: string;
  language: Language;
}

export interface SpeechQueueCallbacks {
  onAudioStart: () => void;
  onAudio: (frame: Int16Array) => void;
  onAudioEnd: () => void;
  /** Called when TTS runs client-side instead of producing frames here. */
  onBrowserSpeech: (text: string, language: Language) => void;
  /** Fired once a chunk has actually been emitted, for interrupt truncation. */
  onChunkSpoken: (chunk: SpeechChunk) => void;
  onError: (error: Error) => void;
}

/**
 * Serialises TTS so the caller hears one continuous utterance.
 *
 * The LLM stream and the speech stream run concurrently on purpose: text is
 * enqueued sentence by sentence the moment each sentence is complete, so the
 * first audio byte goes out while the model is still generating the rest of the
 * reply. Awaiting synthesis inline instead would add the whole generation time
 * to time-to-first-audio and blow the 1.2 s budget.
 */
export class SpeechQueue {
  private readonly pending: SpeechChunk[] = [];
  private running: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private announcedStart = false;

  constructor(
    private readonly tts: TtsProvider,
    private readonly callbacks: SpeechQueueCallbacks,
  ) {}

  enqueue(chunk: SpeechChunk): void {
    if (chunk.displayText.trim().length === 0) return;
    this.pending.push(chunk);
    if (!this.running) this.running = this.run();
  }

  /** Resolves once everything enqueued so far has been spoken. */
  async drain(): Promise<void> {
    while (this.running) {
      const current = this.running;
      await current;
      if (this.running === current) this.running = null;
    }
    if (this.announcedStart) {
      this.announcedStart = false;
      this.callbacks.onAudioEnd();
    }
  }

  /** Barge-in: drop everything queued and cancel the synthesis in flight. */
  abort(): void {
    this.pending.length = 0;
    this.controller?.abort();
    this.controller = null;
    if (this.announcedStart) {
      this.announcedStart = false;
      this.callbacks.onAudioEnd();
    }
  }

  get isSpeaking(): boolean {
    return this.running !== null || this.pending.length > 0;
  }

  private async run(): Promise<void> {
    while (this.pending.length > 0) {
      const chunk = this.pending.shift();
      if (!chunk) break;
      await this.speak(chunk);
    }
    this.running = null;
  }

  private async speak(chunk: SpeechChunk): Promise<void> {
    if (!this.tts.synthesizesServerSide) {
      this.callbacks.onBrowserSpeech(
        normalizeForTTS(chunk.displayText, chunk.language),
        chunk.language,
      );
      this.callbacks.onChunkSpoken(chunk);
      return;
    }

    const controller = new AbortController();
    this.controller = controller;

    try {
      const spoken = normalizeForTTS(chunk.displayText, chunk.language);
      for await (const frame of this.tts.synthesize(spoken, chunk.language, controller.signal)) {
        if (controller.signal.aborted) return;
        if (!this.announcedStart) {
          this.announcedStart = true;
          this.callbacks.onAudioStart();
        }
        this.callbacks.onAudio(frame);
      }
      if (!controller.signal.aborted) this.callbacks.onChunkSpoken(chunk);
    } catch (error) {
      if (!controller.signal.aborted) {
        this.callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }
}
