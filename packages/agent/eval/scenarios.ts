import type { CallOutcome, LanguageMode, QualificationSlots } from '@rvagent/shared';

/**
 * Scripted conversations run through the real orchestrator with MockLLM.
 *
 * This is the regression suite for conversation behaviour: every case here is
 * something an interviewer is likely to try live, and every one of them runs
 * offline in under a second so a flaky network can never make the demo look
 * broken.
 */

export interface ScenarioExpectation {
  /** Slots that must hold these exact values by the end of the call. */
  slots?: Partial<QualificationSlots>;
  outcome?: CallOutcome;
  /** Tools that must have been invoked at least once. */
  toolsCalled?: string[];
  /** Substrings that must appear somewhere in the agent's speech. */
  agentSays?: string[];
  /** Substrings the agent must never say. */
  agentNeverSays?: string[];
  minScore?: number;
  maxScore?: number;
  /** Slots the caller refused; the agent must not ask about them again. */
  declined?: string[];
}

export interface Scenario {
  id: string;
  title: string;
  languageMode: LanguageMode;
  /** Caller utterances, in order. */
  turns: string[];
  /** Runs the silence path instead of sending turns. */
  simulateSilence?: boolean;
  expect: ScenarioExpectation;
}

const NEVER_SAY = ['guaranteed return', 'assured return', '100% safe', 'definitely double'];

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'hinglish-happy-path',
    title: 'Hinglish qualification, start to site visit',
    languageMode: 'hi-en',
    turns: [
      'Haan bataiye',
      'Mujhe ghar kharidna hai',
      'Do BHK chahiye',
      'Hinjewadi mein dekh raha hoon',
      'Budget 75 lakh tak hai',
      'Khud rehne ke liye hai',
      'Teen mahine mein finalise karna hai',
      'Home loan lunga',
      'Mera naam Rohit Sharma hai',
      'Mera number 9876543210 hai',
      'Haan is Sunday site visit kar lete hain',
    ],
    expect: {
      slots: {
        intent: 'buy',
        configuration: '2BHK',
        budgetMax: 7_500_000,
        purpose: 'self_use',
        timeline: '3_months',
        financing: 'loan',
        name: 'Rohit Sharma',
        phone: '9876543210',
      },
      outcome: 'qualified',
      toolsCalled: ['update_requirements', 'capture_contact', 'schedule_site_visit', 'end_call'],
      agentNeverSays: NEVER_SAY,
      minScore: 70,
    },
  },
  {
    id: 'pure-hindi',
    title: 'Pure Hindi caller, Devanagari throughout',
    languageMode: 'hi',
    turns: [
      'हाँ जी बताइए',
      'मुझे घर खरीदना है',
      'तीन बीएचके चाहिए',
      'बजट एक करोड़ तक है',
      'संपत्ति कब मिलेगी?',
    ],
    expect: {
      slots: { intent: 'buy', configuration: '3BHK', budgetMax: 10_000_000 },
      toolsCalled: ['update_requirements', 'get_project_info'],
      agentSays: ['expected'],
      agentNeverSays: NEVER_SAY,
    },
  },
  {
    id: 'pure-english',
    title: 'English caller asking about price',
    languageMode: 'en',
    turns: [
      'Yes, please go ahead',
      'I am looking to buy an apartment',
      'A three bedroom, so 3 BHK',
      'What is the price?',
      'My budget is around 1.2 crore',
    ],
    expect: {
      slots: { intent: 'buy', configuration: '3BHK' },
      toolsCalled: ['update_requirements', 'get_project_info'],
      agentSays: ['indicative'],
      agentNeverSays: NEVER_SAY,
    },
  },
  {
    id: 'mid-call-requirement-change',
    title: 'Caller changes configuration and budget mid-call',
    languageMode: 'hi-en',
    turns: [
      'Mujhe 2 BHK chahiye',
      'Budget 70 lakh hai',
      'Actually 3 BHK dekh lijiye, aur budget 1.5 crore kar sakte hain',
    ],
    expect: {
      // The revision must overwrite both slots, not be ignored as "already set".
      slots: { configuration: '3BHK', budgetMax: 15_000_000 },
      toolsCalled: ['update_requirements'],
      agentNeverSays: NEVER_SAY,
    },
  },
  {
    id: 'location-change',
    title: 'Caller switches to the other project location',
    languageMode: 'hi-en',
    turns: [
      'Mujhe 3 BHK chahiye Hinjewadi mein',
      'Actually Kharadi mein dekhna hai',
      'Kya available hai?',
    ],
    expect: {
      slots: { configuration: '3BHK', location: 'Kharadi' },
      toolsCalled: ['update_requirements', 'check_matching_units'],
      agentNeverSays: NEVER_SAY,
    },
  },
  {
    id: 'budget-range-parsing',
    title: 'Budget stated as a spoken range',
    languageMode: 'hi-en',
    turns: ['Mujhe 2 BHK chahiye', '50 lakh se 60 lakh ke beech budget hai'],
    expect: {
      slots: { budgetMin: 5_000_000, budgetMax: 6_000_000 },
      toolsCalled: ['update_requirements'],
      agentNeverSays: NEVER_SAY,
    },
  },
  {
    id: 'hostile-caller',
    title: 'Abusive caller — end warmly and immediately',
    languageMode: 'hi-en',
    turns: ['Ye kya bakwas hai, pareshan mat karo'],
    expect: {
      outcome: 'not_interested',
      toolsCalled: ['end_call'],
      agentNeverSays: NEVER_SAY,
      maxScore: 15,
    },
  },
  {
    id: 'opt-out',
    title: 'Explicit opt-out is honoured on the spot',
    languageMode: 'hi-en',
    turns: ['Mujhe interest nahin hai'],
    expect: {
      outcome: 'not_interested',
      toolsCalled: ['end_call'],
      agentSays: ['list se hata'],
      agentNeverSays: NEVER_SAY,
      maxScore: 15,
    },
  },
  {
    id: 'wrong-number',
    title: 'Wrong number — apologise and close',
    languageMode: 'hi-en',
    turns: ['Ye galat number hai, aisa koi nahi rehta yahan'],
    expect: {
      outcome: 'wrong_number',
      toolsCalled: ['end_call'],
      agentNeverSays: NEVER_SAY,
    },
  },
  {
    id: 'off-kb-question',
    title: 'Question outside the knowledge base — refuse to speculate',
    languageMode: 'hi-en',
    turns: [
      'Mujhe 2 BHK chahiye',
      'Is society mein kitne Marathi families rehte hain?',
    ],
    expect: {
      // The agent must say it will check rather than inventing a number.
      agentSays: ['guess nahi'],
      agentNeverSays: NEVER_SAY,
    },
  },
  {
    id: 'discount-demand',
    title: 'Discount demand — no promise, escalate honestly',
    languageMode: 'hi-en',
    turns: ['Mujhe 2 BHK chahiye', 'Discount kitna milega? Rate kam karo'],
    expect: {
      agentSays: ['promise nahi kar sakti'],
      agentNeverSays: [...NEVER_SAY, 'discount confirm'],
    },
  },
  {
    id: 'loan-question',
    title: 'Loan and EMI question — explain, never advise',
    languageMode: 'hi-en',
    turns: ['Mujhe 2 BHK chahiye', 'Home loan kaise milega, EMI kitni banegi?'],
    expect: {
      agentSays: ['bank'],
      agentNeverSays: [...NEVER_SAY, 'loan definitely'],
    },
  },
  {
    id: 'declined-slot',
    title: 'Caller refuses to share a number — never asked twice',
    languageMode: 'hi-en',
    turns: [
      'Ghar kharidna hai, mujhe 2 BHK chahiye Wakad mein',
      'Budget 80 lakh hai, khud rehne ke liye',
      'Teen mahine mein finalise karunga, home loan lunga',
      'Mera naam Amit hai',
      'Number nahi dena chahta',
      'Aur kya options hain?',
    ],
    expect: {
      slots: { name: 'Amit' },
      declined: ['phone'],
      agentNeverSays: NEVER_SAY,
    },
  },
  {
    id: 'who-is-this',
    title: '"Who is this?" and "how did you get my number?"',
    languageMode: 'hi-en',
    turns: ['Aap kaun bol rahe hain?', 'Mera number kaise mila aapko?'],
    expect: {
      agentSays: ['Meridian Group', 'portal'],
      agentNeverSays: NEVER_SAY,
    },
  },
  {
    id: 'is-this-a-bot',
    title: 'Asked whether the agent is human — must disclose',
    languageMode: 'hi-en',
    turns: ['Aap human ho ya robot ho?'],
    expect: {
      agentSays: ['AI assistant'],
      agentNeverSays: NEVER_SAY,
    },
  },
  {
    id: 'silence',
    title: 'Caller goes silent — nudge once, then close politely',
    languageMode: 'hi-en',
    turns: [],
    simulateSilence: true,
    expect: {
      outcome: 'abandoned',
      agentSays: ['line par hain'],
      agentNeverSays: NEVER_SAY,
    },
  },
];
