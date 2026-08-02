import { z } from 'zod';
import { languageModeSchema, languageSchema } from './language.js';
import { qualificationSlotsSchema, slotQuestionKeySchema } from './slots.js';

/**
 * The browser <-> voice-server WebSocket protocol.
 *
 * Text frames carry these JSON envelopes; binary frames are always raw PCM16
 * mono at `AGENT_SAMPLE_RATE` (mic upstream, TTS downstream). Keeping audio out
 * of JSON avoids base64's 33% overhead on the latency-critical path.
 */

export const callTransportSchema = z.enum(['web', 'phone']);
export type CallTransport = z.infer<typeof callTransportSchema>;

export const callOutcomeSchema = z.enum([
  'qualified',
  'not_interested',
  'callback_requested',
  'wrong_number',
  'abandoned',
  'in_progress',
]);
export type CallOutcome = z.infer<typeof callOutcomeSchema>;

export const agentStateSchema = z.enum(['idle', 'listening', 'thinking', 'speaking', 'ended']);
export type AgentState = z.infer<typeof agentStateSchema>;

export const providerModeSchema = z.enum(['live', 'mock', 'browser']);
export const providerInfoSchema = z.object({
  name: z.string(),
  model: z.string(),
  mode: providerModeSchema,
});
export const providerSetSchema = z.object({
  stt: providerInfoSchema,
  llm: providerInfoSchema,
  tts: providerInfoSchema,
});
export type ProviderInfo = z.infer<typeof providerInfoSchema>;
export type ProviderSet = z.infer<typeof providerSetSchema>;

export const turnLatencySchema = z.object({
  sttMs: z.number().nonnegative().nullable(),
  llmFirstTokenMs: z.number().nonnegative().nullable(),
  ttsFirstByteMs: z.number().nonnegative().nullable(),
  totalMs: z.number().nonnegative().nullable(),
});
export type TurnLatency = z.infer<typeof turnLatencySchema>;

// ---------------------------------------------------------------------------
// Client -> server
// ---------------------------------------------------------------------------

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start_call'),
    languageMode: languageModeSchema.default('auto'),
    /** Optional pre-known caller details, e.g. from an outbound campaign list. */
    leadHint: z.object({ name: z.string().optional(), phone: z.string().optional() }).optional(),
  }),
  /** Text-mode fallback: skips STT entirely and injects a finished user turn. */
  z.object({ type: z.literal('user_text'), text: z.string().min(1).max(2000) }),
  /** Energy VAD verdict from the AudioWorklet — the barge-in trigger. */
  z.object({ type: z.literal('vad'), speaking: z.boolean(), energy: z.number().min(0).max(1) }),
  z.object({ type: z.literal('set_language'), languageMode: languageModeSchema }),
  z.object({ type: z.literal('mute'), muted: z.boolean() }),
  z.object({ type: z.literal('end_call'), reason: z.string().max(200).optional() }),
  z.object({ type: z.literal('ping') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ---------------------------------------------------------------------------
// Server -> client
// ---------------------------------------------------------------------------

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('call_started'),
    callId: z.string(),
    providers: providerSetSchema,
    languageMode: languageModeSchema,
    sampleRate: z.number().int().positive(),
  }),
  z.object({ type: z.literal('state'), state: agentStateSchema }),
  z.object({
    type: z.literal('transcript'),
    turnId: z.string(),
    role: z.enum(['user', 'assistant']),
    text: z.string(),
    language: languageSchema,
    isFinal: z.boolean(),
    interrupted: z.boolean().default(false),
  }),
  /** Token-level streaming of the assistant reply, for the live caption. */
  z.object({ type: z.literal('agent_delta'), turnId: z.string(), text: z.string() }),
  /** Barge-in: client must flush every queued audio buffer immediately. */
  z.object({ type: z.literal('interrupt') }),
  z.object({
    type: z.literal('requirements'),
    slots: qualificationSlotsSchema,
    declined: z.array(slotQuestionKeySchema),
    completeness: z.number().min(0).max(1),
    nextSlot: slotQuestionKeySchema.nullable(),
  }),
  z.object({
    type: z.literal('tool_call'),
    id: z.string(),
    name: z.string(),
    args: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal('tool_result'),
    id: z.string(),
    name: z.string(),
    ok: z.boolean(),
    detail: z.string(),
  }),
  z.object({ type: z.literal('latency'), turnIndex: z.number().int() }).merge(turnLatencySchema),
  /** A new TTS utterance begins; the client resets its playback scheduler. */
  z.object({ type: z.literal('audio_start'), turnId: z.string(), sampleRate: z.number().int() }),
  z.object({ type: z.literal('audio_end'), turnId: z.string() }),
  /**
   * Emitted only by the browser-speech TTS fallback, which synthesises on the
   * client. The server still owns the text, so the transcript stays identical.
   */
  z.object({ type: z.literal('speak_browser'), turnId: z.string(), text: z.string(), lang: z.string() }),
  z.object({
    type: z.literal('call_ended'),
    callId: z.string(),
    outcome: callOutcomeSchema,
    summaryReady: z.boolean(),
  }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
  z.object({ type: z.literal('pong') }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed = clientMessageSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const parsed = serverMessageSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}
