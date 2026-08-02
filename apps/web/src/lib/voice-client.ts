import {
  AGENT_SAMPLE_RATE,
  FRAME_MS,
  VAD_ENERGY_THRESHOLD,
  VAD_SPEECH_FRAMES,
  parseServerMessage,
  type ClientMessage,
  type LanguageMode,
  type ServerMessage,
} from '@rvagent/shared';
import { AudioPlaybackQueue } from './audio-playback';

/**
 * Browser side of the voice pipeline.
 *
 * Owns the WebSocket, the microphone worklet and the playback queue, and hands
 * the React layer a plain event stream. Keeping all of this outside components
 * matters: an audio graph must survive re-renders, and React's lifecycle is the
 * wrong place to hang a live socket.
 */

export type VoiceClientEvent =
  | { type: 'server'; message: ServerMessage }
  | { type: 'connection'; state: 'connecting' | 'open' | 'closed' | 'error' }
  | { type: 'mic'; state: 'granted' | 'denied' | 'unavailable' }
  /** Instantaneous input level, for the waveform. */
  | { type: 'level'; energy: number }
  | { type: 'notice'; message: string };

export interface VoiceClientOptions {
  url: string;
  onEvent: (event: VoiceClientEvent) => void;
}

interface MicFrameMessage {
  type: 'frame';
  pcm: ArrayBuffer;
  energy: number;
  speechEdge: boolean | null;
}

export class VoiceClient {
  private socket: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;
  private playback: AudioPlaybackQueue | null = null;
  private speechSynthVoiceReady = false;
  private muted = false;

  constructor(private readonly options: VoiceClientOptions) {}

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  get micEnabled(): boolean {
    return this.worklet !== null;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.options.onEvent({ type: 'connection', state: 'connecting' });

      const socket = new WebSocket(this.options.url);
      socket.binaryType = 'arraybuffer';
      this.socket = socket;

      socket.onopen = () => {
        this.options.onEvent({ type: 'connection', state: 'open' });
        resolve();
      };

      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          const message = parseServerMessage(event.data);
          if (message) this.handleServerMessage(message);
          return;
        }
        this.playback?.enqueue(new Int16Array(event.data as ArrayBuffer));
      };

      socket.onerror = () => {
        this.options.onEvent({ type: 'connection', state: 'error' });
        reject(new Error('Could not reach the voice server.'));
      };

      socket.onclose = () => {
        this.options.onEvent({ type: 'connection', state: 'closed' });
        this.teardownAudio();
      };
    });
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.teardownAudio();
  }

  send(message: ClientMessage): void {
    if (!this.isConnected) return;
    this.socket?.send(JSON.stringify(message));
  }

  startCall(languageMode: LanguageMode): void {
    this.send({ type: 'start_call', languageMode });
  }

  sendText(text: string): void {
    this.send({ type: 'user_text', text });
  }

  setLanguage(languageMode: LanguageMode): void {
    this.send({ type: 'set_language', languageMode });
  }

  endCall(): void {
    this.send({ type: 'end_call' });
    this.playback?.flush();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.worklet?.port.postMessage({ type: 'mute', muted });
    this.send({ type: 'mute', muted });
  }

  /**
   * Opens the microphone and starts streaming 20 ms PCM frames.
   * Returns false when permission is denied, which is the cue for the UI to
   * fall back to text mode rather than leaving the interviewer stuck.
   */
  async enableMicrophone(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.options.onEvent({ type: 'mic', state: 'unavailable' });
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Echo cancellation is not optional here: without it the agent's own
          // voice comes back through the mic and triggers a false barge-in.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      this.micStream = stream;

      const context = await this.ensureAudioContext();
      await context.audioWorklet.addModule('/worklets/mic-processor.js');

      const source = context.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(context, 'mic-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        processorOptions: {
          targetSampleRate: AGENT_SAMPLE_RATE,
          frameMs: FRAME_MS,
          energyThreshold: VAD_ENERGY_THRESHOLD,
          speechFrames: VAD_SPEECH_FRAMES,
        },
      });

      worklet.port.onmessage = (event: MessageEvent<MicFrameMessage>) => {
        this.handleMicFrame(event.data);
      };

      source.connect(worklet);
      this.worklet = worklet;

      this.options.onEvent({ type: 'mic', state: 'granted' });
      return true;
    } catch {
      this.options.onEvent({ type: 'mic', state: 'denied' });
      return false;
    }
  }

  private handleMicFrame(frame: MicFrameMessage): void {
    if (frame.type !== 'frame') return;

    this.options.onEvent({ type: 'level', energy: frame.energy });

    if (frame.speechEdge !== null) {
      this.send({ type: 'vad', speaking: frame.speechEdge, energy: frame.energy });
      // Cut local playback the instant the user starts talking, without waiting
      // for the server's interrupt to make the round trip.
      if (frame.speechEdge) this.playback?.flush();
    }

    if (!this.muted && this.isConnected) this.socket?.send(frame.pcm);
  }

  private handleServerMessage(message: ServerMessage): void {
    if (message.type === 'interrupt') {
      this.playback?.flush();
    } else if (message.type === 'audio_start') {
      this.playback?.reset();
    } else if (message.type === 'speak_browser') {
      this.speakInBrowser(message.text, message.lang);
    }

    this.options.onEvent({ type: 'server', message });
  }

  /** Zero-key TTS fallback: the server sends text, the browser speaks it. */
  private speakInBrowser(text: string, lang: string): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.options.onEvent({
        type: 'notice',
        message: 'This browser cannot synthesise speech; use the transcript.',
      });
      return;
    }

    // Chrome populates the voice list asynchronously; the first utterance is
    // silent unless we have already triggered the load.
    if (!this.speechSynthVoiceReady) {
      window.speechSynthesis.getVoices();
      this.speechSynthVoiceReady = true;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1.05;
    const voice = window.speechSynthesis
      .getVoices()
      .find((candidate) => candidate.lang.replace('_', '-') === lang);
    if (voice) utterance.voice = voice;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  /** Silences browser speech synthesis on barge-in and hang-up. */
  cancelBrowserSpeech(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  private async ensureAudioContext(): Promise<AudioContext> {
    if (this.audioContext) {
      if (this.audioContext.state === 'suspended') await this.audioContext.resume();
      return this.audioContext;
    }

    const context = new AudioContext({ sampleRate: AGENT_SAMPLE_RATE, latencyHint: 'interactive' });
    if (context.state === 'suspended') await context.resume();

    this.audioContext = context;
    this.playback = new AudioPlaybackQueue(context, context.destination, AGENT_SAMPLE_RATE);
    return context;
  }

  /** Needed before any audio can play: browsers require a user gesture. */
  async primeAudio(): Promise<void> {
    await this.ensureAudioContext();
  }

  private teardownAudio(): void {
    this.cancelBrowserSpeech();
    this.playback?.flush();
    this.worklet?.port.close();
    this.worklet?.disconnect();
    this.worklet = null;

    for (const track of this.micStream?.getTracks() ?? []) track.stop();
    this.micStream = null;

    void this.audioContext?.close();
    this.audioContext = null;
    this.playback = null;
  }
}
