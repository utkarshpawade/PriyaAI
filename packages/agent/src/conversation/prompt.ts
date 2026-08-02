import { formatBudgetRange, type Language, type LanguageMode, type SlotQuestionKey } from '@rvagent/shared';
import type { AgentRuntimeConfig } from '../config.js';
import { PHRASEBOOK } from '../language/phrasebook.js';
import { primaryProject } from '../kb/index.js';
import type { Project } from '../kb/schema.js';
import { SALES_AGENT_PROMPT_TEMPLATE } from '../prompts/compiled.js';
import type { QualificationTracker } from './state.js';

export interface PromptContext {
  config: AgentRuntimeConfig;
  languageMode: LanguageMode;
  /** Language detected on the caller's most recent turn. */
  language: Language;
  tracker: QualificationTracker;
}

const LANGUAGE_INSTRUCTIONS: Record<LanguageMode, (detected: Language) => string> = {
  auto: (detected) =>
    [
      '## Language',
      '',
      "**Mirror the caller.** Reply in whatever register they are using, and switch the moment they switch — mid-call is normal and expected.",
      '',
      `The caller's most recent turn was detected as **${describeLanguage(detected)}**, so reply in that register now.`,
      '',
      ...REGISTER_RULES,
    ].join('\n'),
  hi: () =>
    [
      '## Language',
      '',
      '**Reply only in Hindi, written in Devanagari script**, regardless of what the caller uses. This has been forced by the operator.',
      '',
      'Keep English loanwords in Latin script — "2 BHK", "budget", "possession", "site visit", "RERA", "EMI", "carpet area", "clubhouse". Indian buyers use these words in English and a Devanagari transliteration of them sounds wrong.',
    ].join('\n'),
  'hi-en': () =>
    [
      '## Language',
      '',
      '**Reply only in Hinglish**, regardless of what the caller uses. This has been forced by the operator.',
      '',
      'Hinglish means Hindi sentence structure written in Latin script, with English nouns left in English: "Aapka budget approximately kitna hai?" — not "आपका बजट कितना है?" and not "What is your budget?".',
    ].join('\n'),
  en: () =>
    [
      '## Language',
      '',
      '**Reply only in simple Indian English**, regardless of what the caller uses. This has been forced by the operator.',
      '',
      'Short sentences. No idioms that would not travel. Indian conventions for money — "seventy-two lakh", not "7.2 million".',
    ].join('\n'),
};

const REGISTER_RULES: readonly string[] = [
  '- **Hindi** — write in Devanagari, but keep English loanwords in Latin script ("2 BHK", "budget", "possession", "site visit", "RERA").',
  '- **Hinglish** — Hindi sentence structure in Latin script with English nouns. This is the default register for Indian real-estate calls.',
  '- **English** — simple Indian English, with Indian money conventions ("seventy-two lakh", never "7.2 million").',
];

function describeLanguage(language: Language): string {
  return language === 'hi' ? 'Hindi' : language === 'hi-en' ? 'Hinglish' : 'English';
}

const SLOT_DESCRIPTIONS: Record<SlotQuestionKey, string> = {
  intent: 'intent — are they buying, investing, renting, or just looking?',
  configuration: 'configuration — 1/2/3/4+ BHK, plot, office or retail',
  location: 'location — which locality or city they want',
  budget: 'budget — a range in rupees',
  purpose: 'purpose — self use or investment',
  timeline: 'timeline — how soon they want to close',
  financing: 'financing — home loan, self-funded, or undecided',
  name: 'name',
  phone: 'phone number',
  preferredCallbackTime: 'preferred callback time',
};

export function buildSystemPrompt(context: PromptContext): string {
  const { config, tracker, languageMode, language } = context;
  const project = primaryProject(config.projects);

  return SALES_AGENT_PROMPT_TEMPLATE.replaceAll('{{PERSONA}}', config.persona.trim())
    .replaceAll('{{LANGUAGE_INSTRUCTION}}', LANGUAGE_INSTRUCTIONS[languageMode](language))
    .replaceAll('{{PHRASE_EXAMPLES}}', renderPhraseExamples(languageMode, language))
    .replaceAll('{{SLOT_ORDER}}', renderSlotOrder(tracker.slotOrder))
    .replaceAll('{{SLOT_STATE}}', renderSlotState(tracker))
    .replaceAll('{{NEXT_SLOT}}', renderNextSlot(tracker))
    .replaceAll('{{KB_SUMMARY}}', renderKbSummary(config.projects, project))
    .replaceAll('{{EXTRA_GUARDRAILS}}', renderExtraGuardrails(config.extraGuardrails))
    .replaceAll('{{GREETING}}', config.greeting[languageMode === 'auto' ? language : languageMode]);
}

function renderPhraseExamples(mode: LanguageMode, detected: Language): string {
  const language: Language = mode === 'auto' ? detected : mode;
  const set = PHRASEBOOK[language];
  return [
    `- Greeting: "${set.greeting}"`,
    `- Asking budget: "${set.slotQuestions.budget}"`,
    `- Asking configuration: "${set.slotQuestions.configuration}"`,
    `- Handling a discount request: "${set.objections.discount}"`,
    `- When you do not know something: "${set.cannotAnswer}"`,
  ].join('\n');
}

function renderSlotOrder(order: readonly SlotQuestionKey[]): string {
  return order.map((key, index) => `${index + 1}. ${SLOT_DESCRIPTIONS[key]}`).join('\n');
}

function renderSlotState(tracker: QualificationTracker): string {
  const { slots } = tracker;
  const lines: string[] = [];

  const add = (label: string, value: unknown) => {
    if (value != null && String(value).length > 0) lines.push(`- **${label}**: ${String(value)}`);
  };

  add('intent', slots.intent);
  add('configuration', slots.configuration);
  add('property type', slots.propertyType);
  add('location', slots.location);
  if (slots.budgetMin != null || slots.budgetMax != null) {
    lines.push(`- **budget**: ${formatBudgetRange(slots.budgetMin, slots.budgetMax)}`);
  }
  add('purpose', slots.purpose);
  add('timeline', slots.timeline);
  add('financing', slots.financing);
  add('name', slots.name);
  add('phone', slots.phone);
  add('email', slots.email);
  add('preferred callback time', slots.preferredCallbackTime);

  if (slots.objections.length > 0) {
    lines.push(`- **objections raised**: ${slots.objections.join('; ')}`);
  }
  if (tracker.declined.length > 0) {
    lines.push(
      `- **declined (never ask again)**: ${tracker.declined.join(', ')}`,
    );
  }

  return lines.length > 0 ? lines.join('\n') : '_Nothing captured yet — this is the start of the call._';
}

function renderNextSlot(tracker: QualificationTracker): string {
  const next = tracker.nextSlot();
  if (!next) {
    return 'Everything required has been captured. Offer a site visit, confirm the details you will send, and close the call with `end_call`.';
  }
  return `Ask about **${SLOT_DESCRIPTIONS[next]}**. Acknowledge their previous answer first, then ask this one thing.`;
}

function renderKbSummary(projects: readonly Project[], primary: Project): string {
  const lines = [
    `**${primary.name}** by ${primary.developer} — ${primary.location.locality}, ${primary.location.city}.`,
    `${primary.positioning}`,
    '',
    `- Configurations: ${primary.configurations.map((config) => config.label).join(', ')}`,
    `- Possession: ${primary.possession.expectedDate} (expected)`,
    `- RERA: ${primary.reraId}`,
    `- ${primary.scale.towers} towers, ${primary.scale.totalUnits} units on ${primary.scale.landAreaAcres} acres`,
  ];

  const others = projects.filter((project) => project.slug !== primary.slug);
  if (others.length > 0) {
    lines.push('', 'Also available from the same developer, if the caller wants a different area or budget:');
    for (const other of others) {
      lines.push(
        `- **${other.name}** — ${other.location.locality}, ${other.location.city}. ${other.configurations
          .map((config) => config.label)
          .join(', ')}. Possession ${other.possession.expectedDate} (expected).`,
      );
    }
  }

  lines.push(
    '',
    '**This is fictional demonstration data.** If the caller asks whether they can book a unit right now, say honestly that this is a demo system.',
  );

  return lines.join('\n');
}

function renderExtraGuardrails(guardrails: readonly string[]): string {
  if (guardrails.length === 0) return '';
  return ['## Additional instructions from the operator', '', ...guardrails.map((line) => `- ${line}`)].join(
    '\n',
  );
}
