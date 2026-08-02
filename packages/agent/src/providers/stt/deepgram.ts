import {
  AGENT_SAMPLE_RATE,
  detectLanguage,
  pcm16ToBuffer,
  type Language,
  type ProviderInfo,
} from '@rvagent/shared';
import type { SttEvent, SttOpenOptions, SttProvider, SttStream } from '../types.js';

/**
 * Deepgram streaming speech-to-text.
 *
 * Verified against the live Deepgram docs: `wss://api.deepgram.com/v1/listen`,
 * `language=multi` for Hindi/English code-switching on nova-3, and
 * `endpointing=100`, which Deepgram specifically recommends for code-switching
 * because a longer endpoint swallows the language transition.
 *
 * Authentication uses the `["token", <key>]` subprotocol rather than an
 * Authorization header: Node's global WebSocket does not accept custom headers,
 * and Deepgram documents the subprotocol as the supported alternative.
 */

export interface DeepgramOptions {
  apiKey: string;
  model?: string;
  /** `multi` handles Hinglish; a specific code can be forced for a clean demo. */
  language?: string;
  endpointingMs?: number;
  utteranceEndMs?: number;
}

const DEFAULT_MODEL = 'nova-3';

export class DeepgramSttProvider implements SttProvider {
  readonly info: ProviderInfo;
  readonly transcribesServerSide = true;

  constructor(private readonly options: DeepgramOptions) {
    this.info = {
      name: 'Deepgram',
      model: options.model ?? DEFAULT_MODEL,
      mode: 'live',
    };
  }

  open(options: SttOpenOptions): SttStream {
    const url = new URL('wss://api.deepgram.com/v1/listen');
    url.searchParams.set('model', this.options.model ?? DEFAULT_MODEL);
    url.searchParams.set('language', this.resolveLanguage(options));
    url.searchParams.set('encoding', 'linear16');
    url.searchParams.set('sample_rate', String(AGENT_SAMPLE_RATE));
    url.searchParams.set('channels', '1');
    url.searchParams.set('interim_results', 'true');
    url.searchParams.set('endpointing', String(this.options.endpointingMs ?? 100));
    url.searchParams.set('utterance_end_ms', String(this.options.utteranceEndMs ?? 1_000));
    url.searchParams.set('vad_events', 'true');
    url.searchParams.set('smart_format', 'true');
    url.searchParams.set('punctuate', 'true');

    return new DeepgramStream(url, this.options.apiKey, options.onEvent);
  }

  private resolveLanguage(options: SttOpenOptions): string {
    if (this.options.language) return this.options.language;
    // Forcing English gets noticeably better accuracy than `multi` when the
    // operator has already told us the caller will speak English.
    return options.languageMode === 'en' ? 'en-IN' : 'multi';
  }
}

interface DeepgramResult {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: { alternatives?: Array<{ transcript?: string; confidence?: number }> };
}

/** Deepgram closes an idle socket after ~10 s; this keeps it warm. */
const KEEPALIVE_INTERVAL_MS = 6_000;

class DeepgramStream implements SttStream {
  private socket: WebSocket | null = null;
  private readonly queue: Int16Array[] = [];
  private open = false;
  private closed = false;
  private keepAlive: ReturnType<typeof setInterval> | null = null;

  constructor(
    url: URL,
    apiKey: string,
    private readonly onEvent: (event: SttEvent) => void,
  ) {
    try {
      this.socket = new WebSocket(url, ['token', apiKey]);
      this.socket.binaryType = 'arraybuffer';
      this.socket.onopen = () => this.handleOpen();
      this.socket.onmessage = (event) => this.handleMessage(event);
      this.socket.onerror = () => this.onEvent({ type: 'error', message: 'Deepgram socket error' });
      this.socket.onclose = () => this.stopKeepAlive();
    } catch (error) {
      this.onEvent({
        type: 'error',
        message: error instanceof Error ? error.message : 'Deepgram connection failed',
      });
    }
  }

  write(frame: Int16Array): void {
    if (this.closed) return;
    if (!this.open) {
      // Buffer only the last second so a slow handshake cannot grow unbounded.
      if (this.queue.length < 50) this.queue.push(frame);
      return;
    }
    this.send(frame);
  }

  finalize(): void {
    if (this.closed || !this.open) return;
    this.socket?.send(JSON.stringify({ type: 'Finalize' }));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopKeepAlive();
    if (this.open) this.socket?.send(JSON.stringify({ type: 'CloseStream' }));
    this.socket?.close();
    this.socket = null;
  }

  private handleOpen(): void {
    this.open = true;
    for (const frame of this.queue) this.send(frame);
    this.queue.length = 0;
    this.keepAlive = setInterval(() => {
      if (this.open && !this.closed) this.socket?.send(JSON.stringify({ type: 'KeepAlive' }));
    }, KEEPALIVE_INTERVAL_MS);
  }

  private send(frame: Int16Array): void {
    const buffer = pcm16ToBuffer(frame);
    this.socket?.send(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  }

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data !== 'string') return;

    let payload: DeepgramResult;
    try {
      payload = JSON.parse(event.data) as DeepgramResult;
    } catch {
      return;
    }

    if (payload.type === 'SpeechStarted') {
      this.onEvent({ type: 'speech_started' });
      return;
    }
    if (payload.type === 'UtteranceEnd') {
      this.onEvent({ type: 'utterance_end' });
      return;
    }
    if (payload.type !== 'Results') return;

    const transcript = payload.channel?.alternatives?.[0]?.transcript?.trim() ?? '';
    if (transcript.length === 0) return;

    // `speech_final` means Deepgram detected a natural end of speech; `is_final`
    // alone only means this slice will not be revised.
    if (payload.speech_final) {
      this.onEvent({ type: 'final', text: transcript, language: classify(transcript) });
      return;
    }
    if (!payload.is_final) this.onEvent({ type: 'partial', text: transcript });
  }

  private stopKeepAlive(): void {
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.keepAlive = null;
  }
}

function classify(transcript: string): Language {
  return detectLanguage(transcript).language;
}
