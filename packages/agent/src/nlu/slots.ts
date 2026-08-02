import type {
  Configuration,
  Financing,
  Intent,
  PropertyType,
  Purpose,
  Timeline,
} from '@rvagent/shared';
import { wordPattern } from './pattern.js';

/**
 * Rule-based slot extraction across Hindi, Hinglish and English.
 *
 * These run on every user turn regardless of which LLM is driving, as a
 * deterministic safety net: if the model forgets to call `update_requirements`,
 * the slot still gets filled and the requirements panel still updates. The LLM
 * remains authoritative when it *does* emit a value.
 *
 * Every pattern goes through `wordPattern` rather than a `\b` literal so the
 * Devanagari alternatives actually match.
 */

type Rule<T> = readonly [RegExp, T];

function firstMatch<T>(text: string, rules: ReadonlyArray<Rule<T>>): T | null {
  for (const [pattern, value] of rules) {
    if (pattern.test(text)) return value;
  }
  return null;
}

/** "BHK" as spoken and as written in Devanagari. */
const BHK = 'bhk|bedroom|bed|बीएचके|बी\\s*एच\\s*के';

const CONFIGURATION_RULES: ReadonlyArray<Rule<Configuration>> = [
  [wordPattern(`(?:4|4\\+|5|6|four|five|chaar|char|paanch|panch|चार|पाँच|पांच)\\s*(?:${BHK})`), '4BHK+'],
  [wordPattern('penthouse|duplex|पेंटहाउस'), '4BHK+'],
  [wordPattern(`(?:2\\.5|3|three|teen|तीन)\\s*(?:${BHK})`), '3BHK'],
  [wordPattern(`(?:2|two|do|दो)\\s*(?:${BHK})`), '2BHK'],
  [wordPattern(`(?:1|one|ek|एक)\\s*(?:${BHK})`), '1BHK'],
  [wordPattern('studio|स्टूडियो'), '1BHK'],
  [wordPattern('plot|zameen|jameen|land|ज़मीन|जमीन|प्लॉट'), 'plot'],
  [wordPattern('shop|retail|dukaan|showroom|दुकान'), 'retail'],
  [wordPattern('office|office\\s*space|commercial\\s*space|ऑफिस'), 'office'],
];

const PROPERTY_TYPE_RULES: ReadonlyArray<Rule<PropertyType>> = [
  [wordPattern('villa|bungalow|row\\s*house|banglow|विला|बंगला'), 'villa'],
  [wordPattern('plot|zameen|jameen|land|ज़मीन|जमीन|प्लॉट'), 'plot'],
  [wordPattern('shop|retail|office|commercial|dukaan|showroom|दुकान|कमर्शियल'), 'commercial'],
  [wordPattern(`flat|apartment|tower|फ्लैट|अपार्टमेंट|${BHK}`), 'apartment'],
];

const INTENT_RULES: ReadonlyArray<Rule<Intent>> = [
  [
    wordPattern(
      "just\\s*(?:looking|browsing|checking)|sirf\\s*dekh|abhi\\s*dekh|explore\\s*kar|window\\s*shopping|सिर्फ़\\s*देख|सिर्फ\\s*देख|अभी\\s*देख",
    ),
    'just_looking',
  ],
  [
    wordPattern(
      'invest|investment|investing|nivesh|rental\\s*income|rent\\s*out|kiraye\\s*(?:pe|par)\\s*dene|निवेश',
    ),
    'invest',
  ],
  [wordPattern('rent|rental|kiraya|kiraye\\s*(?:pe|par)\\s*lena|किराया|किराए'), 'rent'],
  [
    wordPattern(
      'buy|buying|purchase|kharid[\\p{L}\\p{M}]*|khareed[\\p{L}\\p{M}]*|lena\\s*hai|leni\\s*hai|book\\s*karna|ख़रीद[\\p{L}\\p{M}]*|खरीद[\\p{L}\\p{M}]*|लेना\\s*है',
    ),
    'buy',
  ],
];

const PURPOSE_RULES: ReadonlyArray<Rule<Purpose>> = [
  [
    wordPattern(
      'invest|investment|nivesh|rental\\s*income|rent\\s*out|second\\s*home|kiraye\\s*(?:pe|par)\\s*dene|निवेश',
    ),
    'investment',
  ],
  [
    wordPattern(
      'self\\s*use|end\\s*use|own\\s*use|khud|apne\\s*liye|rehne\\s*ke\\s*liye|family\\s*ke\\s*liye|shift\\s*hona|ख़ुद|खुद|रहने\\s*के\\s*लिए|अपने\\s*लिए',
    ),
    'self_use',
  ],
];

const TIMELINE_RULES: ReadonlyArray<Rule<Timeline>> = [
  [
    wordPattern(
      'immediately|immediate|turant|asap|is\\s*mahine|this\\s*month|ready\\s*to\\s*move|jald\\s*se\\s*jald|तुरंत|जल्द\\s*से\\s*जल्द',
    ),
    'immediate',
  ],
  [wordPattern('(?:2\\s*-?\\s*3|three|3|teen|do\\s*teen|तीन)\\s*(?:months?|mahine|महीने|महीनो[\\p{L}\\p{M}]*)'), '3_months'],
  [wordPattern('(?:6|six|chhah|chhe|छह|छे)\\s*(?:months?|mahine|महीने|महीनो[\\p{L}\\p{M}]*)'), '6_months'],
  [
    wordPattern(
      '12\\s*months?|1\\s*(?:year|saal|साल)|ek\\s*saal|one\\s*year|next\\s*year|agle\\s*saal|अगले\\s*साल|एक\\s*साल',
    ),
    '12_months',
  ],
  [
    wordPattern(
      'exploring|no\\s*hurry|koi\\s*jaldi\\s*nah?in?|abhi\\s*decide\\s*nah?in?|dekh\\s*rahe|just\\s*looking|कोई\\s*जल्दी\\s*नहीं|अभी\\s*तय\\s*नहीं',
    ),
    'exploring',
  ],
];

const FINANCING_RULES: ReadonlyArray<Rule<Financing>> = [
  [
    wordPattern('home\\s*loan|loan|emi|finance|financing|bank\\s*se|mortgage|लोन|क़र्ज़|ईएमआई'),
    'loan',
  ],
  [
    wordPattern(
      'cash|self\\s*fund[\\p{L}\\p{M}]*|self-?funded|own\\s*fund[\\p{L}\\p{M}]*|full\\s*payment|apne\\s*paise|khud\\s*ka\\s*paisa|नक़द|नकद|अपने\\s*पैसे',
    ),
    'self_funded',
  ],
  [
    wordPattern(
      'not\\s*(?:sure|decided)|pata\\s*nah?in?|decide\\s*nah?in?|dekhenge|undecided|पता\\s*नहीं|तय\\s*नहीं',
    ),
    'undecided',
  ],
];

export function parseConfiguration(text: string): Configuration | null {
  return firstMatch(text, CONFIGURATION_RULES);
}

export function parsePropertyType(text: string): PropertyType | null {
  return firstMatch(text, PROPERTY_TYPE_RULES);
}

export function parseIntent(text: string): Intent | null {
  return firstMatch(text, INTENT_RULES);
}

export function parsePurpose(text: string): Purpose | null {
  return firstMatch(text, PURPOSE_RULES);
}

export function parseTimeline(text: string): Timeline | null {
  return firstMatch(text, TIMELINE_RULES);
}

export function parseFinancing(text: string): Financing | null {
  return firstMatch(text, FINANCING_RULES);
}

/** English word order: "in Wakad", "near Hinjewadi". */
const LOCATIVE_PREPOSITION = wordPattern(
  '(?:in|at|near|around)\\s+([\\p{L}][\\p{L}\\p{M}\\s]{2,30}?)(?=\\s*(?:,|\\.|$|area|ilaka|chahiye|dekh|hai|है))',
);

/**
 * Hindi word order puts the postposition last: "Wakad mein", "Kharadi ke paas".
 * Only the single word immediately before the postposition is taken, so
 * "teen mahine mein" yields "mahine" and gets rejected as a stop phrase rather
 * than silently becoming a locality.
 */
const LOCATIVE_POSTPOSITION = wordPattern(
  '([\\p{L}][\\p{L}\\p{M}]{2,29})\\s+(?:mein|mai|में|ke\\s*paas|के\\s*पास)',
);

/**
 * Resolves a locality by matching against names the knowledge base already
 * knows. Falls back to word order so an unknown area ("Baner", "Ravet") is
 * still captured rather than dropped.
 */
export function parseLocation(text: string, knownLocalities: readonly string[]): string | null {
  const lower = text.toLowerCase();

  const known = knownLocalities.find((locality) => lower.includes(locality.toLowerCase()));
  if (known) return titleCase(known);

  for (const pattern of [LOCATIVE_POSTPOSITION, LOCATIVE_PREPOSITION]) {
    const candidate = pattern.exec(text)?.[1]?.trim();
    if (candidate && candidate.length >= 3 && !isStopPhrase(candidate)) return titleCase(candidate);
  }
  return null;
}

const NAME_PATTERNS: readonly RegExp[] = [
  wordPattern(
    '(?:mera\\s*naam|my\\s*name\\s*is|naam|nam|मेरा\\s*नाम|नाम)\\s+([\\p{L}][\\p{L}\\s.]{1,40}?)(?=\\s*(?:hai|है|,|\\.|$))',
  ),
  wordPattern(
    "(?:i\\s*am|this\\s*is|main|मैं)\\s+([\\p{L}][\\p{L}\\s.]{1,40}?)(?=\\s*(?:bol|speaking|here|हूँ|हूं|,|\\.|$))",
  ),
];

/** Extracts a caller name. Returns null rather than guessing from a bare token. */
export function parseName(text: string): string | null {
  for (const pattern of NAME_PATTERNS) {
    const match = pattern.exec(text);
    const candidate = match?.[1]?.trim();
    if (candidate && candidate.length >= 2 && !isStopPhrase(candidate)) return titleCase(candidate);
  }
  return null;
}

const STOP_PHRASES = new Set([
  'looking', 'interested', 'calling', 'sorry', 'busy', 'not', 'here', 'there', 'yes', 'no',
  'pune', 'sure', 'ok', 'okay', 'good', 'fine', 'thik', 'theek', 'acha', 'accha', 'haan', 'nahi',
  'budget', 'flat', 'ghar', 'area', 'abhi', 'kya', 'aap', 'naam', 'name', 'नाम', 'मैं',
  // Time expressions share the "<word> mein" shape with localities.
  'mahine', 'mahina', 'mahino', 'saal', 'din', 'month', 'months', 'year', 'years', 'week',
  'hafte', 'time', 'baad', 'beech', 'meeting', 'महीने', 'साल', 'दिन', 'हफ़्ते',
]);

function isStopPhrase(value: string): boolean {
  const words = value.toLowerCase().split(/\s+/);
  return words.every((word) => STOP_PHRASES.has(word));
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => (/^[a-z]/.test(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
    .trim();
}
