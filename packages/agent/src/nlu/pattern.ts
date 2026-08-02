/**
 * Unicode-aware word boundaries.
 *
 * JavaScript's `\b` is defined against the ASCII word class, so `/\bखरीद\b/`
 * never matches: every Devanagari character counts as a non-word character and
 * the boundary lands in the wrong place. That silently broke every Hindi rule
 * in the NLU layer until the eval caught it.
 *
 * Lookarounds over `\p{L}\p{N}` give a boundary that behaves the same way in
 * Latin and Devanagari, which is the whole point in a code-switching product.
 */
export function wordPattern(body: string, extraFlags = ''): RegExp {
  // `\p{M}` matters as much as `\p{L}`: Devanagari vowel signs and the nukta are
  // combining marks, so a boundary that ignores them lands *inside* a word and
  // "करोड़" matches a pattern written for "करोड".
  return new RegExp(`(?<![\\p{L}\\p{N}\\p{M}])(?:${body})(?![\\p{L}\\p{N}\\p{M}])`, `iu${extraFlags}`);
}

/**
 * Matches a stem plus any inflectional tail — "खरीद" also matching "खरीदना".
 * `\w` cannot be used here: it is ASCII-only and matches no Devanagari at all.
 */
export const LETTER_TAIL = '[\\p{L}\\p{M}]*';

/** Anchored variant for whole-utterance matches like a bare "haan". */
export function wholeUtterancePattern(body: string): RegExp {
  return new RegExp(`^\\s*(?:${body})\\s*[.!?]?\\s*$`, 'iu');
}
