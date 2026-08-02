import {
  AGENT_SAMPLE_RATE,
  FRAME_MS,
  SILENCE_ENDPOINT_MS,
  VAD_ENERGY_THRESHOLD,
  VAD_SPEECH_FRAMES,
  rmsEnergy,
  type ProviderInfo,
} from '@rvagent/shared';
import { detectLanguage } from '@rvagent/shared';
import type { SttOpenOptions, SttProvider, SttStream } from '../types.js';

/**
 * Zero-credential STT.
 *
 * It cannot transcribe, so it does the next most useful thing: it runs a real
 * energy VAD over the incoming frames and, each time it detects a complete
 * utterance, emits the next line of a scripted conversation. The turn-taking,
 * endpointing and barge-in timing you see in a mock-mode demo are therefore
 * genuine — only the words are canned, and the UI labels the provider MOCK.
 */

const DEFAULT_SCRIPT: readonly string[] = [
  'Haan bataiye, main sun raha hoon',
  'Mujhe 2 BHK chahiye Hinjewadi mein',
  'Budget 75 lakh tak hai',
  'Possession kab tak milega?',
  'Actually 3 BHK dekh lijiye, budget 1.2 crore kar sakte hain',
  'Theek hai, mera naam Rohit Sharma hai',
  'Mera number 9876543210 hai',
  'Haan, is Sunday site visit kar sakte hain',
  'Theek hai, thank you',
];

export interface MockSttOptions {
  /** Replaces the built-in script, e.g. for a specific demo run. */
  script?: readonly string[];
  /** Loop the script instead of falling silent once it is exhausted. */
  loop?: boolean;
}

export class MockSttProvider implements SttProvider {
  readonly info: ProviderInfo = {
    name: 'MockSTT',
    model: 'scripted-vad',
    mode: 'mock',
  };
  readonly transcribesServerSide = true;

  private readonly script: readonly string[];
  private readonly loop: boolean;

  constructor(options: MockSttOptions = {}) {
    this.script = options.script && options.script.length > 0 ? options.script : DEFAULT_SCRIPT;
    this.loop = options.loop ?? false;
  }

  open(options: SttOpenOptions): SttStream {
    return new MockSttStream(this.script, this.loop, options);
  }
}

const SILENCE_FRAMES_TO_END = Math.ceil(SILENCE_ENDPOINT_MS / FRAME_MS);

class MockSttStream implements SttStream {
  private scriptIndex = 0;
  private voicedFrames = 0;
  private silentFrames = 0;
  private speaking = false;
  private closed = false;
  private emittedPartial = false;

  constructor(
    private readonly script: readonly string[],
    private readonly loop: boolean,
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
      // Show a partial once the utterance is clearly under way, so the demo UI
      // has the same "text appears while you talk" feel as a live provider.
      if (this.speaking && !this.emittedPartial && this.voicedFrames >= VAD_SPEECH_FRAMES * 4) {
        this.emittedPartial = true;
        const preview = this.peekScript();
        if (preview) {
          this.options.onEvent({ type: 'partial', text: firstWords(preview) });
        }
      }
      return;
    }

    this.voicedFrames = 0;
    if (!this.speaking) return;

    this.silentFrames += 1;
    if (this.silentFrames >= SILENCE_FRAMES_TO_END) this.emitFinal();
  }

  finalize(): void {
    if (this.speaking) this.emitFinal();
  }

  close(): void {
    this.closed = true;
  }

  private emitFinal(): void {
    this.speaking = false;
    this.silentFrames = 0;
    this.emittedPartial = false;

    const text = this.nextScript();
    if (!text) {
      this.options.onEvent({ type: 'utterance_end' });
      return;
    }

    this.options.onEvent({
      type: 'final',
      text,
      language: detectLanguage(text).language,
    });
    this.options.onEvent({ type: 'utterance_end' });
  }

  private peekScript(): string | null {
    if (this.scriptIndex < this.script.length) return this.script[this.scriptIndex];
    return this.loop ? this.script[this.scriptIndex % this.script.length] : null;
  }

  private nextScript(): string | null {
    const text = this.peekScript();
    if (text) this.scriptIndex += 1;
    return text;
  }
}

function firstWords(text: string, count = 3): string {
  return text.split(/\s+/).slice(0, count).join(' ');
}

/** Frames of silence, handy in tests that need to drive an endpoint. */
export function silentFrames(count: number): Int16Array[] {
  const samples = (AGENT_SAMPLE_RATE * FRAME_MS) / 1000;
  return Array.from({ length: count }, () => new Int16Array(samples));
}
