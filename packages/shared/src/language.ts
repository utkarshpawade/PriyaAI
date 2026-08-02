import { z } from 'zod';

/**
 * `hi`    — Hindi, predominantly Devanagari or heavily romanised Hindi.
 * `hi-en` — Hinglish: Hindi grammar with English words mixed in. The default
 *           register for Indian real-estate sales calls.
 * `en`    — English (Indian English included).
 */
export const languageSchema = z.enum(['hi', 'hi-en', 'en']);
export type Language = z.infer<typeof languageSchema>;

/** What the demo UI can force. `auto` means "mirror whatever the user speaks". */
export const languageModeSchema = z.enum(['hi', 'hi-en', 'en', 'auto']);
export type LanguageMode = z.infer<typeof languageModeSchema>;

export const LANGUAGE_LABELS: Record<Language, string> = {
  hi: 'Hindi',
  'hi-en': 'Hinglish',
  en: 'English',
};

/** BCP-47 hints handed to STT/TTS providers. */
export const LANGUAGE_BCP47: Record<Language, string> = {
  hi: 'hi-IN',
  'hi-en': 'hi-IN',
  en: 'en-IN',
};

const DEVANAGARI = /[ऀ-ॿ]/;
const DEVANAGARI_GLOBAL = /[ऀ-ॿ]/g;
const LATIN_LETTER_GLOBAL = /[A-Za-z]/g;

/**
 * Romanised Hindi function words. Deliberately limited to grammatical markers
 * (pronouns, verbs, postpositions) rather than nouns, because nouns like
 * "budget" or "location" are shared between Hinglish and Indian English and
 * would produce false positives.
 *
 * Homographs with common English words are excluded even when they are valid
 * Hindi — "the" (ve the / they were), "to" (toh), "me" (mein), "par" (on),
 * "ho", "sir". Keeping them made every English sentence containing "the" look
 * code-mixed, which is a far more expensive error than missing one Hindi cue.
 */
const ROMANISED_HINDI_MARKERS = new Set([
  'hai',
  'hain',
  'haan',
  'nahi',
  'nahin',
  'nai',
  'kya',
  'kyu',
  'kyun',
  'kaise',
  'kaisa',
  'kaisi',
  'kitna',
  'kitni',
  'kitne',
  'kahan',
  'kab',
  'kaun',
  'mujhe',
  'muje',
  'mera',
  'meri',
  'mere',
  'aap',
  'aapka',
  'aapke',
  'aapki',
  'tum',
  'hum',
  'humein',
  'hamara',
  'chahiye',
  'chahie',
  'karna',
  'karo',
  'karenge',
  'batao',
  'bataiye',
  'bata',
  'dekhna',
  'dekh',
  'lena',
  'dena',
  'raha',
  'rahi',
  'rahe',
  'tha',
  'thi',
  'hoga',
  'hogi',
  'jayega',
  'jaunga',
  'thik',
  'theek',
  'acha',
  'accha',
  'bhai',
  'ji',
  'abhi',
  'phir',
  'lekin',
  'aur',
  'ya',
  'bhi',
  'toh',
  'se',
  'mein',
  'ke',
  'ka',
  'ki',
  'ko',
  'wala',
  'wali',
  'jyada',
  'zyada',
  'kam',
  'thoda',
  'bahut',
  'sirf',
  'matlab',
  'samajh',
  'pata',
  'baat',
  'sakta',
  'sakte',
  'sakti',
  'chalega',
  'lagta',
  'lagti',
  'milega',
  'milegi',
  'dikha',
  'dikhao',
]);

/**
 * English function words. Used the same way as the Hindi markers: their presence
 * signals English *grammar*, not just English vocabulary.
 */
const ENGLISH_MARKERS = new Set([
  'the',
  'is',
  'are',
  'am',
  'was',
  'were',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'i',
  'you',
  'we',
  'they',
  'my',
  'your',
  'our',
  'their',
  'what',
  'when',
  'where',
  'which',
  'who',
  'how',
  'want',
  'need',
  'looking',
  'would',
  'could',
  'should',
  'can',
  'will',
  'about',
  'for',
  'with',
  'from',
  'that',
  'this',
  'there',
  'and',
  'but',
  'not',
  'please',
  'thanks',
  'thank',
  'tell',
  'give',
  'show',
  'know',
  'think',
  'like',
]);

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

export interface LanguageDetection {
  language: Language;
  /** 0..1 — how sure we are. Low confidence lets callers fall back to a hint. */
  confidence: number;
}

/**
 * Lightweight per-turn language classifier.
 *
 * Deliberately rule-based rather than model-based: it runs on every partial
 * transcript inside the turn loop, so it has to cost microseconds, and the three
 * classes we care about are separable by script and function words alone.
 */
export function detectLanguage(text: string, hint?: Language): LanguageDetection {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { language: hint ?? 'hi-en', confidence: 0 };
  }

  const devanagariCount = countMatches(trimmed, DEVANAGARI_GLOBAL);
  const latinCount = countMatches(trimmed, LATIN_LETTER_GLOBAL);
  const tokens = tokenise(trimmed);

  const latinWords = tokens.filter((t) => /^[a-z]+$/.test(t));
  const hindiMarkers = latinWords.filter((t) => ROMANISED_HINDI_MARKERS.has(t)).length;
  const englishMarkers = latinWords.filter((t) => ENGLISH_MARKERS.has(t)).length;

  // Script-mixed input is Hinglish by definition, but a single Latin loanword
  // ("2 BHK", "possession") inside a Devanagari sentence is still Hindi.
  if (devanagariCount > 0) {
    if (latinWords.length >= 2) {
      return { language: 'hi-en', confidence: 0.8 };
    }
    const devanagariShare = devanagariCount / Math.max(1, devanagariCount + latinCount);
    return { language: 'hi', confidence: Math.min(0.95, 0.5 + devanagariShare / 2) };
  }

  if (latinWords.length === 0) {
    return { language: hint ?? 'hi-en', confidence: 0.2 };
  }

  const hindiShare = hindiMarkers / latinWords.length;
  const englishShare = englishMarkers / latinWords.length;

  if (hindiMarkers === 0 && englishMarkers === 0) {
    // One-word answers like "3BHK" or "Wakad" carry no grammar at all. Keep the
    // previous turn's language instead of guessing from a single token.
    return { language: hint ?? 'hi-en', confidence: 0.25 };
  }

  if (hindiMarkers > 0 && englishMarkers > 0) {
    return { language: 'hi-en', confidence: 0.85 };
  }

  if (hindiMarkers > 0) {
    // Romanised Hindi with English nouns is Hinglish; romanised Hindi with no
    // English nouns at all is effectively spoken Hindi.
    const nonMarkerWords = latinWords.length - hindiMarkers;
    const language: Language = nonMarkerWords >= 2 ? 'hi-en' : 'hi';
    return { language, confidence: Math.min(0.9, 0.55 + hindiShare) };
  }

  return { language: 'en', confidence: Math.min(0.95, 0.55 + englishShare) };
}

/** True when the string contains any Devanagari character. */
export function hasDevanagari(text: string): boolean {
  return DEVANAGARI.test(text);
}

/**
 * Resolves the language the agent should *reply* in.
 * `auto` mirrors the user; an explicit mode always wins so the interviewer can
 * force a register mid-call from the demo UI.
 */
export function resolveReplyLanguage(mode: LanguageMode, detected: Language): Language {
  return mode === 'auto' ? detected : mode;
}
