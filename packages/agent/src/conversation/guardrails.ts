import { type Language } from '@rvagent/shared';
import { wordPattern } from '../nlu/pattern.js';

/**
 * Output filter for compliance-critical claims.
 *
 * The system prompt already forbids these, but a prompt is a request and this
 * is an enforcement point: nothing reaches TTS without passing through here.
 * Real-estate guarantees ("assured returns", "value will definitely double")
 * are the claims that get sales teams into regulatory trouble, so a rewrite
 * that keeps the sentence useful is preferred and an outright block is the
 * fallback when the sentence cannot be salvaged.
 */

export type GuardrailSeverity = 'rewrite' | 'block';

export interface GuardrailRule {
  id: string;
  pattern: RegExp;
  severity: GuardrailSeverity;
  /** Compliant text substituted for the matched span, per language. */
  replacement?: Record<Language, string>;
  reason: string;
}

const RETURNS_DISCLAIMER: Record<Language, string> = {
  hi: 'returns बाज़ार पर निर्भर करते हैं',
  'hi-en': 'returns market par depend karte hain',
  en: 'returns depend on market conditions',
};

const NO_ASSURANCE: Record<Language, string> = {
  hi: 'इसकी कोई गारंटी नहीं दी जा सकती',
  'hi-en': 'iski koi guarantee nahi di ja sakti',
  en: 'that cannot be guaranteed',
};

const SUBJECT_TO_APPROVAL: Record<Language, string> = {
  hi: 'यह approval प्रक्रिया पर निर्भर है',
  'hi-en': 'yeh approval process par depend karta hai',
  en: 'that is subject to the approval process',
};

/**
 * Every pattern is built with `wordPattern` so the Devanagari alternatives
 * actually fire — a `\b`-delimited rule silently never matches Hindi, which
 * would leave exactly the language the agent speaks most unguarded.
 */
export const GUARDRAIL_RULES: readonly GuardrailRule[] = [
  {
    id: 'assured_returns',
    pattern: wordPattern(
      '(?:assured|guaranteed|guranteed|fixed|nishchit|pakka|पक्का|पक्की|निश्चित)\\s+(?:returns?|roi|yield|appreciation|profit|munafa|मुनाफ़ा|मुनाफा|रिटर्न)',
      'g',
    ),
    severity: 'rewrite',
    replacement: RETURNS_DISCLAIMER,
    reason: 'Promises a specific investment return.',
  },
  {
    id: 'guarantee_verb',
    pattern: wordPattern('(?:i|we|main|hum|मैं|हम)?\\s*(?:can\\s+)?guarantee(?:d|s)?', 'g'),
    severity: 'rewrite',
    replacement: NO_ASSURANCE,
    reason: 'States an outright guarantee.',
  },
  {
    id: 'will_double',
    pattern: wordPattern(
      '(?:definitely|surely|certainly|100\\s*%|zaroor|pakka|ज़रूर|पक्का)?\\s*(?:double|triple|2x|paisa\\s*double|पैसा\\s*डबल)\\s*(?:ho\\s*jayega|hoga|your\\s*money|in\\s*\\d+\\s*years?)?',
      'g',
    ),
    severity: 'block',
    reason: 'Predicts a specific multiple on capital.',
  },
  {
    id: 'price_will_rise',
    pattern: wordPattern(
      '(?:price|value|rate|daam|कीमत|दाम)\\s*(?:will|is\\s+going\\s+to|zaroor|definitely|badhega|बढ़ेगा|ज़रूर)\\s*(?:definitely|surely|certainly|only)?\\s*(?:rise|increase|go\\s*up|appreciate|badh[\\p{L}\\p{M}]*|बढ़[\\p{L}\\p{M}]*)?',
      'g',
    ),
    severity: 'block',
    reason: 'Predicts future price movement.',
  },
  {
    id: 'safe_investment',
    pattern: wordPattern(
      '(?:100\\s*%|hundred\\s*percent|completely|totally|bilkul|बिल्कुल)\\s*(?:safe|secure|risk[\\s-]*free|surakshit|सुरक्षित)',
      'g',
    ),
    severity: 'rewrite',
    replacement: NO_ASSURANCE,
    reason: 'Claims an investment carries no risk.',
  },
  {
    id: 'no_risk',
    pattern: wordPattern(
      'no\\s*risk|zero\\s*risk|risk\\s*nah?in?|koi\\s*risk\\s*nah?in?|कोई\\s*रिस्क\\s*नहीं',
      'g',
    ),
    severity: 'rewrite',
    replacement: NO_ASSURANCE,
    reason: 'Claims an investment carries no risk.',
  },
  {
    id: 'sure_shot',
    pattern: wordPattern("sure\\s*shot|can'?t\\s*go\\s*wrong|best\\s*investment\\s*ever", 'g'),
    severity: 'block',
    reason: 'Pressure framing with an implied guarantee.',
  },
  {
    id: 'approval_certainty',
    pattern: wordPattern(
      '(?:loan|approval|oc|cc|possession)\\s+(?:will\\s+)?(?:definitely|surely|certainly|100\\s*%|pakka|ज़रूर)\\s*(?:be\\s+)?(?:approved|mil\\s*jayega|ho\\s*jayega|milega|मिलेगा)',
      'g',
    ),
    severity: 'rewrite',
    replacement: SUBJECT_TO_APPROVAL,
    reason: 'Promises an approval outcome the developer does not control.',
  },
  {
    id: 'fake_scarcity',
    pattern: wordPattern(
      'only\\s+\\d+\\s+(?:units?|flats?)\\s+(?:left|remaining)\\s*(?:today|right\\s*now)?|last\\s+chance|aaj\\s*hi\\s*book|आज\\s*ही\\s*book',
      'g',
    ),
    severity: 'block',
    reason: 'Manufactured urgency.',
  },
];

export interface GuardrailViolation {
  ruleId: string;
  matched: string;
  severity: GuardrailSeverity;
  reason: string;
}

export interface GuardrailResult {
  text: string;
  violations: GuardrailViolation[];
  /** True when a sentence had to be dropped rather than rewritten. */
  blocked: boolean;
}

const BLOCK_FALLBACK: Record<Language, string> = {
  hi: 'इस बारे में मैं कोई दावा नहीं कर सकती — यह पूरी तरह बाज़ार पर निर्भर है।',
  'hi-en': 'Is baare mein main koi claim nahi kar sakti — yeh poori tarah market par depend karta hai.',
  en: 'I cannot make any claim on that — it depends entirely on market conditions.',
};

/**
 * Applies every rule to one chunk of agent text.
 *
 * Rewrites are applied in place. A `block` match removes the offending sentence
 * and, if that empties the chunk, substitutes a compliant statement so the
 * caller is not met with silence.
 */
export function applyGuardrails(text: string, language: Language): GuardrailResult {
  const violations: GuardrailViolation[] = [];
  let output = text;
  let blocked = false;

  for (const rule of GUARDRAIL_RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    const matches = [...output.matchAll(pattern)].filter((match) => match[0].trim().length > 0);
    if (matches.length === 0) continue;

    for (const match of matches) {
      violations.push({
        ruleId: rule.id,
        matched: match[0].trim(),
        severity: rule.severity,
        reason: rule.reason,
      });
    }

    if (rule.severity === 'rewrite' && rule.replacement) {
      output = output.replace(new RegExp(rule.pattern.source, rule.pattern.flags), rule.replacement[language]);
    } else {
      blocked = true;
      output = removeSentencesMatching(output, rule.pattern);
    }
  }

  const cleaned = output.replace(/\s{2,}/g, ' ').trim();
  return {
    text: cleaned.length > 0 ? cleaned : blocked ? BLOCK_FALLBACK[language] : cleaned,
    violations,
    blocked,
  };
}

function removeSentencesMatching(text: string, pattern: RegExp): string {
  return splitSentences(text)
    .filter((sentence) => !new RegExp(pattern.source, pattern.flags).test(sentence))
    .join(' ');
}

const PRICE_FIGURE =
  /(?:₹|rs\.?|inr)\s*[\d,.]+|\b\d+(?:\.\d+)?\s*(?:lakh|lac|crore|cr)\b|\b(?:लाख|करोड़)\b/i;
const INDICATIVE_MARKER =
  /\b(?:indicative|approximate|approx|subject\s+to\s+availability|lagbhag|around|के\s*आसपास|indicative\s+price|availability\s+par)\b/i;

const INDICATIVE_SUFFIX: Record<Language, string> = {
  hi: ' यह indicative price है और availability पर निर्भर करता है।',
  'hi-en': ' Yeh indicative price hai aur availability par depend karta hai.',
  en: ' This is an indicative price and subject to availability.',
};

/**
 * Guarantees the compliance framing on any turn that quotes a figure, so a
 * model that forgets the qualifier cannot make a price sound final.
 */
export function ensurePriceDisclaimer(text: string, language: Language): string {
  if (!PRICE_FIGURE.test(text) || INDICATIVE_MARKER.test(text)) return text;
  return `${text.trimEnd()}${INDICATIVE_SUFFIX[language]}`;
}

const TIMELINE_FIGURE = /\b(?:possession|handover|ready\s*by|q[1-4]\s*20\d\d|20(?:2[5-9]|3\d))\b/i;
const EXPECTED_MARKER =
  /\b(?:expected|as\s*per|plan|likely|anticipated|उम्मीद|expected\s*hai|के\s*हिसाब\s*से)\b/i;

const EXPECTED_SUFFIX: Record<Language, string> = {
  hi: ' यह expected timeline है, current construction plan के हिसाब से।',
  'hi-en': ' Yeh expected timeline hai, current construction plan ke hisaab se.',
  en: ' That is the expected timeline as per the current construction plan.',
};

export function ensureTimelineDisclaimer(text: string, language: Language): string {
  if (!TIMELINE_FIGURE.test(text) || EXPECTED_MARKER.test(text)) return text;
  return `${text.trimEnd()}${EXPECTED_SUFFIX[language]}`;
}

/** The full outbound filter: guardrails first, then the mandatory framing. */
export function filterAgentOutput(text: string, language: Language): GuardrailResult {
  const guarded = applyGuardrails(text, language);
  const withPrice = ensurePriceDisclaimer(guarded.text, language);
  const withTimeline = ensureTimelineDisclaimer(withPrice, language);
  return { ...guarded, text: withTimeline };
}

/** Splits on sentence boundaries in both Latin and Devanagari punctuation. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}
