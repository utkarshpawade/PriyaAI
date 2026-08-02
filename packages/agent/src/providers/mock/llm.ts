import type { ProviderInfo, QualificationSlotsPatch } from '@rvagent/shared';
import { primaryProject } from '../../kb/index.js';
import { acknowledgement, phrases } from '../../language/phrasebook.js';
import { parseVisitDateTime } from '../../nlu/datetime.js';
import { extractSlotsFromUtterance } from '../../nlu/extract.js';
import { wordPattern } from '../../nlu/pattern.js';
import type {
  LlmProvider,
  LlmRequest,
  LlmStreamEvent,
  LlmToolCall,
  LlmMessage,
} from '../types.js';
import { AVAILABILITY_PATTERN, answerForTopic, answerForUnits, detectTopic } from './answers.js';

/**
 * Deterministic, offline LLM.
 *
 * It runs the *same* orchestrator, the same tools and the same guardrails as a
 * live model — it simply decides what to say with rules instead of weights.
 * That is what makes the whole product demoable and evaluable with zero API
 * keys, and what makes `pnpm eval` a meaningful regression test rather than a
 * test of a network connection.
 */

const VISIT_INTENT = wordPattern(
  'visit|site|aana|aaunga|aaungi|aayenge|dekhne|dekhna|dekh\\s*lete|come\\s*(?:and\\s*)?see|show\\s*me\\s*the\\s*site|विज़िट|आना|देखने',
);

export class MockLlmProvider implements LlmProvider {
  readonly info: ProviderInfo = {
    name: 'MockLLM',
    model: 'rule-based-slot-machine',
    mode: 'mock',
  };

  async *stream(request: LlmRequest, signal: AbortSignal): AsyncIterable<LlmStreamEvent> {
    const plan = planTurn(request);

    for (const chunk of chunkForStreaming(plan.text)) {
      if (signal.aborted) return;
      yield { type: 'text', text: chunk };
    }

    for (const call of plan.toolCalls) {
      if (signal.aborted) return;
      yield { type: 'tool_call', call };
    }

    yield { type: 'done', finishReason: plan.toolCalls.length > 0 ? 'tool_calls' : 'stop' };
  }

  /**
   * Unused: the post-call summarizer detects a mock LLM and takes its
   * deterministic template path instead of asking a model for JSON.
   */
  async complete(): Promise<string> {
    return '';
  }
}

interface TurnPlan {
  text: string;
  toolCalls: LlmToolCall[];
}

function planTurn(request: LlmRequest): TurnPlan {
  const lastMessage = request.messages[request.messages.length - 1];
  if (!lastMessage) return { text: '', toolCalls: [] };
  return lastMessage.role === 'tool'
    ? respondToToolResults(request)
    : respondToUser(request, lastMessage.content);
}

// ---------------------------------------------------------------------------
// Round 1 — the caller just said something
// ---------------------------------------------------------------------------

function respondToUser(request: LlmRequest, userText: string): TurnPlan {
  const { state } = request;
  const set = phrases(state.language);

  // Compliance behaviours end the call immediately, whatever else was said.
  if (state.situations.includes('opt_out')) {
    return terminal(set.closings.not_interested, 'not_interested');
  }
  if (state.situations.includes('hostile')) {
    return terminal(set.closings.hostile, 'not_interested');
  }
  if (state.situations.includes('wrong_number')) {
    return terminal(set.closings.wrong_number, 'wrong_number');
  }

  const toolCalls: LlmToolCall[] = [];
  const declining = state.situations.includes('declines_slot') && state.lastAsked !== null;
  const patch = declining
    ? {}
    : extractSlotsFromUtterance(userText, {
        lastAsked: state.lastAsked,
        knownLocalities: knownLocalities(request),
      });
  const { contact, requirements } = splitPatch(patch);

  if (declining && state.lastAsked) {
    // Record the refusal so the slot machine skips it for the rest of the call.
    toolCalls.push(toolCall('update_requirements', { declined: [state.lastAsked] }));
  } else if (Object.keys(requirements).length > 0) {
    toolCalls.push(toolCall('update_requirements', requirements));
  }
  if (Object.keys(contact).length > 0) {
    toolCalls.push(toolCall('capture_contact', contact));
  }

  const prefix = situationPrefix(request, userText);

  // A caller who names a day after being offered a visit is booking one.
  if (shouldScheduleVisit(request, userText)) {
    toolCalls.push(toolCall('schedule_site_visit', { dateHint: userText.trim().slice(0, 120) }));
    return { text: prefix, toolCalls };
  }

  const topic = detectTopic(userText);
  if (topic) {
    toolCalls.push(toolCall('get_project_info', { topic }));
    return { text: prefix, toolCalls };
  }

  if (AVAILABILITY_PATTERN.test(userText)) {
    toolCalls.push(toolCall('check_matching_units', {}));
    return { text: prefix, toolCalls };
  }

  if (toolCalls.length > 0) return { text: prefix, toolCalls };

  // Nothing to record and nothing to look up: acknowledge and move the
  // qualification forward.
  return { text: join(prefix, nextUtterance(request)), toolCalls: closingToolCalls(request) };
}

/**
 * Situations that deserve an inline answer before the conversation continues.
 * Returns '' when the caller said nothing that needs one.
 */
function situationPrefix(request: LlmRequest, userText: string): string {
  const set = phrases(request.state.language);
  const { situations } = request.state;

  if (situations.includes('is_human')) return set.aiDisclosure;
  if (situations.includes('how_got_number')) return set.numberSource;
  if (situations.includes('who_is_this')) return set.reintroduce;
  if (situations.includes('discount')) return set.objections.discount;
  if (situations.includes('loan_query')) return set.loanGuidance;
  if (situations.includes('busy')) return set.objections.busy_now;
  if (request.state.objection) return set.objections[request.state.objection];
  // An off-topic question the knowledge base cannot answer.
  if (isUnanswerableQuestion(userText)) return set.cannotAnswer;
  return '';
}

const QUESTION_WORDS = wordPattern(
  'kya|kaise|kab|kah?an|kitna|kitni|kitne|why|how|what|when|where|which|क्या|कैसे|कब|कहाँ|कहां|कितना|कितनी|कितने',
);

/**
 * A question with no matching knowledge-base topic. The agent must say it does
 * not know rather than improvise — this is the anti-hallucination path.
 */
function isUnanswerableQuestion(text: string): boolean {
  const looksLikeQuestion = text.includes('?') || QUESTION_WORDS.test(text);
  return looksLikeQuestion && detectTopic(text) === null && !AVAILABILITY_PATTERN.test(text);
}

// ---------------------------------------------------------------------------
// Round 2 — tools have run, now say something grounded
// ---------------------------------------------------------------------------

function respondToToolResults(request: LlmRequest): TurnPlan {
  const set = phrases(request.state.language);
  const results = trailingToolMessages(request.messages);

  for (const message of results) {
    if (message.toolName === 'end_call') return { text: '', toolCalls: [] };
  }

  const parts: string[] = [];

  for (const message of results) {
    const data = safeParse(message.content);

    if (message.toolName === 'get_project_info') {
      const slug = typeof data.slug === 'string' ? data.slug : null;
      const project =
        request.state.projects.find((candidate) => candidate.slug === slug) ??
        primaryProject(request.state.projects);
      const topic = data.topic;
      if (typeof topic === 'string') {
        parts.push(answerForTopic(topic as never, project, request.state.language));
      }
      continue;
    }

    if (message.toolName === 'check_matching_units') {
      const units = Array.isArray(data.units) ? data.units : [];
      parts.push(
        answerForUnits(
          units as never,
          data.isAlternativeSet === true,
          request.state.language,
        ),
      );
      continue;
    }

    if (message.toolName === 'schedule_site_visit' && data.ok !== false) {
      parts.push(set.siteVisitConfirmed);
    }
  }

  const scheduled = results.some((message) => message.toolName === 'schedule_site_visit');
  if (scheduled) {
    return terminal(join(parts.join(' '), set.closings.qualified), 'qualified');
  }

  return {
    text: join(parts.join(' '), nextUtterance(request)),
    toolCalls: closingToolCalls(request),
  };
}

// ---------------------------------------------------------------------------
// Shared turn planning
// ---------------------------------------------------------------------------

/** The next thing to say: a slot question, a visit offer, or a closing line. */
function nextUtterance(request: LlmRequest): string {
  const { state } = request;
  const set = phrases(state.language);

  if (state.nextSlot) {
    return join(acknowledgement(state.language, state.turnIndex), set.slotQuestions[state.nextSlot]);
  }

  if (state.slots.preferredCallbackTime) return set.closings.callback_requested;
  if (!visitOffered(request.messages)) return set.siteVisitOffer;
  return set.closings.qualified;
}

/** Emits `end_call` once there is nothing left to ask and no visit to book. */
function closingToolCalls(request: LlmRequest): LlmToolCall[] {
  const { state } = request;
  if (state.nextSlot) return [];

  if (state.slots.preferredCallbackTime) {
    return [toolCall('end_call', { reason: 'callback_requested' })];
  }
  if (!visitOffered(request.messages)) return [];
  return [toolCall('end_call', { reason: 'qualified' })];
}

function shouldScheduleVisit(request: LlmRequest, userText: string): boolean {
  const wantsVisit = VISIT_INTENT.test(userText) || visitOffered(request.messages);
  if (!wantsVisit) return false;
  if (request.state.situations.includes('negative')) return false;
  return parseVisitDateTime(userText) !== null;
}

function visitOffered(messages: readonly LlmMessage[]): boolean {
  return messages.some(
    (message) => message.role === 'assistant' && /site\s*visit|विज़िट|visit\?/i.test(message.content),
  );
}

function terminal(text: string, reason: string): TurnPlan {
  return { text, toolCalls: [toolCall('end_call', { reason })] };
}

/** `capture_contact` owns identity fields; `update_requirements` owns the rest. */
function splitPatch(patch: QualificationSlotsPatch): {
  contact: Record<string, unknown>;
  requirements: Record<string, unknown>;
} {
  const contact: Record<string, unknown> = {};
  const requirements: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (value == null) continue;
    if (key === 'name' || key === 'phone' || key === 'email') contact[key] = value;
    else requirements[key] = value;
  }
  return { contact, requirements };
}

function knownLocalities(request: LlmRequest): string[] {
  return request.state.projects.flatMap((project) => [
    project.location.locality,
    project.location.city,
    ...project.location.aliases,
  ]);
}

function trailingToolMessages(messages: readonly LlmMessage[]): LlmMessage[] {
  const results: LlmMessage[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'tool') break;
    results.unshift(message);
  }
  return results;
}

function safeParse(content: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(content);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

let toolCallCounter = 0;

function toolCall(name: string, args: Record<string, unknown>): LlmToolCall {
  toolCallCounter += 1;
  return { id: `mock-${toolCallCounter}`, name, args };
}

function join(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');
}

/** Splits into sentence-sized chunks so the orchestrator's streaming path runs. */
function chunkForStreaming(text: string): string[] {
  if (text.length === 0) return [];
  return text
    .split(/(?<=[.!?।])\s+/)
    .filter((chunk) => chunk.trim().length > 0)
    .map((chunk, index, all) => (index === all.length - 1 ? chunk : `${chunk} `));
}
