import { CRORE, LAKH, type Language } from '@rvagent/shared';
import { amountToWords, digitsToWords, numberToWords } from './number-words.js';

/**
 * Rewrites agent text into something a TTS voice reads correctly.
 *
 * Three problems this solves, all of which are audible in a demo:
 *  1. "₹85,00,000" is read as a digit soup by every engine we tested against.
 *  2. "2BHK" becomes "two bee aitch kay" or "twobhk" depending on the voice.
 *  3. Hindi voices mangle romanised Hindi ("mujhe" as "moo-juh"), while the
 *     same voices read English loanwords in Latin script perfectly. So Hindi
 *     output goes out in Devanagari with the loanwords deliberately left alone.
 */

/**
 * Terms that stay in Latin script even in a Devanagari sentence. These are the
 * words Indian buyers actually use in English regardless of what language the
 * rest of the sentence is in.
 */
const PROTECTED_LATIN_TERMS = [
  'BHK',
  'RERA',
  'MahaRERA',
  'EMI',
  'NOC',
  'EV',
  'IT park',
  'IT',
  'OC',
  'CC',
  'GST',
  'budget',
  'possession',
  'site visit',
  'carpet area',
  'booking',
  'loan',
  'clubhouse',
  'amenities',
  'metro',
  'parking',
  'maintenance',
  'penthouse',
  'payment plan',
] as const;

/**
 * Romanised Hindi the LLM sometimes emits when it was asked for Devanagari.
 * A short, high-frequency safety net — not a transliteration engine.
 */
const ROMAN_TO_DEVANAGARI: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bnamaste\b/gi, 'नमस्ते'],
  [/\bnamaskar\b/gi, 'नमस्कार'],
  [/\bdhanyavaad\b/gi, 'धन्यवाद'],
  [/\bshukriya\b/gi, 'शुक्रिया'],
  [/\bji haan\b/gi, 'जी हाँ'],
  [/\bji nahin?\b/gi, 'जी नहीं'],
  [/\bhaan ji\b/gi, 'हाँ जी'],
  [/\bbilkul\b/gi, 'बिल्कुल'],
  [/\bzaroor\b/gi, 'ज़रूर'],
  [/\btheek hai\b/gi, 'ठीक है'],
  [/\bachchha\b/gi, 'अच्छा'],
  [/\bmaaf ki?jiye\b/gi, 'माफ़ कीजिए'],
];

/** Currency written in figures, in every shape a model or a KB string produces. */
const CURRENCY_PATTERNS: ReadonlyArray<{ pattern: RegExp; toRupees: (match: RegExpExecArray) => number }> = [
  // ₹1.45 crore / Rs 1.2 Cr / 1.45 crore
  {
    pattern: /(?:₹|Rs\.?|INR)?\s*(\d+(?:\.\d+)?)\s*(?:cr\b|crore?s?\b)/gi,
    toRupees: (match) => Number(match[1]) * CRORE,
  },
  // ₹85 lakh / 85L / 85 lac
  {
    pattern: /(?:₹|Rs\.?|INR)?\s*(\d+(?:\.\d+)?)\s*(?:l\b|lakhs?\b|lacs?\b)/gi,
    toRupees: (match) => Number(match[1]) * LAKH,
  },
  // ₹85,00,000 and ₹8500000
  {
    pattern: /(?:₹|Rs\.?|INR)\s*([\d,]+)(?!\s*(?:sq|per))/gi,
    toRupees: (match) => Number(match[1].replace(/,/g, '')),
  },
];

const CONFIGURATION_PATTERN = /\b(\d)\s*(?:\.\d+\s*)?BHK\s*(\+)?/gi;

export interface NormalizeOptions {
  /** Set false to keep figures as digits, e.g. when rendering to a screen. */
  expandNumbers?: boolean;
}

export function normalizeForTTS(
  text: string,
  language: Language,
  options: NormalizeOptions = {},
): string {
  const expandNumbers = options.expandNumbers ?? true;
  let output = stripMarkup(text);

  if (expandNumbers) {
    output = expandCurrency(output, language);
    output = expandAreas(output, language);
    output = expandPercentages(output, language);
  }

  output = expandConfigurations(output, language);
  output = expandAbbreviations(output, language);

  if (language === 'hi') {
    output = romanToDevanagari(output);
  }

  return collapseWhitespace(output);
}

/** Removes anything a voice would read aloud as punctuation noise. */
function stripMarkup(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_#`>]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.{2,}/g, '.');
}

function expandCurrency(text: string, language: Language): string {
  let output = text;
  for (const { pattern, toRupees } of CURRENCY_PATTERNS) {
    output = replaceAll(output, pattern, (match) => {
      const rupees = toRupees(match);
      return Number.isFinite(rupees) && rupees > 0 ? amountToWords(rupees, language) : match[0];
    });
  }
  return output;
}

function expandAreas(text: string, language: Language): string {
  const unit = language === 'hi' ? 'स्क्वायर फीट' : 'square feet';
  return text
    .replace(/(\d[\d,]*)\s*(?:sq\.?\s*ft\.?|sqft|square\s*feet)/gi, (_match, digits: string) => {
      const value = Number(digits.replace(/,/g, ''));
      return `${formatSpokenInteger(value, language)} ${unit}`;
    })
    .replace(/\bper\s+sq\.?\s*ft\.?/gi, language === 'hi' ? 'प्रति स्क्वायर फीट' : 'per square foot');
}

function expandPercentages(text: string, language: Language): string {
  const word = language === 'hi' ? 'प्रतिशत' : 'percent';
  return text.replace(/(\d+(?:\.\d+)?)\s*%/g, (_match, digits: string) => {
    const value = Number(digits);
    return `${Number.isInteger(value) ? numberToWords(value, language) : digits} ${word}`;
  });
}

/**
 * "2BHK" -> "two B-H-K". The hyphens make every engine we checked spell the
 * letters rather than attempt a word.
 */
function expandConfigurations(text: string, language: Language): string {
  // Hinglish and English speakers both say "two BHK"; only pure Hindi output
  // takes the Devanagari numeral.
  const numeralLanguage: Language = language === 'hi' ? 'hi' : 'en';
  return text.replace(CONFIGURATION_PATTERN, (_match, digit: string, plus?: string) => {
    const spokenDigit = numberToWords(Number(digit), numeralLanguage);
    const suffix = plus ? (language === 'hi' ? ' या उससे बड़ा' : ' plus') : '';
    return `${spokenDigit} B-H-K${suffix} `;
  });
}

function expandAbbreviations(text: string, language: Language): string {
  const isHindi = language === 'hi';
  return text
    .replace(/\bEMI\b/g, 'E-M-I')
    .replace(/\bNOC\b/g, 'N-O-C')
    .replace(/\bRERA\b/g, 'RERA')
    .replace(/\bGST\b/g, 'G-S-T')
    .replace(/\bEV\b/g, 'E-V')
    .replace(/\bQ([1-4])\s*(\d{4})\b/g, (_m, quarter: string, year: string) =>
      isHindi ? `${numberToWords(Number(quarter), 'hi')} तिमाही ${year}` : `quarter ${quarter} of ${year}`,
    )
    .replace(/&/g, isHindi ? 'और' : 'and')
    .replace(/\s+\/\s+/g, isHindi ? ' या ' : ' or ');
}

function romanToDevanagari(text: string): string {
  let output = text;
  for (const [pattern, replacement] of ROMAN_TO_DEVANAGARI) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

/** Integers above 100 stay as digits — "1252 square feet" reads fine everywhere. */
function formatSpokenInteger(value: number, language: Language): string {
  return value <= 100 ? numberToWords(value, language) : String(value);
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

/** `String.replace` with a callback that receives the full match object. */
function replaceAll(
  text: string,
  pattern: RegExp,
  replacer: (match: RegExpExecArray) => string,
): string {
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = global.exec(text)) !== null) {
    result += text.slice(lastIndex, match.index) + replacer(match);
    lastIndex = match.index + match[0].length;
    if (match[0].length === 0) global.lastIndex += 1;
  }
  return result + text.slice(lastIndex);
}

/** Exposed for the demo UI, which shows the caller's number back to them. */
export function speakPhoneNumber(phone: string, language: Language): string {
  return digitsToWords(phone, language);
}

export { PROTECTED_LATIN_TERMS };
