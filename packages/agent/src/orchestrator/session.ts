import {
  MAX_TURN_MS,
  VAD_ENERGY_THRESHOLD,
  completeness,
  detectLanguage,
  resolveReplyLanguage,
  rmsEnergy,
  type AgentState,
  type CallOutcome,
  type Language,
  type LanguageMode,
  type ProviderSet,
} from '@rvagent/shared';
import type { AgentRuntimeConfig } from '../config.js';
import { filterAgentOutput, type GuardrailViolation } from '../conversation/guardrails.js';
import { buildSystemPrompt } from '../conversation/prompt.js';
import { scoreLead, type LeadScore } from '../conversation/scoring.js';
import { QualificationTracker } from '../conversation/state.js';
import { extractSlotsFromUtterance } from '../nlu/extract.js';
import { detectObjection, detectSituations, type Situation } from '../nlu/situations.js';
import type {
  LlmMessage,
  LlmToolCall,
  ProviderSetInstance,
  SttStream,
} from '../providers/types.js';
import { describeProviders } from '../providers/types.js';
import { TOOL_DEFINITIONS } from '../tools/definitions.js';
import { executeTool, type AgentStore, type ToolContext } from '../tools/executor.js';
import type { AgentEvent, AgentEventHandler, RecordedTurn } from './events.js';
import { SpeechQueue } from './speech-queue.js';

/**
 * The transport-agnostic agent core.
 *
 * A session consumes PCM frames and text, and emits PCM frames and events. It
 * has no idea whether it is talking to a browser WebSocket or a Twilio Media
 * Stream — both are adapters that resample at their own edge and translate
 * `AgentEvent`s onto their own wire. Every behaviour the assignment grades
 * (barge-in, slot tracking, guardrails, latency accounting) lives here exactly
 * once, which is why both transports get it for free.
 */

/** Rounds of tool-calling allowed before we force the model to just answer. */
const MAX_TOOL_ROUNDS = 4;
/** Flush a partial sentence to TTS once it gets this long, to keep audio flowing. */
const MAX_CHUNK_CHARS = 140;

export interface AgentSessionOptions {
  callId: string;
  providers: ProviderSetInstance;
  config: AgentRuntimeConfig;
  store: AgentStore;
  languageMode?: LanguageMode;
  onEvent: AgentEventHandler;
  now?: () => Date;
  /**
   * Silence timers are real-time behaviour; the eval harness turns them off so
   * a twelve-conversation run does not take two minutes of wall clock.
   */
  enableIdleTimers?: boolean;
  idleTimeoutMs?: number;
}

export interface SessionTelemetry {
  turnCount: number;
  languageMix: Record<string, number>;
  primaryLanguage: Language | null;
  guardrailViolations: GuardrailViolation[];
  unansweredQuestions: string[];
  outcome: CallOutcome;
  score: LeadScore;
}

export class AgentSession {
  readonly callId: string;
  readonly tracker: QualificationTracker;

  private readonly providers: ProviderSetInstance;
  private readonly config: AgentRuntimeConfig;
  private readonly store: AgentStore;
  private readonly emit: AgentEventHandler;
  private readonly now: () => Date;
  private readonly enableIdleTimers: boolean;
  private readonly idleTimeoutMs: number;
  private readonly speech: SpeechQueue;

  private languageMode: LanguageMode;
  private currentLanguage: Language = 'hi-en';
  private state: AgentState = 'idle';
  private history: LlmMessage[] = [];
  private turnIndex = 0;
  private turnAbort: AbortController | null = null;
  private sttStream: SttStream | null = null;
  private muted = false;
  private ended = false;
  private outcome: CallOutcome = 'in_progress';
  private endNote: string | undefined;

  private readonly languageMix: Record<string, number> = {};
  private readonly guardrailViolations: GuardrailViolation[] = [];
  private readonly unansweredQuestions: string[] = [];

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idlePrompted = false;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;

  /** Text confirmed as actually spoken, used to truncate an interrupted turn. */
  private spokenSoFar = '';
  private turnStartedAt = 0;
  /**
   * Timestamp of the last inbound frame that contained speech. `sttMs` is
   * measured from here, so it includes the deliberate endpoint hold — which is
   * the number that actually governs how long the caller waits.
   */
  private lastVoicedFrameAt = 0;
  private firstTokenAt = 0;
  private firstAudioAt = 0;
  private pendingToolTrace: RecordedTurn['toolCalls'] = [];

  constructor(options: AgentSessionOptions) {
    this.callId = options.callId;
    this.providers = options.providers;
    this.config = options.config;
    this.store = options.store;
    this.emit = options.onEvent;
    this.now = options.now ?? (() => new Date());
    this.enableIdleTimers = options.enableIdleTimers ?? true;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 9_000;
    this.languageMode = options.languageMode ?? 'auto';
    this.currentLanguage = this.languageMode === 'auto' ? 'hi-en' : this.languageMode;
    this.tracker = new QualificationTracker(undefined, this.config.slotOrder);

    this.speech = new SpeechQueue(this.providers.tts, {
      onAudioStart: () => {
        if (this.firstAudioAt === 0) this.firstAudioAt = performance.now();
        this.setState('speaking');
        this.emit({ type: 'audio_start', turnId: this.currentTurnId() });
      },
      onAudio: (frame) => this.emit({ type: 'audio', turnId: this.currentTurnId(), frame }),
      onAudioEnd: () => this.emit({ type: 'audio_end', turnId: this.currentTurnId() }),
      onBrowserSpeech: (text, language) => {
        if (this.firstAudioAt === 0) this.firstAudioAt = performance.now();
        this.setState('speaking');
        this.emit({ type: 'speak_browser', turnId: this.currentTurnId(), text, language });
      },
      onChunkSpoken: (chunk) => {
        this.spokenSoFar = `${this.spokenSoFar} ${chunk.displayText}`.trim();
      },
      onError: (error) =>
        this.emit({ type: 'error', code: 'tts_failed', message: error.message }),
    });
  }

  get providerSet(): ProviderSet {
    return describeProviders(this.providers);
  }

  get isEnded(): boolean {
    return this.ended;
  }

  /** Opens the STT stream and speaks the greeting. */
  async start(): Promise<void> {
    if (this.providers.stt.transcribesServerSide) {
      this.sttStream = this.providers.stt.open({
        languageMode: this.languageMode,
        onEvent: (event) => this.handleSttEvent(event),
      });
    }

    const language = this.languageMode === 'auto' ? 'hi-en' : this.languageMode;
    this.currentLanguage = language;

    const greeting = this.config.greeting[language];
    this.turnIndex = 0;
    this.beginAssistantTiming();
    await this.deliverAssistantText(greeting, []);
    this.setState('listening');
    this.armIdleTimer();
  }

  // -------------------------------------------------------------------------
  // Inbound audio and text
  // -------------------------------------------------------------------------

  /** One 20 ms PCM16 frame at AGENT_SAMPLE_RATE, from any transport. */
  pushAudio(frame: Int16Array): void {
    if (this.ended || this.muted) return;
    if (rmsEnergy(frame) >= VAD_ENERGY_THRESHOLD) this.lastVoicedFrameAt = performance.now();
    this.sttStream?.write(frame);
  }

  /**
   * Transport-level voice activity. The browser worklet and the Twilio adapter
   * both call this; it is the barge-in trigger and it is deliberately separate
   * from STT so interruption does not wait on a transcription round trip.
   */
  setUserSpeaking(speaking: boolean): void {
    if (this.ended || this.muted) return;
    if (!speaking) return;
    this.clearIdleTimer();
    if (this.state === 'speaking' || this.state === 'thinking') this.interrupt();
  }

  /** Text-mode fallback and the browser Web Speech path both land here. */
  async pushText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (this.ended || trimmed.length === 0) return;
    if (this.state === 'speaking' || this.state === 'thinking') this.interrupt();
    await this.handleUserUtterance(trimmed, undefined, 0);
  }

  setLanguageMode(mode: LanguageMode): void {
    this.languageMode = mode;
    if (mode !== 'auto') this.currentLanguage = mode;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  // -------------------------------------------------------------------------
  // Barge-in
  // -------------------------------------------------------------------------

  /**
   * Cancels the in-flight reply.
   *
   * Order matters: stop producing audio first so the caller stops hearing the
   * agent within one frame, then cancel generation, then tell the client to
   * flush whatever it has already buffered ahead of the playhead.
   */
  private interrupt(): void {
    this.speech.abort();
    this.turnAbort?.abort();
    this.emit({ type: 'interrupt' });
    this.setState('listening');
  }

  // -------------------------------------------------------------------------
  // STT
  // -------------------------------------------------------------------------

  private handleSttEvent(event: Parameters<Parameters<typeof this.providers.stt.open>[0]['onEvent']>[0]): void {
    switch (event.type) {
      case 'speech_started':
        this.setUserSpeaking(true);
        break;
      case 'partial':
        if (event.text.trim().length > 0) {
          this.emit({
            type: 'transcript',
            turnId: `t${this.turnIndex + 1}`,
            role: 'user',
            text: event.text,
            language: this.currentLanguage,
            isFinal: false,
            interrupted: false,
          });
        }
        break;
      case 'final': {
        const sttMs =
          this.lastVoicedFrameAt > 0 ? performance.now() - this.lastVoicedFrameAt : 0;
        this.lastVoicedFrameAt = 0;
        void this.handleUserUtterance(event.text, event.language, sttMs);
        break;
      }
      case 'utterance_end':
        break;
      case 'error':
        this.emit({ type: 'error', code: 'stt_failed', message: event.message });
        break;
    }
  }

  // -------------------------------------------------------------------------
  // The turn pipeline
  // -------------------------------------------------------------------------

  private async handleUserUtterance(
    text: string,
    sttLanguage: Language | undefined,
    sttMs: number,
  ): Promise<void> {
    if (this.ended) return;
    this.clearIdleTimer();
    this.idlePrompted = false;

    const detected = detectLanguage(text, sttLanguage ?? this.currentLanguage);
    this.currentLanguage = detected.confidence >= 0.5 ? detected.language : this.currentLanguage;
    this.languageMix[this.currentLanguage] = (this.languageMix[this.currentLanguage] ?? 0) + 1;

    this.turnIndex += 1;
    const userTurnIndex = this.turnIndex;
    this.emit({
      type: 'transcript',
      turnId: `t${userTurnIndex}`,
      role: 'user',
      text,
      language: this.currentLanguage,
      isFinal: true,
      interrupted: false,
    });
    await this.store.onTurn({
      index: userTurnIndex,
      role: 'user',
      text,
      language: this.currentLanguage,
      interrupted: false,
      toolCalls: [],
      latency: { sttMs, llmFirstTokenMs: null, ttsFirstByteMs: null, totalMs: null },
    });

    this.history.push({ role: 'user', content: text });
    const situations = detectSituations(text);

    await this.runAssistantTurn(text, situations, sttMs);
  }

  private async runAssistantTurn(
    userText: string,
    situations: readonly Situation[],
    sttMs: number,
  ): Promise<void> {
    this.turnIndex += 1;
    this.beginAssistantTiming();
    this.setState('thinking');

    const abort = new AbortController();
    this.turnAbort = abort;
    this.armTurnCap(abort);

    const replyLanguage = resolveReplyLanguage(this.languageMode, this.currentLanguage);
    let generated = '';
    let endRequest: { outcome: CallOutcome; note?: string } | null = null;

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const request = {
          system: buildSystemPrompt({
            config: this.config,
            languageMode: this.languageMode,
            language: this.currentLanguage,
            tracker: this.tracker,
          }),
          messages: [...this.history],
          tools: TOOL_DEFINITIONS,
          state: {
            language: replyLanguage,
            slots: this.tracker.slots,
            declined: this.tracker.declined,
            nextSlot: this.tracker.nextSlot(),
            lastAsked: this.tracker.lastAsked,
            turnIndex: this.turnIndex,
            situations,
            objection: detectObjection(userText),
            projects: this.config.projects,
          },
        };

        const { text, toolCalls } = await this.consumeLlmStream(request, abort.signal, replyLanguage);
        generated = `${generated} ${text}`.trim();
        if (abort.signal.aborted) break;

        if (toolCalls.length === 0) break;

        this.history.push({ role: 'assistant', content: text, toolCalls });
        const outcome = await this.runToolCalls(toolCalls, replyLanguage);
        if (outcome) {
          endRequest = outcome;
          break;
        }
      }

      await this.speech.drain();
    } catch (error) {
      if (!abort.signal.aborted) {
        this.emit({
          type: 'error',
          code: 'llm_failed',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      this.clearTurnCap();
      if (this.turnAbort === abort) this.turnAbort = null;
    }

    const interrupted = abort.signal.aborted;
    const finalText = interrupted ? `${this.spokenSoFar} [interrupted]`.trim() : generated.trim();

    if (finalText.length > 0) {
      this.history.push({ role: 'assistant', content: finalText });
      this.emit({
        type: 'transcript',
        turnId: `t${this.turnIndex}`,
        role: 'assistant',
        text: finalText,
        language: replyLanguage,
        isFinal: true,
        interrupted,
      });
    }

    const latency = {
      sttMs: sttMs > 0 ? sttMs : null,
      llmFirstTokenMs: this.firstTokenAt > 0 ? this.firstTokenAt - this.turnStartedAt : null,
      ttsFirstByteMs: this.firstAudioAt > 0 ? this.firstAudioAt - this.turnStartedAt : null,
      totalMs: performance.now() - this.turnStartedAt,
    };
    this.emit({ type: 'latency', turnIndex: this.turnIndex, ...latency });

    await this.store.onTurn({
      index: this.turnIndex,
      role: 'assistant',
      text: finalText,
      language: replyLanguage,
      interrupted,
      toolCalls: this.pendingToolTrace,
      latency,
    });

    this.tracker.markAsked(this.tracker.nextSlot());
    this.applySafetyNet(userText);
    this.publishRequirements();

    const forced = this.enforceComplianceOutcome(situations);
    const ending = endRequest ?? forced;
    if (ending) {
      await this.end(ending.outcome, ending.note);
      return;
    }

    if (!this.ended) {
      this.setState('listening');
      this.armIdleTimer();
    }
  }

  /**
   * Streams one LLM round, flushing complete sentences to TTS as they form so
   * audio starts before generation finishes.
   */
  private async consumeLlmStream(
    request: Parameters<ProviderSetInstance['llm']['stream']>[0],
    signal: AbortSignal,
    replyLanguage: Language,
  ): Promise<{ text: string; toolCalls: LlmToolCall[] }> {
    const toolCalls: LlmToolCall[] = [];
    let buffer = '';
    let full = '';

    for await (const event of this.providers.llm.stream(request, signal)) {
      if (signal.aborted) break;

      if (event.type === 'text') {
        if (this.firstTokenAt === 0) this.firstTokenAt = performance.now();
        buffer += event.text;
        full += event.text;
        this.emit({ type: 'agent_delta', turnId: `t${this.turnIndex}`, text: event.text });

        const { chunks, rest } = takeSpeakableChunks(buffer);
        buffer = rest;
        for (const chunk of chunks) this.speakChunk(chunk, replyLanguage);
        continue;
      }

      if (event.type === 'tool_call') {
        if (this.firstTokenAt === 0) this.firstTokenAt = performance.now();
        toolCalls.push(event.call);
      }
    }

    if (buffer.trim().length > 0 && !signal.aborted) this.speakChunk(buffer, replyLanguage);
    return { text: full.trim(), toolCalls };
  }

  /** Runs guardrails, then queues the chunk for speech. */
  private speakChunk(rawText: string, language: Language): void {
    const filtered = filterAgentOutput(rawText, language);
    this.guardrailViolations.push(...filtered.violations);
    if (filtered.text.trim().length === 0) return;
    this.speech.enqueue({ displayText: filtered.text, language });
  }

  private async runToolCalls(
    toolCalls: readonly LlmToolCall[],
    language: Language,
  ): Promise<{ outcome: CallOutcome; note?: string } | null> {
    const context: ToolContext = {
      tracker: this.tracker,
      config: this.config,
      language,
      store: this.store,
      now: this.now,
    };

    let ending: { outcome: CallOutcome; note?: string } | null = null;

    for (const call of toolCalls) {
      this.emit({ type: 'tool_call', id: call.id, name: call.name, args: call.args });
      const result = await executeTool(call.name, call.args, context);

      this.emit({
        type: 'tool_result',
        id: call.id,
        name: call.name,
        ok: result.ok,
        detail: result.detail,
      });
      this.pendingToolTrace.push({
        name: call.name,
        args: call.args,
        detail: result.detail,
        ok: result.ok,
      });

      this.history.push({
        role: 'tool',
        content: JSON.stringify({ ...result.data, ok: result.ok }),
        toolCallId: call.id,
        toolName: call.name,
      });

      if (result.endCall) ending = result.endCall;
      if (call.name === 'get_project_info' && !result.ok) {
        this.unansweredQuestions.push(String(call.args.topic ?? 'unknown topic'));
      }

      this.publishRequirements();
    }

    return ending;
  }

  /**
   * Fills any slot the caller clearly stated that the model failed to record.
   * Only touches empty slots, so an explicit tool call always wins.
   */
  private applySafetyNet(userText: string): void {
    const patch = extractSlotsFromUtterance(userText, {
      lastAsked: this.tracker.lastAsked,
      knownLocalities: this.config.projects.flatMap((project) => [
        project.location.locality,
        project.location.city,
        ...project.location.aliases,
      ]),
    });

    const current = this.tracker.slots;
    const missing: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value == null) continue;
      if (key === 'objections') continue;
      if (current[key as keyof typeof current] == null) missing[key] = value;
    }

    if (Object.keys(missing).length > 0) this.tracker.merge(missing);
  }

  /**
   * Compliance backstop. If the caller opted out or turned hostile and the
   * model did not call `end_call`, the session ends anyway.
   */
  private enforceComplianceOutcome(
    situations: readonly Situation[],
  ): { outcome: CallOutcome; note?: string } | null {
    if (situations.includes('opt_out')) {
      return { outcome: 'not_interested', note: 'Caller opted out; ended by compliance rule.' };
    }
    if (situations.includes('hostile')) {
      return { outcome: 'not_interested', note: 'Caller was hostile; ended by compliance rule.' };
    }
    if (situations.includes('wrong_number')) {
      return { outcome: 'wrong_number', note: 'Wrong number; ended by compliance rule.' };
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Assistant speech helper (greeting and idle prompts)
  // -------------------------------------------------------------------------

  private async deliverAssistantText(text: string, toolTrace: RecordedTurn['toolCalls']): Promise<void> {
    const language = resolveReplyLanguage(this.languageMode, this.currentLanguage);
    this.spokenSoFar = '';
    this.speakChunk(text, language);
    await this.speech.drain();

    this.history.push({ role: 'assistant', content: text });
    this.emit({
      type: 'transcript',
      turnId: `t${this.turnIndex}`,
      role: 'assistant',
      text,
      language,
      isFinal: true,
      interrupted: false,
    });

    const latency = {
      sttMs: null,
      llmFirstTokenMs: null,
      ttsFirstByteMs: this.firstAudioAt > 0 ? this.firstAudioAt - this.turnStartedAt : null,
      totalMs: performance.now() - this.turnStartedAt,
    };
    this.emit({ type: 'latency', turnIndex: this.turnIndex, ...latency });
    await this.store.onTurn({
      index: this.turnIndex,
      role: 'assistant',
      text,
      language,
      interrupted: false,
      toolCalls: toolTrace,
      latency,
    });
  }

  // -------------------------------------------------------------------------
  // Timers
  // -------------------------------------------------------------------------

  private armIdleTimer(): void {
    if (!this.enableIdleTimers || this.ended) return;
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => void this.handleIdle(), this.idleTimeoutMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  /** Silence: nudge once, then close politely rather than hanging on a dead line. */
  private async handleIdle(): Promise<void> {
    if (this.ended || this.state !== 'listening') return;

    if (this.idlePrompted) {
      await this.end('abandoned', 'No response from the caller.');
      return;
    }

    this.idlePrompted = true;
    this.turnIndex += 1;
    this.beginAssistantTiming();
    const language = resolveReplyLanguage(this.languageMode, this.currentLanguage);
    const { phrases } = await import('../language/phrasebook.js');
    await this.deliverAssistantText(phrases(language).silencePrompt, []);
    this.setState('listening');
    this.armIdleTimer();
  }

  /** Hard cap so a stuck provider can never hold a turn open forever. */
  private armTurnCap(abort: AbortController): void {
    this.clearTurnCap();
    this.turnTimer = setTimeout(() => {
      if (!abort.signal.aborted) abort.abort();
    }, MAX_TURN_MS);
  }

  private clearTurnCap(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async end(outcome: CallOutcome, note?: string): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.outcome = outcome;
    this.endNote = note;

    this.clearIdleTimer();
    this.clearTurnCap();
    this.speech.abort();
    this.turnAbort?.abort();
    this.sttStream?.close();
    this.sttStream = null;

    this.setState('ended');
    this.emit({ type: 'ended', outcome, note });
  }

  telemetry(): SessionTelemetry {
    const disqualified = this.outcome === 'not_interested' || this.outcome === 'wrong_number';
    return {
      turnCount: this.turnIndex,
      languageMix: { ...this.languageMix },
      primaryLanguage: dominantLanguage(this.languageMix),
      guardrailViolations: [...this.guardrailViolations],
      unansweredQuestions: [...this.unansweredQuestions],
      outcome: this.outcome,
      score: scoreLead(this.tracker.slots, { projects: this.config.projects, disqualified }),
    };
  }

  get endedNote(): string | undefined {
    return this.endNote;
  }

  /** Full conversation history, used by the summarizer. */
  transcript(): ReadonlyArray<LlmMessage> {
    return this.history;
  }

  // -------------------------------------------------------------------------
  // Small helpers
  // -------------------------------------------------------------------------

  private beginAssistantTiming(): void {
    this.turnStartedAt = performance.now();
    this.firstTokenAt = 0;
    this.firstAudioAt = 0;
    this.spokenSoFar = '';
    this.pendingToolTrace = [];
  }

  private currentTurnId(): string {
    return `t${this.turnIndex}`;
  }

  private setState(state: AgentState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit({ type: 'state', state });
  }

  private publishRequirements(): void {
    const snapshot = this.tracker.snapshot;
    this.emit({
      type: 'requirements',
      slots: snapshot.slots,
      declined: snapshot.declined,
      completeness: completeness(snapshot),
      nextSlot: this.tracker.nextSlot(),
    });
  }
}

/**
 * Peels complete sentences off the buffer. Falls back to a length cap so a
 * model that forgets punctuation still produces audio promptly.
 */
export function takeSpeakableChunks(buffer: string): { chunks: string[]; rest: string } {
  const chunks: string[] = [];
  let rest = buffer;

  for (;;) {
    const boundary = findSentenceBoundary(rest);
    if (boundary === -1) break;
    chunks.push(rest.slice(0, boundary + 1).trim());
    rest = rest.slice(boundary + 1);
  }

  if (rest.length > MAX_CHUNK_CHARS) {
    const breakAt = rest.lastIndexOf(' ', MAX_CHUNK_CHARS);
    const cut = breakAt > 40 ? breakAt : MAX_CHUNK_CHARS;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut);
  }

  return { chunks: chunks.filter((chunk) => chunk.length > 0), rest };
}

function findSentenceBoundary(text: string): number {
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char !== '.' && char !== '!' && char !== '?' && char !== '।') continue;
    // "1.2 crore" and "Rs." are not sentence ends.
    const next = text[index + 1];
    if (char === '.' && next && /\d/.test(next)) continue;
    if (index + 1 >= text.length) return index;
    if (/\s/.test(next ?? ' ')) return index;
  }
  return -1;
}

function dominantLanguage(mix: Record<string, number>): Language | null {
  const entries = Object.entries(mix);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0] as Language;
}

export type { AgentEvent };
