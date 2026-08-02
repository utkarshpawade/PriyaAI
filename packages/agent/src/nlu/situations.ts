import type { ObjectionKey } from '../language/phrasebook.js';
import { wholeUtterancePattern, wordPattern } from './pattern.js';

/**
 * Detects the conversational situations that must be handled deterministically
 * rather than left to the model.
 *
 * Opt-out and hostility in particular are compliance behaviours: they end the
 * call warmly and immediately no matter what the LLM would rather say next, so
 * they are decided here and enforced by the orchestrator.
 */

export type Situation =
  | 'opt_out'
  | 'hostile'
  | 'wrong_number'
  | 'who_is_this'
  | 'how_got_number'
  | 'is_human'
  | 'discount'
  | 'loan_query'
  | 'busy'
  | 'declines_slot'
  | 'affirmative'
  | 'negative';

const SITUATION_RULES: ReadonlyArray<readonly [Situation, RegExp]> = [
  [
    'opt_out',
    wordPattern(
      "not\\s*interested|no\\s*interest|mujhe\\s*interest\\s*nah?in?|interest\\s*nah?in?\\s*hai|nah?in?\\s*chahiye|don'?t\\s*call|do\\s*not\\s*call|stop\\s*calling|remove\\s*my\\s*number|call\\s*mat\\s*kar[\\p{L}\\p{M}]*|mat\\s*call\\s*kar[\\p{L}\\p{M}]*|number\\s*hata[\\p{L}\\p{M}]*|unsubscribe|मुझे\\s*इंटरेस्ट\\s*नहीं|नहीं\\s*चाहिए|कॉल\\s*मत",
    ),
  ],
  [
    'hostile',
    wordPattern(
      'bakwas|bakwaas|nonsense|rubbish|shut\\s*up|chup\\s*kar[\\p{L}\\p{M}]*|band\\s*karo|pareshan\\s*mat|harass[\\p{L}\\p{M}]*|idiot|stupid|nalayak|bewakoof|bewkoof|faltu|fuck[\\p{L}\\p{M}]*|bloody|बकवास|चुप\\s*कर|बंद\\s*करो|परेशान\\s*मत',
    ),
  ],
  [
    'wrong_number',
    wordPattern(
      'wrong\\s*number|galat\\s*number|ghalat\\s*number|aisa\\s*koi\\s*nah?in?|no\\s*such\\s*person|ग़लत\\s*नंबर|गलत\\s*नंबर|ऐसा\\s*कोई\\s*नहीं',
    ),
  ],
  [
    'is_human',
    wordPattern(
      'are\\s*you\\s*(?:a\\s*)?(?:bot|robot|human|real|ai|machine)|human\\s*ho|insaan\\s*ho|robot\\s*ho|machine\\s*ho|ai\\s*ho|recording\\s*hai|computer\\s*ho|आप\\s*इंसान|रोबोट\\s*हो|मशीन\\s*हो',
    ),
  ],
  [
    'how_got_number',
    wordPattern(
      'how\\s*did\\s*you\\s*get\\s*(?:my|this)\\s*number|where\\s*did\\s*you\\s*get\\s*(?:my|this)|kaise\\s*mila\\s*(?:mera\\s*)?number|number\\s*kaise\\s*mila|number\\s*kah?an\\s*se|kah?an\\s*se\\s*(?:mila|liya)|kisne\\s*diya\\s*(?:mera\\s*)?number|नंबर\\s*कहाँ\\s*से|नंबर\\s*कैसे\\s*मिला|कैसे\\s*मिला',
    ),
  ],
  [
    'who_is_this',
    wordPattern(
      "who\\s*is\\s*this|who'?s\\s*(?:this|calling)|kaun\\s*bol\\s*rah[ai]|aap\\s*kaun|kaun\\s*hai|which\\s*company|kis\\s*company|आप\\s*कौन|कौन\\s*बोल",
    ),
  ],
  [
    'declines_slot',
    wordPattern(
      "nah?in?\\s*dena|nah?in?\\s*bataunga|nah?in?\\s*bataungi|nah?in?\\s*batana|share\\s*nah?in?|don'?t\\s*want\\s*to\\s*share|prefer\\s*not|skip\\s*(?:it|this)|rehne\\s*do|chhod\\s*do|नहीं\\s*दूँगा|नहीं\\s*देना|नहीं\\s*बताऊँगा|रहने\\s*दो",
    ),
  ],
  [
    'discount',
    wordPattern(
      'discount|kam\\s*karo|kam\\s*ho\\s*sakta|best\\s*price|final\\s*price|negotiab[\\p{L}\\p{M}]*|offer\\s*chahiye|rate\\s*kam|price\\s*kam|scheme\\s*hai|डिस्काउंट|कम\\s*करो|रेट\\s*कम',
    ),
  ],
  [
    'loan_query',
    wordPattern(
      'home\\s*loan|loan\\s*(?:milega|kaise|process|eligib[\\p{L}\\p{M}]*)|emi|interest\\s*rate|kitni\\s*emi|down\\s*payment|लोन|ईएमआई|क़िस्त',
    ),
  ],
  [
    'busy',
    wordPattern(
      'busy\\s*(?:hoon|hu|am|right\\s*now)|abhi\\s*nah?in?|baad\\s*(?:mein|me)\\s*call|later\\s*call|call\\s*me\\s*later|meeting\\s*mein|drive\\s*kar[\\p{L}\\p{M}]*|abhi\\s*time\\s*nah?in?|अभी\\s*नहीं|बाद\\s*में',
    ),
  ],
  [
    'affirmative',
    wholeUtterancePattern(
      '(?:yes|yeah|yep|yup|ya|haan|han|ji|ji\\s*haan|bilkul|sure|ok|okay|theek|thik|sahi|correct|right|hmm|hm|हाँ|हां|जी|बिल्कुल|ठीक)(?:\\s+(?:yes|haan|ji|ok|okay|theek|sure|हाँ|जी))*',
    ),
  ],
  [
    'negative',
    wholeUtterancePattern('(?:no|nope|nah|nahi|nahin|na|ji\\s*nahin?|नहीं|ना)'),
  ],
];

/** All situations present in the utterance, in the order they must be handled. */
export function detectSituations(text: string): Situation[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  return SITUATION_RULES.filter(([, pattern]) => pattern.test(trimmed)).map(([situation]) => situation);
}

export function hasSituation(text: string, situation: Situation): boolean {
  return detectSituations(text).includes(situation);
}

const OBJECTION_RULES: ReadonlyArray<readonly [ObjectionKey, RegExp]> = [
  [
    'too_expensive',
    wordPattern(
      'too\\s*(?:expensive|costly|high)|mehenga|mehnga|bahut\\s*zyada|budget\\s*se\\s*bahar|out\\s*of\\s*(?:my\\s*)?budget|afford\\s*nah?in?|महँगा|महंगा|बजट\\s*से\\s*बाहर',
    ),
  ],
  ['discount', wordPattern('discount|negotiab[\\p{L}\\p{M}]*|rate\\s*kam|price\\s*kam|best\\s*price|डिस्काउंट')],
  [
    'location_far',
    wordPattern('too\\s*far|bahut\\s*door|dur\\s*hai|door\\s*hai|far\\s*from|commute|traffic|बहुत\\s*दूर'),
  ],
  [
    'possession_late',
    wordPattern(
      'possession\\s*(?:late|der|too\\s*far)|itni\\s*der|ready\\s*chahiye|ready\\s*possession|बहुत\\s*देर|देर\\s*है',
    ),
  ],
  [
    'need_to_discuss',
    wordPattern(
      'discuss|family\\s*se|wife\\s*se|husband\\s*se|ghar\\s*(?:mein|me)\\s*(?:baat|puch[\\p{L}\\p{M}]*)|think\\s*about|soch\\s*kar|घर\\s*में\\s*बात|सोच\\s*कर',
    ),
  ],
  [
    'already_looking_elsewhere',
    wordPattern(
      'already\\s*(?:looking|seen|booked)|dusri\\s*jagah|kisi\\s*aur\\s*project|another\\s*project|compare\\s*kar[\\p{L}\\p{M}]*|दूसरी\\s*जगह',
    ),
  ],
  ['busy_now', wordPattern('busy|abhi\\s*nah?in?|baad\\s*(?:mein|me)|later|व्यस्त')],
];

export function detectObjection(text: string): ObjectionKey | null {
  return OBJECTION_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

/** A one-word answer that carries no slot content, e.g. "haan", "ok", "hmm". */
export function isContentFreeAnswer(text: string): boolean {
  const situations = detectSituations(text);
  return (
    (situations.includes('affirmative') || situations.includes('negative')) &&
    text.trim().split(/\s+/).length <= 3
  );
}
