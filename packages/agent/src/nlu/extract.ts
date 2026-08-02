import type { QualificationSlotsPatch, SlotQuestionKey } from '@rvagent/shared';
import { parseBudget } from './budget.js';
import { parsePhone } from './phone.js';
import { detectObjection } from './situations.js';
import {
  parseConfiguration,
  parseFinancing,
  parseIntent,
  parseLocation,
  parseName,
  parsePropertyType,
  parsePurpose,
  parseTimeline,
} from './slots.js';

export interface ExtractionContext {
  /** The slot the agent asked about last turn — disambiguates bare answers. */
  lastAsked: SlotQuestionKey | null;
  knownLocalities: readonly string[];
}

/**
 * Runs every parser over one user utterance and returns a slot patch.
 *
 * Two rules keep this from fighting the LLM:
 *  - Only *positive* findings are returned; nothing is ever cleared here.
 *  - Answers to the question that was just asked are trusted more, so a bare
 *    "Wakad" fills `location` when location was the open question.
 */
export function extractSlotsFromUtterance(
  text: string,
  context: ExtractionContext,
): QualificationSlotsPatch {
  const patch: QualificationSlotsPatch = {};

  const intent = parseIntent(text);
  if (intent) patch.intent = intent;

  const configuration = parseConfiguration(text);
  if (configuration) patch.configuration = configuration;

  const propertyType = parsePropertyType(text);
  if (propertyType) patch.propertyType = propertyType;

  const purpose = parsePurpose(text);
  if (purpose) patch.purpose = purpose;

  const timeline = parseTimeline(text);
  if (timeline) patch.timeline = timeline;

  const financing = parseFinancing(text);
  if (financing) patch.financing = financing;

  const budget = parseBudget(text);
  if (budget) {
    if (budget.budgetMin != null) patch.budgetMin = budget.budgetMin;
    if (budget.budgetMax != null) patch.budgetMax = budget.budgetMax;
  }

  const location = parseLocation(text, context.knownLocalities);
  if (location) patch.location = location;

  const name = parseName(text);
  if (name) patch.name = name;

  const phone = parsePhone(text);
  if (phone?.valid) patch.phone = phone.phone;

  const objection = detectObjection(text);
  if (objection) patch.objections = [objection];

  applyBareAnswer(text, context, patch);
  return patch;
}

/**
 * A caller answering "which area?" with just "Wakad" produces no pattern match,
 * because there is no locative preposition to anchor on. When the utterance is
 * short and the open question is known, take it at face value.
 */
function applyBareAnswer(
  text: string,
  context: ExtractionContext,
  patch: QualificationSlotsPatch,
): void {
  const trimmed = text.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount === 0 || wordCount > 4) return;

  if (context.lastAsked === 'location' && patch.location == null && /^[\p{L}\s]+$/u.test(trimmed)) {
    patch.location = trimmed.replace(/\s+/g, ' ');
    return;
  }

  if (context.lastAsked === 'name' && patch.name == null && /^[\p{L}\s.]+$/u.test(trimmed)) {
    patch.name = trimmed.replace(/\s+/g, ' ');
    return;
  }

  if (context.lastAsked === 'preferredCallbackTime' && patch.preferredCallbackTime == null) {
    patch.preferredCallbackTime = trimmed;
  }
}
