import { describe, expect, it } from 'vitest';
import {
  MU_LAW_SILENCE_BYTE,
  StreamingResampler,
  concatPcm16,
  decodeWav,
  encodeWav,
  float32ToPcm16,
  muLawDecode,
  muLawDecodeSample,
  muLawEncode,
  muLawEncodeSample,
  pcm16ToFloat32,
  resamplePcm16,
  rmsEnergy,
} from '../src/index.js';

function sineWave(samples: number, sampleRate: number, frequency: number, amplitude = 0.5) {
  const out = new Int16Array(samples);
  for (let i = 0; i < samples; i += 1) {
    out[i] = Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * amplitude * 32_767);
  }
  return out;
}

describe('mu-law codec', () => {
  it('round-trips silence to the G.711 silence byte', () => {
    expect(muLawEncodeSample(0)).toBe(MU_LAW_SILENCE_BYTE);
    expect(muLawDecodeSample(MU_LAW_SILENCE_BYTE)).toBe(0);
  });

  it('preserves sign across the round trip', () => {
    expect(muLawDecodeSample(muLawEncodeSample(-12_000))).toBeLessThan(0);
    expect(muLawDecodeSample(muLawEncodeSample(12_000))).toBeGreaterThan(0);
  });

  it('keeps quantisation error inside the G.711 bound for a speech-band sine', () => {
    const original = sineWave(8_000, 8_000, 440);
    const roundTripped = muLawDecode(muLawEncode(original));

    expect(roundTripped.length).toBe(original.length);

    let worstRelativeError = 0;
    for (let i = 0; i < original.length; i += 1) {
      const magnitude = Math.max(Math.abs(original[i]), 256);
      worstRelativeError = Math.max(
        worstRelativeError,
        Math.abs(roundTripped[i] - original[i]) / magnitude,
      );
    }
    // mu-law is a logarithmic 8-bit quantiser: ~8% worst-case relative error.
    expect(worstRelativeError).toBeLessThan(0.1);
  });

  it('clips beyond the mu-law range without wrapping sign', () => {
    expect(muLawDecodeSample(muLawEncodeSample(32_767))).toBeGreaterThan(30_000);
    expect(muLawDecodeSample(muLawEncodeSample(-32_768))).toBeLessThan(-30_000);
  });
});

describe('resamplePcm16', () => {
  it('is a no-op when rates match', () => {
    const input = sineWave(100, 24_000, 440);
    expect(resamplePcm16(input, 24_000, 24_000)).toBe(input);
  });

  it('produces the expected sample count downsampling 24k -> 8k', () => {
    const input = sineWave(2_400, 24_000, 440);
    const output = resamplePcm16(input, 24_000, 8_000);
    expect(output.length).toBe(800);
  });

  it('produces the expected sample count upsampling 8k -> 24k', () => {
    const input = sineWave(800, 8_000, 440);
    const output = resamplePcm16(input, 8_000, 24_000);
    expect(output.length).toBe(2_400);
  });

  it('preserves signal energy within tolerance through a 24k -> 8k -> 24k round trip', () => {
    const original = sineWave(4_800, 24_000, 300);
    const roundTripped = resamplePcm16(resamplePcm16(original, 24_000, 8_000), 8_000, 24_000);

    const originalEnergy = rmsEnergy(original);
    const roundTrippedEnergy = rmsEnergy(roundTripped);
    expect(Math.abs(roundTrippedEnergy - originalEnergy) / originalEnergy).toBeLessThan(0.2);
  });
});

describe('StreamingResampler', () => {
  it('emits the same total sample count as a one-shot resample', () => {
    const resampler = new StreamingResampler(24_000, 8_000);
    const chunks: Int16Array[] = [];
    const frameSize = 480; // 20 ms at 24 kHz
    const source = sineWave(frameSize * 25, 24_000, 500);

    for (let offset = 0; offset < source.length; offset += frameSize) {
      chunks.push(resampler.process(source.subarray(offset, offset + frameSize)));
    }

    const streamed = concatPcm16(chunks);
    const oneShot = resamplePcm16(source, 24_000, 8_000);
    // Boundary carry means at most one frame of lag, never a growing drift.
    expect(Math.abs(streamed.length - oneShot.length)).toBeLessThanOrEqual(4);
  });
});

describe('pcm conversions', () => {
  it('round-trips float32 <-> pcm16 within one quantisation step', () => {
    const floats = new Float32Array([0, 0.5, -0.5, 0.999, -0.999]);
    const restored = pcm16ToFloat32(float32ToPcm16(floats));
    for (let i = 0; i < floats.length; i += 1) {
      expect(Math.abs(restored[i] - floats[i])).toBeLessThan(1 / 32_767);
    }
  });

  it('reports zero energy for silence and non-zero for a tone', () => {
    expect(rmsEnergy(new Int16Array(480))).toBe(0);
    expect(rmsEnergy(sineWave(480, 24_000, 440))).toBeGreaterThan(0.1);
  });
});

describe('wav container', () => {
  it('round-trips samples and sample rate', () => {
    const samples = sineWave(1_000, 16_000, 440);
    const decoded = decodeWav(encodeWav(samples, 16_000));
    expect(decoded.sampleRate).toBe(16_000);
    expect(decoded.samples.length).toBe(samples.length);
    expect(decoded.samples[10]).toBe(samples[10]);
  });
});
