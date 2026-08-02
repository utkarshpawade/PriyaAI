import { normaliseDevanagariDigits, wordToNumber } from '../language/number-words.js';

/**
 * Indian mobile number extraction.
 *
 * Handles the three ways a number arrives on a voice call: as digits from STT
 * ("9876543210", "98765 43210", "+91 98765-43210"), as Devanagari digits, and
 * spoken digit by digit in Hindi or English ("nau aath saat chhah ...").
 */

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export interface ParsedPhone {
  phone: string;
  valid: boolean;
  source: 'digits' | 'spoken';
}

export function parsePhone(rawText: string): ParsedPhone | null {
  const text = normaliseDevanagariDigits(rawText);

  const fromDigits = extractFromDigits(text);
  if (fromDigits) return fromDigits;

  return extractFromSpokenDigits(text);
}

function extractFromDigits(text: string): ParsedPhone | null {
  // Grab runs of digits with the separators people dictate, then strip them.
  const candidates = text.match(/(?:\+?91[\s-]*)?(?:\d[\s-]*){10,13}/g) ?? [];

  for (const candidate of candidates) {
    const normalised = normaliseIndianMobile(candidate.replace(/\D/g, ''));
    if (normalised) return { phone: normalised, valid: true, source: 'digits' };
  }
  return null;
}

/**
 * Rebuilds a number from spoken digits. Only accepts a run of ten or more
 * consecutive numerals so that "do BHK, budget saath lakh" cannot be mistaken
 * for a phone number.
 */
function extractFromSpokenDigits(text: string): ParsedPhone | null {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

  let run: number[] = [];
  const runs: number[][] = [];

  for (const word of words) {
    const value = /^\d$/.test(word) ? Number(word) : spokenDigit(word);
    if (value == null) {
      if (run.length > 0) runs.push(run);
      run = [];
      continue;
    }
    run.push(value);
  }
  if (run.length > 0) runs.push(run);

  for (const digits of runs) {
    if (digits.length < 10) continue;
    const normalised = normaliseIndianMobile(digits.join(''));
    if (normalised) return { phone: normalised, valid: true, source: 'spoken' };
  }
  return null;
}

/** Only single digits count; "bees" (20) in a phone number is a mis-hear. */
function spokenDigit(word: string): number | null {
  const value = wordToNumber(word);
  if (value == null || value < 0 || value > 9) return null;
  // "double" and "triple" are common in dictation but ambiguous without the
  // following digit, so they are handled as separators rather than guessed at.
  return value;
}

/** Strips +91 / leading 0 and validates against the Indian mobile series. */
export function normaliseIndianMobile(digits: string): string | null {
  let value = digits;
  if (value.length === 12 && value.startsWith('91')) value = value.slice(2);
  if (value.length === 13 && value.startsWith('091')) value = value.slice(3);
  if (value.length === 11 && value.startsWith('0')) value = value.slice(1);
  return INDIAN_MOBILE.test(value) ? value : null;
}

export function isValidIndianMobile(phone: string): boolean {
  return normaliseIndianMobile(phone.replace(/\D/g, '')) !== null;
}

/** Formats for display: `98765 43210`. */
export function formatIndianMobile(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}
