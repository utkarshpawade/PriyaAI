import type { ProviderInfo } from '@rvagent/shared';
import type { SttProvider, SttStream } from '../types.js';

/**
 * Web Speech API fallback.
 *
 * Recognition runs in the caller's browser and arrives at the server as
 * finished text on the existing `user_text` message, so this provider never
 * sees audio. It exists so the browser demo works with **zero API keys** — the
 * orchestrator checks `transcribesServerSide` and simply does not open a
 * server-side stream.
 */
export class BrowserSpeechSttProvider implements SttProvider {
  readonly info: ProviderInfo = {
    name: 'BrowserWebSpeech',
    model: 'webkitSpeechRecognition',
    mode: 'browser',
  };
  readonly transcribesServerSide = false;

  open(): SttStream {
    return {
      write() {},
      finalize() {},
      close() {},
    };
  }
}
