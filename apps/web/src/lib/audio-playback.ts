/**
 * Scheduled playback queue for streamed TTS.
 *
 * Chunks arrive over the socket at whatever cadence the network and the TTS
 * provider allow. Playing each one with `start()` as it lands produces audible
 * gaps, so every chunk is scheduled against a running clock instead, with a
 * small jitter buffer ahead of the playhead to absorb network variance.
 *
 * `flush()` is the barge-in path: it stops every scheduled source immediately,
 * including the ones queued in the future that the user has not heard yet.
 */

/** Lead time before the first chunk plays. Enough to absorb a hiccup, short
 *  enough that nobody perceives it as latency. */
const JITTER_BUFFER_SEC = 0.08;

export class AudioPlaybackQueue {
  private nextPlayTime = 0;
  private readonly active = new Set<AudioBufferSourceNode>();

  constructor(
    private readonly context: AudioContext,
    private readonly destination: AudioNode,
    private readonly sampleRate: number,
  ) {}

  /** Seconds of audio still queued ahead of the playhead. */
  get queuedSeconds(): number {
    return Math.max(0, this.nextPlayTime - this.context.currentTime);
  }

  get isPlaying(): boolean {
    return this.active.size > 0;
  }

  enqueue(pcm: Int16Array): void {
    if (pcm.length === 0) return;

    const buffer = this.context.createBuffer(1, pcm.length, this.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i += 1) {
      channel[i] = pcm[i] < 0 ? pcm[i] / 32768 : pcm[i] / 32767;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.destination);

    // If the queue has drained (or this is the first chunk) restart the clock
    // from now plus the jitter buffer, otherwise append seamlessly.
    const startAt = Math.max(this.nextPlayTime, this.context.currentTime + JITTER_BUFFER_SEC);
    source.start(startAt);
    this.nextPlayTime = startAt + buffer.duration;

    this.active.add(source);
    source.onended = () => this.active.delete(source);
  }

  /** Barge-in: drop everything, heard or not. */
  flush(): void {
    for (const source of this.active) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        // Already stopped; nothing to do.
      }
    }
    this.active.clear();
    this.nextPlayTime = 0;
  }

  /** Lets the clock restart cleanly at the beginning of the next utterance. */
  reset(): void {
    this.nextPlayTime = 0;
  }
}
