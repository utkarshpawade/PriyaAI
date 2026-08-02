/**
 * Microphone capture worklet.
 *
 * Runs on the audio render thread, so it does three things the main thread
 * cannot do reliably under React re-renders:
 *   1. Resamples to the agent's 24 kHz, because Safari ignores the sample rate
 *      requested on the AudioContext and hands you 44.1 or 48 kHz anyway.
 *   2. Packs exactly 20 ms frames, so every socket write is one frame.
 *   3. Runs an energy VAD with hysteresis and reports edges only, which is the
 *      barge-in trigger. Doing this here rather than on the server saves a full
 *      network round trip on the one signal that has to feel instantaneous.
 *
 * This file is plain JavaScript on purpose: it is loaded by the browser via
 * `audioWorklet.addModule()` and never passes through the bundler.
 */

const DEFAULT_TARGET_RATE = 24000;
const DEFAULT_FRAME_MS = 20;

class MicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const parameters = (options && options.processorOptions) || {};

    this.targetRate = parameters.targetSampleRate || DEFAULT_TARGET_RATE;
    this.frameSamples = Math.round((this.targetRate * (parameters.frameMs || DEFAULT_FRAME_MS)) / 1000);
    this.energyThreshold = parameters.energyThreshold || 0.012;
    this.speechFrames = parameters.speechFrames || 3;
    // Silence is held longer than speech so a natural pause inside a sentence
    // does not read as end-of-speech and cancel the agent's reply.
    this.silenceFrames = parameters.silenceFrames || 12;

    this.ratio = sampleRate / this.targetRate;
    this.buffer = new Float32Array(this.frameSamples);
    this.bufferIndex = 0;
    this.readPosition = 0;
    this.tail = new Float32Array(0);

    this.voicedRun = 0;
    this.silentRun = 0;
    this.speaking = false;
    this.muted = false;

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === 'mute') this.muted = Boolean(event.data.muted);
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || this.muted) return true;

    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    // Join the previous block's unconsumed tail so interpolation never restarts
    // mid-sample; a stateless per-block resample ticks audibly at 128 samples.
    const source = new Float32Array(this.tail.length + channel.length);
    source.set(this.tail, 0);
    source.set(channel, this.tail.length);

    let position = this.readPosition;
    while (position + 1 < source.length) {
      const index = Math.floor(position);
      const fraction = position - index;
      const current = source[index];
      const next = source[index + 1];

      this.buffer[this.bufferIndex] = current + (next - current) * fraction;
      this.bufferIndex += 1;

      if (this.bufferIndex >= this.frameSamples) {
        this.emitFrame();
        this.bufferIndex = 0;
      }
      position += this.ratio;
    }

    const consumed = Math.floor(position);
    this.tail = source.slice(consumed);
    this.readPosition = position - consumed;

    return true;
  }

  emitFrame() {
    const pcm = new Int16Array(this.frameSamples);
    let sumSquares = 0;

    for (let i = 0; i < this.frameSamples; i += 1) {
      const sample = Math.max(-1, Math.min(1, this.buffer[i]));
      pcm[i] = sample < 0 ? sample * 32768 : sample * 32767;
      sumSquares += sample * sample;
    }

    const energy = Math.sqrt(sumSquares / this.frameSamples);
    const voiced = energy >= this.energyThreshold;

    if (voiced) {
      this.voicedRun += 1;
      this.silentRun = 0;
    } else {
      this.silentRun += 1;
      this.voicedRun = 0;
    }

    let edge = null;
    if (!this.speaking && this.voicedRun >= this.speechFrames) {
      this.speaking = true;
      edge = true;
    } else if (this.speaking && this.silentRun >= this.silenceFrames) {
      this.speaking = false;
      edge = false;
    }

    this.port.postMessage({ type: 'frame', pcm: pcm.buffer, energy, speechEdge: edge }, [pcm.buffer]);
  }
}

registerProcessor('mic-processor', MicProcessor);
