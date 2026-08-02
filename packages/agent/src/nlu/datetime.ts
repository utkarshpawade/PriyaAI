import { normaliseDevanagariDigits } from '../language/number-words.js';

/**
 * Relative date and time parsing for site-visit booking.
 *
 * Callers say "kal shaam", "this Sunday", "agle weekend", "parso subah 11 baje".
 * The parser resolves these against a supplied `now` so tests are deterministic
 * and the interviewer can see exactly what "kal" resolved to.
 */

export interface ParsedVisitTime {
  scheduledFor: Date;
  /** What the caller actually said, stored for auditing the parser. */
  dateHint: string;
  /** Set when only a date was given and the time is our default. */
  timeAssumed: boolean;
  confidence: 'high' | 'medium' | 'low';
}

const WEEKDAYS: ReadonlyArray<readonly [RegExp, number]> = [
  [/\b(?:sunday|ravivaar|ravivar|itwar|इतवार|रविवार)\b/i, 0],
  [/\b(?:monday|somvaar|somvar|सोमवार)\b/i, 1],
  [/\b(?:tuesday|mangalvaar|mangalvar|मंगलवार)\b/i, 2],
  [/\b(?:wednesday|budhvaar|budhvar|बुधवार)\b/i, 3],
  [/\b(?:thursday|guruvaar|guruvar|गुरुवार)\b/i, 4],
  [/\b(?:friday|shukravaar|shukravar|शुक्रवार)\b/i, 5],
  [/\b(?:saturday|shanivaar|shanivar|शनिवार)\b/i, 6],
];

const TIME_OF_DAY: ReadonlyArray<readonly [RegExp, number]> = [
  [/\b(?:subah|savere|morning|सुबह|सवेरे)\b/i, 10],
  [/\b(?:dopahar|afternoon|दोपहर)\b/i, 14],
  [/\b(?:shaam|sham|evening|शाम)\b/i, 17],
  [/\b(?:raat|night|रात)\b/i, 19],
];

const DEFAULT_VISIT_HOUR = 11;

export function parseVisitDateTime(rawText: string, now: Date = new Date()): ParsedVisitTime | null {
  const text = normaliseDevanagariDigits(rawText).toLowerCase();
  const base = startOfDay(now);

  const dayOffset = resolveDayOffset(text, now);
  if (dayOffset === null) return null;

  const target = new Date(base);
  target.setDate(target.getDate() + dayOffset.offset);

  const explicitHour = resolveExplicitTime(text);
  const partOfDay = TIME_OF_DAY.find(([pattern]) => pattern.test(text))?.[1] ?? null;

  const hour = explicitHour?.hour ?? partOfDay ?? DEFAULT_VISIT_HOUR;
  const minute = explicitHour?.minute ?? 0;
  target.setHours(hour, minute, 0, 0);

  // "Sunday 4 baje" at 5 pm on Sunday means next Sunday, not two hours ago.
  if (target.getTime() <= now.getTime() && dayOffset.offset === 0) {
    target.setDate(target.getDate() + (dayOffset.weekly ? 7 : 1));
  }

  return {
    scheduledFor: target,
    dateHint: rawText.trim(),
    timeAssumed: explicitHour === null && partOfDay === null,
    confidence: explicitHour ? 'high' : partOfDay ? 'medium' : dayOffset.confidence,
  };
}

interface DayOffset {
  offset: number;
  weekly: boolean;
  confidence: 'high' | 'medium' | 'low';
}

function resolveDayOffset(text: string, now: Date): DayOffset | null {
  if (/\b(?:aaj|today|आज)\b/i.test(text)) return { offset: 0, weekly: false, confidence: 'high' };
  if (/\b(?:kal|tomorrow|कल)\b/i.test(text)) return { offset: 1, weekly: false, confidence: 'high' };
  if (/\b(?:parso|parson|day\s*after|परसों)\b/i.test(text)) {
    return { offset: 2, weekly: false, confidence: 'high' };
  }

  const weekday = WEEKDAYS.find(([pattern]) => pattern.test(text))?.[1];
  if (weekday !== undefined) {
    const wantsNext = /\b(?:next|agle|agla|अगले|अगला)\b/i.test(text);
    let offset = (weekday - now.getDay() + 7) % 7;
    if (offset === 0) offset = 7;
    if (wantsNext && offset < 7) offset += 7;
    return { offset, weekly: true, confidence: 'high' };
  }

  if (/\b(?:weekend|वीकेंड)\b/i.test(text)) {
    // Next Saturday.
    const offset = (6 - now.getDay() + 7) % 7 || 7;
    return { offset, weekly: true, confidence: 'medium' };
  }

  const inDays = text.match(/\b(\d{1,2})\s*(?:days?|din|दिन)\b/i);
  if (inDays) return { offset: Number(inDays[1]), weekly: false, confidence: 'medium' };

  if (/\b(?:this\s*week|is\s*hafte|इस\s*हफ़्ते)\b/i.test(text)) {
    return { offset: 2, weekly: false, confidence: 'low' };
  }
  if (/\b(?:next\s*week|agle\s*hafte|अगले\s*हफ़्ते)\b/i.test(text)) {
    return { offset: 7, weekly: false, confidence: 'low' };
  }

  return null;
}

function resolveExplicitTime(text: string): { hour: number; minute: number } | null {
  // "4 pm", "4:30pm", "11 baje", "11 बजे"
  const match = text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|baje|बजे)?\b/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const marker = match[3]?.toLowerCase();

  if (hour > 23 || minute > 59) return null;
  if (!marker) return null;

  if (marker === 'pm' && hour < 12) hour += 12;
  if (marker === 'am' && hour === 12) hour = 0;
  if ((marker === 'baje' || marker === 'बजे') && hour <= 7) {
    // "5 baje" for a site visit means 5 in the evening, not 5 in the morning.
    hour += 12;
  }

  return { hour, minute };
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
