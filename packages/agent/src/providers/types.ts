import type {
  Language,
  LanguageMode,
  ProviderInfo,
  QualificationSlots,
  SlotQuestionKey,
} from '@rvagent/shared';
import type { Project } from '../kb/schema.js';
import type { ObjectionKey } from '../language/phrasebook.js';
import type { Situation } from '../nlu/situations.js';
import type { ToolDefinition } from '../tools/definitions.js';

/**
 * Provider interfaces.
 *
 * All three are streaming-first and abort-aware, because barge-in has to be
 * able to cancel an in-flight LLM generation and an in-flight TTS synthesis
 * within a frame or two. A request/response interface would have made that
 * impossible to retrofit.
 */

// ---------------------------------------------------------------------------
// Speech to text
// ---------------------------------------------------------------------------

export type SttEvent =
  | { type: 'partial'; text: string }
  | { type: 'final'; text: string; language?: Language }
  | { type: 'speech_started' }
  | { type: 'utterance_end' }
  | { type: 'error'; message: string };

export interface SttStream {
  /** One 20 ms PCM16 frame at AGENT_SAMPLE_RATE. */
  write(frame: Int16Array): void;
  /** Force the provider to finalise whatever it has buffered. */
  finalize(): void;
  close(): void;
}

export interface SttOpenOptions {
  languageMode: LanguageMode;
  onEvent: (event: SttEvent) => void;
}

export interface SttProvider {
  readonly info: ProviderInfo;
  /**
   * False for the browser Web Speech fallback, where recognition happens on the
   * client and the server only ever receives finished text.
   */
  readonly transcribesServerSide: boolean;
  open(options: SttOpenOptions): SttStream;
}

// ---------------------------------------------------------------------------
// Language model
// ---------------------------------------------------------------------------

export interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LlmMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** Present on assistant messages that requested tools. */
  toolCalls?: LlmToolCall[];
  /** Present on tool messages, linking the result back to the call. */
  toolCallId?: string;
  toolName?: string;
}

export type LlmStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; call: LlmToolCall }
  | { type: 'done'; finishReason: string };

/**
 * A structured mirror of the state the system prompt already describes in
 * prose. Live providers ignore it entirely; MockLLM reads it so it can be
 * deterministic without parsing English out of the prompt.
 */
export interface LlmConversationState {
  language: Language;
  slots: QualificationSlots;
  declined: readonly SlotQuestionKey[];
  nextSlot: SlotQuestionKey | null;
  /** The slot the agent asked about on its previous turn. */
  lastAsked: SlotQuestionKey | null;
  turnIndex: number;
  situations: readonly Situation[];
  objection: ObjectionKey | null;
  projects: readonly Project[];
}

export interface LlmRequest {
  system: string;
  messages: readonly LlmMessage[];
  tools: readonly ToolDefinition[];
  state: LlmConversationState;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface LlmProvider {
  readonly info: ProviderInfo;
  stream(request: LlmRequest, signal: AbortSignal): AsyncIterable<LlmStreamEvent>;
  /** Single-shot completion, used by the post-call summarizer. */
  complete(request: LlmRequest, signal?: AbortSignal): Promise<string>;
}

// ---------------------------------------------------------------------------
// Text to speech
// ---------------------------------------------------------------------------

export interface TtsProvider {
  readonly info: ProviderInfo;
  /**
   * False for the browser SpeechSynthesis fallback, where the client speaks the
   * text itself and the server emits no audio at all.
   */
  readonly synthesizesServerSide: boolean;
  /** Yields PCM16 chunks at AGENT_SAMPLE_RATE as they arrive. */
  synthesize(text: string, language: Language, signal: AbortSignal): AsyncIterable<Int16Array>;
}

export interface ProviderSetInstance {
  stt: SttProvider;
  llm: LlmProvider;
  tts: TtsProvider;
}

export function describeProviders(providers: ProviderSetInstance): {
  stt: ProviderInfo;
  llm: ProviderInfo;
  tts: ProviderInfo;
} {
  return { stt: providers.stt.info, llm: providers.llm.info, tts: providers.tts.info };
}
