/**
 * G.711 mu-law codec.
 *
 * Twilio Media Streams carry 8 kHz mu-law; the agent core works in 24 kHz
 * linear PCM16. This module is the codec half of that bridge (resampling is the
 * other half, in `resample.ts`).
 *
 * Implemented from the ITU-T G.711 definition rather than pulled from a
 * dependency: it is 40 lines, has no upstream churn, and the round-trip is
 * unit-tested against the standard's quantisation error bound.
 */

const MU_LAW_BIAS = 0x84; // 132
const MU_LAW_CLIP = 32_635;

/** Encodes one 16-bit linear sample to one mu-law byte. */
export function muLawEncodeSample(sample: number): number {
  let value = Math.max(-32_768, Math.min(32_767, sample));
  const sign = value < 0 ? 0x80 : 0x00;
  if (value < 0) value = -value;
  if (value > MU_LAW_CLIP) value = MU_LAW_CLIP;
  value += MU_LAW_BIAS;

  let exponent = 7;
  for (let mask = 0x4000; (value & mask) === 0 && exponent > 0; mask >>= 1) {
    exponent -= 1;
  }
  const mantissa = (value >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
}

/** Decodes one mu-law byte back to a 16-bit linear sample. */
export function muLawDecodeSample(byte: number): number {
  const inverted = ~byte & 0xff;
  const sign = inverted & 0x80;
  const exponent = (inverted >> 4) & 0x07;
  const mantissa = inverted & 0x0f;
  let sample = ((mantissa << 3) + MU_LAW_BIAS) << exponent;
  sample -= MU_LAW_BIAS;
  return sign !== 0 ? -sample : sample;
}

// 256-entry decode table: decoding runs on every inbound Twilio frame, so the
// table removes the per-sample bit twiddling from the hot path.
const DECODE_TABLE = new Int16Array(256);
for (let byte = 0; byte < 256; byte += 1) {
  DECODE_TABLE[byte] = muLawDecodeSample(byte);
}

export function muLawEncode(samples: Int16Array): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    out[i] = muLawEncodeSample(samples[i]);
  }
  return out;
}

export function muLawDecode(bytes: Uint8Array): Int16Array {
  const out = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    out[i] = DECODE_TABLE[bytes[i]];
  }
  return out;
}

/** mu-law silence is 0xFF, not 0x00 — used to pad Twilio frames. */
export const MU_LAW_SILENCE_BYTE = 0xff;
