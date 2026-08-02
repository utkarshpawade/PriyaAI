/** Conversions between the audio representations used across the pipeline. */

const INT16_MAX = 32_767;
const INT16_MIN = -32_768;

export function clampToInt16(value: number): number {
  if (value > INT16_MAX) return INT16_MAX;
  if (value < INT16_MIN) return INT16_MIN;
  return value | 0;
}

/** Web Audio delivers Float32 in [-1, 1]; the wire format is Int16. */
export function float32ToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    out[i] = sample < 0 ? sample * 32_768 : sample * 32_767;
  }
  return out;
}

export function pcm16ToFloat32(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = input[i];
    out[i] = sample < 0 ? sample / 32_768 : sample / 32_767;
  }
  return out;
}

/**
 * Wraps a Node Buffer as Int16Array without copying when alignment allows.
 * Sockets hand us Buffers whose byteOffset is often odd, which Int16Array
 * refuses to view directly — hence the copy fallback.
 */
export function bufferToPcm16(buffer: Buffer | Uint8Array): Int16Array {
  const view =
    buffer instanceof Buffer ? buffer : Buffer.from(buffer.buffer, buffer.byteOffset, buffer.length);
  if (view.byteOffset % 2 === 0 && view.byteLength % 2 === 0) {
    return new Int16Array(view.buffer, view.byteOffset, view.byteLength / 2);
  }
  const copy = Buffer.from(view);
  return new Int16Array(copy.buffer, copy.byteOffset, Math.floor(copy.byteLength / 2));
}

export function pcm16ToBuffer(samples: Int16Array): Buffer {
  return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
}

/** Root-mean-square energy normalised to 0..1. Drives the energy VAD. */
export function rmsEnergy(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const normalised = samples[i] / 32_768;
    sumSquares += normalised * normalised;
  }
  return Math.sqrt(sumSquares / samples.length);
}

/** Duration of a PCM16 buffer in milliseconds at a given sample rate. */
export function pcm16DurationMs(samples: Int16Array, sampleRate: number): number {
  return (samples.length / sampleRate) * 1000;
}

export function concatPcm16(chunks: readonly Int16Array[]): Int16Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Minimal 16-bit PCM WAV container. Used to hand buffered audio to REST STT. */
export function encodeWav(samples: Int16Array, sampleRate: number): Buffer {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample; // mono
  const dataBytes = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // format: PCM
  buffer.writeUInt16LE(1, 22); // channels: mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28); // byte rate
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(samples[i], 44 + i * bytesPerSample);
  }
  return buffer;
}

/** Strips a RIFF/WAVE header if present, returning raw PCM16 samples. */
export function decodeWav(buffer: Buffer): { samples: Int16Array; sampleRate: number } {
  const isWav =
    buffer.length > 44 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE';
  if (!isWav) {
    return { samples: bufferToPcm16(buffer), sampleRate: 0 };
  }

  let sampleRate = 0;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (chunkId === 'fmt ') {
      sampleRate = buffer.readUInt32LE(body + 4);
    } else if (chunkId === 'data') {
      const end = Math.min(buffer.length, body + chunkSize);
      return { samples: bufferToPcm16(buffer.subarray(body, end)), sampleRate };
    }
    offset = body + chunkSize + (chunkSize % 2);
  }
  return { samples: new Int16Array(0), sampleRate };
}
