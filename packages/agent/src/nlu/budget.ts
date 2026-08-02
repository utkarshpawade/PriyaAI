import { CRORE, LAKH } from '@rvagent/shared';
import { normaliseDevanagariDigits, wordToNumber } from '../language/number-words.js';
import { wordPattern } from './pattern.js';

/**
 * Budget parsing for spoken Indian real-estate figures.
 *
 * Callers state budgets in half a dozen shapes and almost never in rupees:
 * "50 lakh se 60 ke beech", "1cr tak", "around 80 lakh", "eighty five lakh",
 * "पचास लाख". This parser normalises all of them to absolute rupees.
 *
 * It runs as a deterministic backstop on every user turn even when a live LLM
 * is driving the conversation, because a missed budget is the single most
 * expensive slot to get wrong.
 */

export interface ParsedBudget {
  budgetMin: number | null;
  budgetMax: number | null;
  /** How the phrase was interpreted — surfaced in the eval report. */
  kind: 'range' | 'ceiling' | 'floor' | 'approximate' | 'exact';
  matchedText: string;
}

const UNIT_MULTIPLIERS: ReadonlyArray<readonly [RegExp, number]> = [
  [/^(?:cr|crore|crores|karod|karoad|करोड़|करोड)$/i, CRORE],
  [/^(?:l|lac|lacs|lakh|lakhs|lakhon|लाख)$/i, LAKH],
  [/^(?:k|thousand|hazaar|hazar|हज़ार|हजार)$/i, 1_000],
];

const CEILING_MARKERS = wordPattern(
  'tak|takk|under|below|upto|up\\s*to|maximum|max|andar|ke\\s*andar|se\\s*kam|se\\s*niche|within|तक|के\\s*अंदर',
);
const FLOOR_MARKERS = wordPattern(
  'se\\s*upar|se\\s*zyada|se\\s*jyada|above|minimum|min|at\\s*least|se\\s*shuru|से\\s*ऊपर|से\\s*ज़्यादा',
);
const APPROX_MARKERS = wordPattern(
  'around|approx|approximately|about|roughly|lagbhag|karib|kareeb|aas\\s*paas|aaspaas|ke\\s*aas\\s*paas|लगभग|क़रीब|करीब',
);
const RANGE_SEPARATOR = /^[\s,–—-]*(?:se|to|and|aur|से|और|-|–|—)?[\s,–—-]*(?:ke\s*beech|के\s*बीच)?[\s,]*$/iu;

/**
 * Longest gap between two figures that can still be one range. "50 lakh se 60"
 * qualifies; "3 BHK dekh lijiye, aur budget 1.5 crore" does not, and treating
 * it as one produced a three-crore budget out of a 3 BHK.
 */
const MAX_RANGE_SEPARATOR_CHARS = 18;

/** Units that mark a figure as something other than money. */
const NON_CURRENCY_UNIT = wordPattern(
  'bhk|bedroom|beds?|bathrooms?|sq|sqft|feet|foot|floors?|percent|years?|months?|mahine|din|days?|बीएचके|मंज़िल|साल|महीने',
);

/** A number written in digits, Devanagari digits, or words, plus an optional unit. */
interface NumberToken {
  value: number;
  unit: number | null;
  start: number;
  end: number;
}

export function parseBudget(rawText: string): ParsedBudget | null {
  const text = substituteWordNumbers(normaliseDevanagariDigits(rawText));
  const tokens = extractNumberTokens(text);
  if (tokens.length === 0) return null;

  const hasCurrencyContext =
    text.includes('₹') ||
    CURRENCY_CONTEXT.test(text);
  // A bare "3" in "3 BHK chahiye" is not a budget. Require either a unit or an
  // explicit money word somewhere in the sentence.
  if (!hasCurrencyContext && !tokens.some((token) => token.unit !== null)) return null;

  const matchedText = text.slice(tokens[0].start, tokens[tokens.length - 1].end).trim();

  if (tokens.length >= 2) {
    const between = text.slice(tokens[0].end, tokens[1].start);
    if (between.length <= MAX_RANGE_SEPARATOR_CHARS && RANGE_SEPARATOR.test(between)) {
      const low = resolveAmount(tokens[0], tokens[1]);
      const high = resolveAmount(tokens[1], tokens[1]);
      if (low != null && high != null) {
        return {
          budgetMin: Math.min(low, high),
          budgetMax: Math.max(low, high),
          kind: 'range',
          matchedText,
        };
      }
    }
  }

  const amount = resolveAmount(tokens[0], tokens[0]);
  if (amount == null) return null;

  if (CEILING_MARKERS.test(text)) {
    return { budgetMin: null, budgetMax: amount, kind: 'ceiling', matchedText };
  }
  if (FLOOR_MARKERS.test(text)) {
    return { budgetMin: amount, budgetMax: null, kind: 'floor', matchedText };
  }
  if (APPROX_MARKERS.test(text)) {
    return {
      budgetMin: Math.round(amount * 0.9),
      budgetMax: Math.round(amount * 1.1),
      kind: 'approximate',
      matchedText,
    };
  }
  // A bare figure is a ceiling in practice: "budget 80 lakh" means "not more
  // than 80", not "exactly 80".
  return { budgetMin: null, budgetMax: amount, kind: 'ceiling', matchedText };
}

/**
 * Resolves a token to rupees, borrowing the unit from a later token when the
 * caller omitted it — "50 se 60 lakh" gives the first number no unit of its own.
 */
function resolveAmount(token: NumberToken, unitDonor: NumberToken): number | null {
  const unit = token.unit ?? unitDonor.unit ?? impliedUnit(token.value);
  if (unit == null) return null;
  const amount = Math.round(token.value * unit);
  return amount > 0 ? amount : null;
}

/**
 * Indian buyers drop the unit constantly ("budget 80", "budget 1.5"). Below 5
 * the figure is crores, above it lakhs — nobody quotes a 5-rupee flat, and
 * "1.5" for a Pune apartment is always 1.5 Cr.
 */
function impliedUnit(value: number): number | null {
  if (value >= 100_000) return 1;
  if (value >= 5) return LAKH;
  if (value >= 0.5) return CRORE;
  return null;
}

const CURRENCY_CONTEXT = wordPattern(
  'budget|rupees?|rs|inr|price|paise|lakh|lakhs|lac|lacs|crore|crores|cr|karod|लाख|करोड़|करोड|बजट|कीमत|रुपये',
);

// `\p{Script=Devanagari}` rather than a literal U+0900\u2013U+097F range: the range
// starts on a combining mark, which is both misleading to read and flagged by
// `no-misleading-character-class`. The property escape says what is meant.
const NUMBER_PATTERN = /(\d[\d,]*(?:\.\d+)?)\s*([a-z\p{Script=Devanagari}]+)?/giu;
const UNIT_WORD_PATTERN = /^(?:cr|crore|crores|karod|karoad|l|lac|lacs|lakh|lakhs|lakhon|k|thousand|hazaar|hazar|करोड़|करोड|लाख|हज़ार|हजार)$/i;

/**
 * Rewrites spoken numerals to digits, but only directly in front of a unit
 * word.
 *
 * The narrow rule is deliberate. "do" is both Hindi for two and an English
 * auxiliary verb, so an unconditional substitution turns "I do have a budget of
 * 80 lakh" into a two-crore budget. Requiring an adjacent "lakh"/"crore" makes
 * "do crore" and "eighty five lakh" work while leaving ordinary prose alone.
 */
function substituteWordNumbers(text: string): string {
  const words = text.split(/(\s+)/);
  const output = [...words];

  for (let i = 0; i < words.length; i += 1) {
    const word = stripPunctuation(words[i]);
    if (word.length === 0 || /\d/.test(word)) continue;

    const nextWordIndex = i + 2;
    const wordAfterNext = i + 4;

    const pairValue =
      nextWordIndex < words.length ? wordToNumber(`${word}${stripPunctuation(words[nextWordIndex])}`) : null;
    if (pairValue != null && isUnitWord(words[wordAfterNext])) {
      output[i] = String(pairValue);
      output[nextWordIndex] = '';
      continue;
    }

    const value = wordToNumber(word);
    if (value != null && value > 0 && isUnitWord(words[nextWordIndex])) {
      output[i] = String(value);
    }
  }

  return output.join('').replace(/\s{2,}/g, ' ');
}

function isUnitWord(word: string | undefined): boolean {
  return word != null && UNIT_WORD_PATTERN.test(stripPunctuation(word));
}

function stripPunctuation(word: string | undefined): string {
  // `\p{M}` is kept: Devanagari vowel signs and the nukta are combining marks,
  // and dropping them turns "करोड़" into "करड", which matches nothing.
  return (word ?? '').replace(/[^\p{L}\p{N}\p{M}]/gu, '');
}

function extractNumberTokens(text: string): NumberToken[] {
  const tokens: NumberToken[] = [];

  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const value = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    // "3 BHK" and "1200 sq ft" are quantities, not budgets.
    if (match[2] && NON_CURRENCY_UNIT.test(match[2])) continue;

    const index = match.index ?? 0;
    tokens.push({
      value,
      unit: match[2] ? matchUnit(match[2]) : null,
      start: index,
      end: index + match[0].length,
    });
  }

  return tokens;
}

function matchUnit(word: string): number | null {
  for (const [pattern, multiplier] of UNIT_MULTIPLIERS) {
    if (pattern.test(word)) return multiplier;
  }
  return null;
}
