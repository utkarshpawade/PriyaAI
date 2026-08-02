import type { Language, SlotQuestionKey } from '@rvagent/shared';
import { DEFAULT_SLOT_ORDER } from './conversation/state.js';
import { applyKbOverrides, type KbOverrides } from './kb/index.js';
import type { Project } from './kb/schema.js';
import { PHRASEBOOK } from './language/phrasebook.js';

/**
 * Everything about the agent's behaviour that `/admin` can change at runtime.
 *
 * Held as a plain value rather than read from the database inside the
 * orchestrator, so a config change is a single atomic swap: an in-flight call
 * either has the old config or the new one, never half of each.
 */
export interface AgentRuntimeConfig {
  /** AgentConfig row id, or null when running on the built-in defaults. */
  version: number | null;
  label: string;
  persona: string;
  greeting: Record<Language, string>;
  /** Extra sentences appended to the prompt's guardrail section. */
  extraGuardrails: string[];
  slotOrder: SlotQuestionKey[];
  /** The knowledge base with any admin overrides already merged in. */
  projects: Project[];
}

const DEFAULT_PERSONA =
  'You have six years of experience selling homes in west Pune. You listen more than you talk, you never oversell, and you would rather lose a sale than mislead someone.';

export function defaultAgentConfig(): AgentRuntimeConfig {
  return {
    version: null,
    label: 'built-in defaults',
    persona: DEFAULT_PERSONA,
    greeting: {
      hi: PHRASEBOOK.hi.greeting,
      'hi-en': PHRASEBOOK['hi-en'].greeting,
      en: PHRASEBOOK.en.greeting,
    },
    extraGuardrails: [],
    slotOrder: [...DEFAULT_SLOT_ORDER],
    projects: applyKbOverrides(null),
  };
}

/** The shape of an `AgentConfig` database row, structurally typed. */
export interface AgentConfigRecord {
  id: number;
  label: string;
  greetingHinglish: string;
  greetingHindi: string;
  greetingEnglish: string;
  persona: string;
  guardrails: string[];
  slotOrder: string[];
  kbOverrides: unknown;
}

/**
 * Builds a runtime config from a database row.
 *
 * Falls back to the built-in defaults field by field, and lets an invalid KB
 * override throw so the caller can keep serving the previous version rather
 * than starting a call with a half-valid knowledge base.
 */
export function agentConfigFromRecord(record: AgentConfigRecord): AgentRuntimeConfig {
  const defaults = defaultAgentConfig();
  const slotOrder = record.slotOrder.filter((key): key is SlotQuestionKey =>
    (DEFAULT_SLOT_ORDER as readonly string[]).includes(key),
  );

  return {
    version: record.id,
    label: record.label,
    persona: record.persona.trim() || defaults.persona,
    greeting: {
      hi: record.greetingHindi.trim() || defaults.greeting.hi,
      'hi-en': record.greetingHinglish.trim() || defaults.greeting['hi-en'],
      en: record.greetingEnglish.trim() || defaults.greeting.en,
    },
    extraGuardrails: record.guardrails.filter((line) => line.trim().length > 0),
    slotOrder: slotOrder.length > 0 ? slotOrder : defaults.slotOrder,
    projects: applyKbOverrides(record.kbOverrides as KbOverrides | null),
  };
}
