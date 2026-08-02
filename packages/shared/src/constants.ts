/**
 * Audio constants shared by every transport and every provider adapter.
 *
 * The agent core speaks exactly one audio format internally — signed 16-bit
 * little-endian PCM, mono, 24 kHz. Transports (browser, Twilio) and providers
 * (Deepgram, Sarvam, ElevenLabs) resample at their own edges so the core never
 * has to care where the audio came from.
 */

/** The one and only sample rate the agent core works in. */
export const AGENT_SAMPLE_RATE = 24_000;

/** Twilio Media Streams are always 8 kHz mono G.711 mu-law. */
export const TWILIO_SAMPLE_RATE = 8_000;

/** Frame size the browser worklet emits and the server expects, in milliseconds. */
export const FRAME_MS = 20;

/** Samples in one 20 ms frame at the agent sample rate. */
export const AGENT_FRAME_SAMPLES = (AGENT_SAMPLE_RATE * FRAME_MS) / 1000;

/** Samples in one 20 ms frame at the Twilio sample rate. */
export const TWILIO_FRAME_SAMPLES = (TWILIO_SAMPLE_RATE * FRAME_MS) / 1000;

/** Trailing silence that ends a user turn. */
export const SILENCE_ENDPOINT_MS = 600;

/** Hard cap on a single user turn, so a stuck VAD can never hang the call. */
export const MAX_TURN_MS = 12_000;

/**
 * Consecutive voiced frames required before we treat the user as genuinely
 * speaking. Three frames (60 ms) rejects keyboard clicks and lip smacks while
 * still triggering barge-in fast enough to feel instant.
 */
export const VAD_SPEECH_FRAMES = 3;

/** RMS energy (0..1) above which a frame counts as voiced. */
export const VAD_ENERGY_THRESHOLD = 0.012;

/** Latency target for first audio byte after the user stops speaking. */
export const FIRST_AUDIO_TARGET_MS = 1_200;
