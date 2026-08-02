import type {
  AgentState,
  CallOutcome,
  Language,
  QualificationSlots,
  SlotQuestionKey,
  TurnLatency,
} from '@rvagent/shared';

/**
 * Everything the agent core emits.
 *
 * This union *is* the transport boundary. The browser WebSocket handler and the
 * Twilio Media Streams handler each translate these into their own wire format
 * and nothing else; neither one can reach into the session. Adding a third
 * transport means writing one more translator, not touching the core.
 */
export type AgentEvent =
  | { type: 'state'; state: AgentState }
  | {
      type: 'transcript';
      turnId: string;
      role: 'user' | 'assistant';
      text: string;
      language: Language;
      isFinal: boolean;
      interrupted: boolean;
    }
  | { type: 'agent_delta'; turnId: string; text: string }
  | { type: 'audio_start'; turnId: string }
  /** One PCM16 chunk at AGENT_SAMPLE_RATE. */
  | { type: 'audio'; turnId: string; frame: Int16Array }
  | { type: 'audio_end'; turnId: string }
  /** Emitted instead of audio when TTS runs in the browser. */
  | { type: 'speak_browser'; turnId: string; text: string; language: Language }
  | { type: 'interrupt' }
  | {
      type: 'requirements';
      slots: QualificationSlots;
      declined: readonly SlotQuestionKey[];
      completeness: number;
      nextSlot: SlotQuestionKey | null;
    }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; ok: boolean; detail: string }
  | ({ type: 'latency'; turnIndex: number } & TurnLatency)
  | { type: 'ended'; outcome: CallOutcome; note?: string }
  | { type: 'error'; code: string; message: string };

export type AgentEventHandler = (event: AgentEvent) => void;

/** A turn as it is handed to persistence. */
export interface RecordedTurn {
  index: number;
  role: 'user' | 'assistant';
  text: string;
  language: Language;
  interrupted: boolean;
  toolCalls: Array<{ name: string; args: Record<string, unknown>; detail: string; ok: boolean }>;
  latency: TurnLatency;
}
