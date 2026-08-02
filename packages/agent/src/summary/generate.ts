import {
  formatBudgetRange,
  type CallOutcome,
  type Language,
  type QualificationSlots,
  type SlotQuestionKey,
} from '@rvagent/shared';
import type { LeadScore } from '../conversation/scoring.js';
import type { Project } from '../kb/schema.js';
import { SUMMARIZER_PROMPT } from '../prompts/compiled.js';
import type { LlmProvider } from '../providers/types.js';
import { callSummarySchema, parseSummaryJson, type CallSummary } from './schema.js';

export interface SummaryTurn {
  role: 'user' | 'assistant';
  text: string;
  language: Language;
}

export interface SummaryInput {
  turns: readonly SummaryTurn[];
  slots: QualificationSlots;
  declined: readonly SlotQuestionKey[];
  outcome: CallOutcome;
  score: LeadScore;
  unansweredQuestions: readonly string[];
  projects: readonly Project[];
  durationSec: number;
}

export interface GeneratedSummary {
  summary: CallSummary;
  /** "llm:<model>" or "template", surfaced in the dashboard. */
  generatedBy: string;
}

/**
 * Produces the post-call summary.
 *
 * The deterministic template is not a degraded path — it is the default in mock
 * mode and the fallback whenever a model returns something that fails schema
 * validation. A summary that is always present and always well-formed is worth
 * more to a sales team than a prettier one that sometimes fails.
 */
export async function generateCallSummary(
  input: SummaryInput,
  llm: LlmProvider,
): Promise<GeneratedSummary> {
  if (llm.info.mode === 'live') {
    try {
      const raw = await llm.complete({
        system: SUMMARIZER_PROMPT,
        messages: [{ role: 'user', content: buildSummarizerPayload(input) }],
        tools: [],
        state: {
          language: 'en',
          slots: input.slots,
          declined: input.declined,
          nextSlot: null,
          lastAsked: null,
          turnIndex: input.turns.length,
          situations: [],
          objection: null,
          projects: input.projects,
        },
        temperature: 0.2,
        maxOutputTokens: 1_400,
      });

      const parsed = parseSummaryJson(raw);
      if (parsed) return { summary: parsed, generatedBy: `llm:${llm.info.model}` };
    } catch {
      // Fall through to the template.
    }
  }

  return { summary: buildTemplateSummary(input), generatedBy: 'template' };
}

function buildSummarizerPayload(input: SummaryInput): string {
  const transcript = input.turns
    .map((turn) => `${turn.role === 'user' ? 'Caller' : 'Priya'} [${turn.language}]: ${turn.text}`)
    .join('\n');

  return [
    `Call outcome: ${input.outcome}`,
    `Duration: ${input.durationSec} seconds`,
    `Captured slots: ${JSON.stringify(input.slots)}`,
    `Slots the caller declined: ${input.declined.join(', ') || 'none'}`,
    `Questions the agent could not answer: ${input.unansweredQuestions.join('; ') || 'none'}`,
    '',
    'Transcript:',
    transcript,
    '',
    `Respond with JSON matching this schema: ${JSON.stringify(schemaHint())}`,
  ].join('\n');
}

function schemaHint(): Record<string, string> {
  return {
    requirements: 'object with intent, configuration, location, budget, purpose, timeline, financing, name, phone (all string or null)',
    qualificationScore: 'integer 0-100',
    scoreReasoning: 'string',
    leadTemperature: 'hot | warm | cold',
    keyPoints: 'string[]',
    objections: 'string[]',
    questionsAgentCouldNotAnswer: 'string[]',
    sentiment: 'positive | neutral | negative',
    nextAction: 'string',
    suggestedFollowUpDate: 'ISO date string or null',
    agentNotes: 'string',
    summaryEn: '4-6 lines of English prose',
    summaryHi: '4-6 lines of Hindi prose in Devanagari, English loanwords in Latin script',
  };
}

// ---------------------------------------------------------------------------
// Deterministic template
// ---------------------------------------------------------------------------

const OUTCOME_LABEL: Record<CallOutcome, string> = {
  qualified: 'Lead qualified',
  not_interested: 'Caller not interested',
  callback_requested: 'Callback requested',
  wrong_number: 'Wrong number',
  abandoned: 'Call abandoned',
  in_progress: 'Call still in progress',
};

const OUTCOME_LABEL_HI: Record<CallOutcome, string> = {
  qualified: 'लीड qualified हुई',
  not_interested: 'कॉलर ने interest नहीं दिखाया',
  callback_requested: 'Callback माँगा गया',
  wrong_number: 'ग़लत नंबर',
  abandoned: 'कॉल बीच में छूट गई',
  in_progress: 'कॉल अभी चल रही है',
};

const INTENT_LABEL: Record<string, string> = {
  buy: 'buying',
  invest: 'investing',
  rent: 'renting',
  just_looking: 'just exploring',
};

export function buildTemplateSummary(input: SummaryInput): CallSummary {
  const { slots, score, outcome } = input;
  const budget = formatBudgetRange(slots.budgetMin, slots.budgetMax);
  const optedOut = outcome === 'not_interested' || outcome === 'wrong_number';

  const keyPoints = [
    slots.intent ? `Caller is ${INTENT_LABEL[slots.intent] ?? slots.intent}.` : null,
    slots.configuration ? `Wants a ${slots.configuration}.` : null,
    slots.location ? `Preferred location: ${slots.location}.` : null,
    slots.budgetMin != null || slots.budgetMax != null ? `Budget: ${budget}.` : null,
    slots.timeline ? `Timeline: ${humanTimeline(slots.timeline)}.` : null,
    slots.financing ? `Financing: ${slots.financing.replace('_', ' ')}.` : null,
    input.declined.length > 0 ? `Declined to share: ${input.declined.join(', ')}.` : null,
  ].filter((point): point is string => point !== null);

  const nextAction = buildNextAction(input);
  const followUp = optedOut ? null : isoDate(followUpOffsetDays(score.score));

  return callSummarySchema.parse({
    requirements: {
      intent: slots.intent ?? null,
      configuration: slots.configuration ?? null,
      location: slots.location ?? null,
      budget: slots.budgetMin != null || slots.budgetMax != null ? budget : null,
      purpose: slots.purpose ?? null,
      timeline: slots.timeline ?? null,
      financing: slots.financing ?? null,
      name: slots.name ?? null,
      phone: slots.phone ?? null,
    },
    qualificationScore: score.score,
    scoreReasoning: score.reasoning.join(' '),
    leadTemperature: score.temperature,
    keyPoints: keyPoints.slice(0, 8),
    objections: slots.objections.slice(0, 8),
    questionsAgentCouldNotAnswer: input.unansweredQuestions.slice(0, 8),
    sentiment: sentimentFor(outcome, slots.objections.length),
    nextAction,
    suggestedFollowUpDate: followUp,
    agentNotes: buildAgentNotes(input),
    summaryEn: buildEnglishSummary(input, budget, nextAction),
    summaryHi: buildHindiSummary(input, budget),
  });
}

function buildEnglishSummary(input: SummaryInput, budget: string, nextAction: string): string {
  const { slots, score, outcome } = input;
  const name = slots.name ?? 'The caller';

  return [
    `${OUTCOME_LABEL[outcome]} after a ${Math.max(1, Math.round(input.durationSec / 60))}-minute conversation across ${input.turns.length} turns.`,
    `${name} is looking at ${describeRequirement(slots)}${slots.location ? ` in ${slots.location}` : ''}, with a budget of ${budget}.`,
    `${slots.timeline ? `They want to close ${humanTimeline(slots.timeline)}` : 'No timeline was given'}${slots.financing ? `, financing via ${slots.financing.replace('_', ' ')}` : ''}.`,
    slots.objections.length > 0
      ? `Objections raised: ${slots.objections.join('; ')}.`
      : 'No objections were raised during the call.',
    `Qualification score ${score.score}/100 (${score.temperature}).`,
    `Next action: ${nextAction}`,
  ].join('\n');
}

function buildHindiSummary(input: SummaryInput, budget: string): string {
  const { slots, score, outcome } = input;
  const name = slots.name ?? 'कॉलर';

  return [
    `${OUTCOME_LABEL_HI[outcome]} — कुल ${input.turns.length} turns की बातचीत हुई।`,
    `${name} ${describeRequirementHi(slots)}${slots.location ? ` ${slots.location} में` : ''} देख रहे हैं, budget ${budget}।`,
    slots.timeline
      ? `Timeline: ${humanTimelineHi(slots.timeline)}${slots.financing ? `, payment ${slots.financing === 'loan' ? 'home loan से' : slots.financing === 'self_funded' ? 'self-funded' : 'अभी तय नहीं'}` : ''}।`
      : 'Timeline अभी तय नहीं हुई।',
    slots.objections.length > 0
      ? `Objections: ${slots.objections.join('; ')}।`
      : 'कॉल में कोई objection नहीं आया।',
    `Qualification score ${score.score}/100 (${score.temperature})।`,
  ].join('\n');
}

function describeRequirement(slots: QualificationSlots): string {
  if (slots.configuration) return `a ${slots.configuration}`;
  if (slots.propertyType) return `a ${slots.propertyType}`;
  return 'a property';
}

function describeRequirementHi(slots: QualificationSlots): string {
  if (slots.configuration) return `${slots.configuration}`;
  if (slots.propertyType) return `${slots.propertyType}`;
  return 'property';
}

function buildNextAction(input: SummaryInput): string {
  const { slots, outcome, score } = input;

  if (outcome === 'not_interested') return 'Add to the do-not-call list. No follow-up.';
  if (outcome === 'wrong_number') return 'Remove this number from the campaign list.';
  if (outcome === 'callback_requested') {
    return `Call back${slots.preferredCallbackTime ? ` at ${slots.preferredCallbackTime}` : ''}.`;
  }
  if (outcome === 'abandoned') return 'Retry the call once; the line went silent.';

  const missing: string[] = [];
  if (!slots.phone) missing.push('phone number');
  if (!slots.budgetMin && !slots.budgetMax) missing.push('budget');
  if (missing.length > 0) return `Follow up to capture the ${missing.join(' and ')}.`;

  return score.score >= 70
    ? `Send the ${slots.configuration ?? 'shortlisted'} floor plans and price sheet, then confirm a site visit.`
    : 'Send the project brochure and check back in a week.';
}

function buildAgentNotes(input: SummaryInput): string {
  const notes: string[] = [];
  if (input.unansweredQuestions.length > 0) {
    notes.push(`Agent could not answer: ${input.unansweredQuestions.join('; ')}.`);
  }
  if (input.declined.length > 0) {
    notes.push(`Caller declined to share: ${input.declined.join(', ')}.`);
  }
  notes.push('Summary generated by the deterministic template (no summarizer LLM configured).');
  return notes.join(' ');
}

function sentimentFor(outcome: CallOutcome, objectionCount: number): 'positive' | 'neutral' | 'negative' {
  if (outcome === 'not_interested' || outcome === 'wrong_number') return 'negative';
  if (outcome === 'qualified' && objectionCount === 0) return 'positive';
  return objectionCount > 1 ? 'negative' : 'neutral';
}

function followUpOffsetDays(score: number): number {
  if (score >= 70) return 1;
  if (score >= 40) return 3;
  return 14;
}

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

const TIMELINE_LABEL: Record<string, string> = {
  immediate: 'immediately',
  '3_months': 'within 3 months',
  '6_months': 'within 6 months',
  '12_months': 'within a year',
  exploring: 'with no fixed timeline',
};

const TIMELINE_LABEL_HI: Record<string, string> = {
  immediate: 'तुरंत',
  '3_months': '3 महीने में',
  '6_months': '6 महीने में',
  '12_months': 'एक साल में',
  exploring: 'अभी कोई तय समय नहीं',
};

function humanTimeline(timeline: string): string {
  return TIMELINE_LABEL[timeline] ?? timeline;
}

function humanTimelineHi(timeline: string): string {
  return TIMELINE_LABEL_HI[timeline] ?? timeline;
}
