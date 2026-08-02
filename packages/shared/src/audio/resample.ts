import { clampToInt16 } from './pcm.js';

/**
 * Sample-rate conversion for PCM16.
 *
 * Linear interpolation is deliberate: the pipeline only ever converts between
 * 8 kHz (telephony) and 16/24 kHz (agent + providers), all of which are already
 * band-limited speech, and a polyphase filter would cost more latency than the
 * quality is worth in a 1.2 s end-to-end budget. Downsampling *does* get a box
 * pre-filter, because decimating 24 kHz straight to 8 kHz without one aliases
 * sibilance into an audible buzz.
 */
export function resamplePcm16(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate || input.length === 0) return input;
  return toRate < fromRate ? downsample(input, fromRate, toRate) : upsample(input, fromRate, toRate);
}

function upsample(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    const current = input[index] ?? 0;
    const next = input[index + 1] ?? current;
    out[i] = clampToInt16(Math.round(current + (next - current) * fraction));
  }
  return out;
}

function downsample(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  const ratio = fromRate / toRate;
  // Averaging window sized to the decimation factor: a crude but effective
  // anti-aliasing low-pass that costs one add per input sample.
  const window = Math.max(1, Math.round(ratio));
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLength);

  for (let i = 0; i < outLength; i += 1) {
    const centre = Math.floor(i * ratio);
    let sum = 0;
    let count = 0;
    for (let k = 0; k < window; k += 1) {
      const index = centre + k;
      if (index >= input.length) break;
      sum += input[index];
      count += 1;
    }
    out[i] = clampToInt16(Math.round(count === 0 ? 0 : sum / count));
  }
  return out;
}

/**
 * Streaming-safe resampler that carries the interpolation tail across chunk
 * boundaries. A stateless per-chunk resample drops or duplicates a fractional
 * sample at every boundary, which at 50 chunks/second is an audible tick.
 */
export class StreamingResampler {
  private carry: Int16Array = new Int16Array(0);

  constructor(
    private readonly fromRate: number,
    private readonly toRate: number,
  ) {}

  process(chunk: Int16Array): Int16Array {
    if (this.fromRate === this.toRate) return chunk;

    const joined = new Int16Array(this.carry.length + chunk.length);
    joined.set(this.carry, 0);
    joined.set(chunk, this.carry.length);

    const ratio = this.fromRate / this.toRate;
    const usableOutput = Math.floor((joined.length - 1) / ratio);
    if (usableOutput <= 0) {
      this.carry = joined;
      return new Int16Array(0);
    }

    const consumed = Math.floor(usableOutput * ratio);
    const out = resamplePcm16(joined.subarray(0, consumed + 1), this.fromRate, this.toRate);
    this.carry = joined.slice(consumed);
    return out.subarray(0, usableOutput);
  }

  reset(): void {
    this.carry = new Int16Array(0);
  }
}
