/**
 * Five realistic completed calls, one per behaviour the demo needs to show:
 * a Hinglish qualification, a pure-Hindi caller, an English investor, a hostile
 * caller, and a callback request. Seeded so the dashboard is never empty during
 * an interview.
 *
 * All names, numbers and property details are fictional.
 */

export interface SeedTurn {
  role: 'user' | 'assistant';
  text: string;
  language: 'hi' | 'hi-en' | 'en';
  interrupted?: boolean;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; detail: string; ok: boolean }>;
  sttMs?: number;
  llmFirstTokenMs?: number;
  ttsFirstByteMs?: number;
  totalMs?: number;
}

export interface SeedCall {
  minutesAgo: number;
  transport: 'web' | 'phone';
  direction: 'inbound' | 'outbound';
  languageMode: string;
  primaryLanguage: 'hi' | 'hi-en' | 'en';
  outcome: 'qualified' | 'not_interested' | 'callback_requested' | 'wrong_number' | 'abandoned';
  durationSec: number;
  lead: {
    name?: string;
    phone?: string;
    email?: string;
    intent?: string;
    location?: string;
    propertyType?: string;
    configuration?: string;
    budgetMin?: number;
    budgetMax?: number;
    purpose?: string;
    timeline?: string;
    financing?: string;
    preferredCallbackTime?: string;
    objections?: string[];
    score: number;
    temperature: 'hot' | 'warm' | 'cold';
    status:
      | 'new_lead'
      | 'qualified'
      | 'unqualified'
      | 'callback_scheduled'
      | 'site_visit_scheduled'
      | 'do_not_call';
  };
  turns: SeedTurn[];
  summary: {
    keyPoints: string[];
    objections: string[];
    questionsAgentCouldNotAnswer: string[];
    sentiment: 'positive' | 'neutral' | 'negative';
    nextAction: string;
    followUpInDays: number | null;
    agentNotes: string;
    summaryEn: string;
    summaryHi: string;
  };
  siteVisit?: { inDays: number; dateHint: string; projectSlug: string };
  followUps?: string[];
}

const LATENCY = { sttMs: 780, llmFirstTokenMs: 340, ttsFirstByteMs: 610, totalMs: 2_100 };

export const SEED_CALLS: SeedCall[] = [
  {
    minutesAgo: 42,
    transport: 'web',
    direction: 'inbound',
    languageMode: 'auto',
    primaryLanguage: 'hi-en',
    outcome: 'qualified',
    durationSec: 214,
    lead: {
      name: 'Rohit Sharma',
      phone: '9821045566',
      intent: 'buy',
      location: 'Hinjewadi Phase 2',
      propertyType: 'apartment',
      configuration: '3BHK',
      budgetMin: 10_000_000,
      budgetMax: 12_500_000,
      purpose: 'self_use',
      timeline: '3_months',
      financing: 'loan',
      objections: ['Possession timeline feels far at December 2027'],
      score: 88,
      temperature: 'hot',
      status: 'site_visit_scheduled',
    },
    turns: [
      { role: 'assistant', text: 'Namaste! Main Priya bol rahi hoon, Meridian Group se. Do minute baat kar sakte hain aapse?', language: 'hi-en', ...LATENCY },
      { role: 'user', text: 'Haan bataiye, main sun raha hoon', language: 'hi-en', sttMs: 690 },
      { role: 'assistant', text: 'Theek hai, aap property purchase karne ka soch rahe hain ya abhi sirf options explore kar rahe hain?', language: 'hi-en', ...LATENCY },
      { role: 'user', text: 'Ghar kharidna hai, 2 BHK dekh raha hoon Hinjewadi mein', language: 'hi-en', sttMs: 820 },
      {
        role: 'assistant',
        text: 'Samajh gayi, note kar liya. Aapka budget approximately kitna soch rakha hai?',
        language: 'hi-en',
        toolCalls: [
          { name: 'update_requirements', args: { intent: 'buy', configuration: '2BHK', location: 'Hinjewadi' }, detail: 'set intent, configuration, location', ok: true },
        ],
        ...LATENCY,
      },
      { role: 'user', text: 'Actually 3 BHK dekh lijiye, budget 1 crore se 1.25 crore ke beech', language: 'hi-en', sttMs: 910 },
      {
        role: 'assistant',
        text: 'Bilkul, 3 BHK aur budget update kar diya. Aapki range mein 985 sq ft aur 1040 sq ft ke do units available hain, indicative price ek crore chaar lakh se. Yeh indicative price hai aur availability par depend karta hai.',
        language: 'hi-en',
        toolCalls: [
          { name: 'update_requirements', args: { configuration: '3BHK', budgetMin: 10_000_000, budgetMax: 12_500_000 }, detail: 'revised configuration, budget', ok: true },
          { name: 'check_matching_units', args: { configuration: '3BHK' }, detail: 'check_matching_units → 2 match(es), from ₹1.04 Cr', ok: true },
        ],
        ...LATENCY,
      },
      { role: 'user', text: 'Possession kab tak milega?', language: 'hi-en', sttMs: 640 },
      {
        role: 'assistant',
        text: 'Possession December 2027 expected hai, current construction plan ke hisaab se. Abhi Towers A aur B 11th slab par hain.',
        language: 'hi-en',
        toolCalls: [{ name: 'get_project_info', args: { topic: 'possession' }, detail: 'get_project_info(possession) → Aureva Skyline', ok: true }],
        ...LATENCY,
      },
      { role: 'user', text: 'Thoda der hai, lekin theek hai. Teen mahine mein finalise karunga, home loan lunga', language: 'hi-en', sttMs: 1_050 },
      { role: 'assistant', text: 'Note kar liya. Main aapka naam jaan sakti hoon?', language: 'hi-en', ...LATENCY },
      { role: 'user', text: 'Rohit Sharma, number 98210 45566', language: 'hi-en', sttMs: 870 },
      {
        role: 'assistant',
        text: 'Perfect Rohit ji. Aap site dekhne aana chahenge? Weekend ya weekday, jo aapko suit kare.',
        language: 'hi-en',
        toolCalls: [{ name: 'capture_contact', args: { name: 'Rohit Sharma', phone: '9821045566' }, detail: 'capture_contact → name, phone', ok: true }],
        ...LATENCY,
      },
      { role: 'user', text: 'Haan is Sunday shaam ko aa jaunga', language: 'hi-en', sttMs: 720 },
      {
        role: 'assistant',
        text: 'Site visit note kar liya. Main confirmation aur location WhatsApp par bhej deti hoon. Thank you Rohit ji, aapka din shubh rahe!',
        language: 'hi-en',
        toolCalls: [
          { name: 'schedule_site_visit', args: { dateHint: 'is Sunday shaam' }, detail: 'schedule_site_visit("is Sunday shaam") → Sunday, 5:00 pm', ok: true },
          { name: 'end_call', args: { reason: 'qualified' }, detail: 'end_call(qualified)', ok: true },
        ],
        ...LATENCY,
      },
    ],
    summary: {
      keyPoints: [
        'Caller is buying for self use.',
        'Revised requirement mid-call from 2 BHK to 3 BHK.',
        'Budget: ₹1 Cr – ₹1.25 Cr.',
        'Timeline: within 3 months, financing via home loan.',
      ],
      objections: ['Possession timeline feels far at December 2027'],
      questionsAgentCouldNotAnswer: [],
      sentiment: 'positive',
      nextAction: 'Send the 3 BHK floor plans and price sheet, then confirm the Sunday site visit.',
      followUpInDays: 1,
      agentNotes: 'Strong lead. Changed configuration and budget mid-call and stayed engaged.',
      summaryEn:
        'Lead qualified after a 4-minute conversation across 15 turns.\nRohit Sharma is looking at a 3 BHK in Hinjewadi Phase 2, with a budget of ₹1 Cr – ₹1.25 Cr.\nHe revised his requirement from 2 BHK to 3 BHK mid-call and raised his budget accordingly.\nHe wants to close within 3 months, financing via a home loan.\nOnly reservation was the December 2027 possession date.\nQualification score 88/100 (hot). Site visit booked for Sunday evening.',
      summaryHi:
        'लीड qualified हुई — कुल 15 turns की बातचीत हुई।\nRohit Sharma 3BHK Hinjewadi Phase 2 में देख रहे हैं, budget ₹1 Cr – ₹1.25 Cr।\nCall के बीच में उन्होंने 2 BHK से 3 BHK requirement बदली और budget भी बढ़ाया।\nTimeline: 3 महीने में, payment home loan से।\nएक ही objection था — possession December 2027 थोड़ा दूर लगा।\nQualification score 88/100 (hot)। Sunday शाम site visit book हो गया।',
    },
    siteVisit: { inDays: 3, dateHint: 'is Sunday shaam', projectSlug: 'aureva-skyline' },
  },

  {
    minutesAgo: 190,
    transport: 'web',
    direction: 'inbound',
    languageMode: 'hi',
    primaryLanguage: 'hi',
    outcome: 'qualified',
    durationSec: 168,
    lead: {
      name: 'सुनीता देशपांडे',
      phone: '9765512340',
      intent: 'buy',
      location: 'Hinjewadi Phase 2',
      propertyType: 'apartment',
      configuration: '2BHK',
      budgetMax: 8_000_000,
      purpose: 'self_use',
      timeline: '6_months',
      financing: 'loan',
      objections: [],
      score: 74,
      temperature: 'hot',
      status: 'qualified',
    },
    turns: [
      { role: 'assistant', text: 'नमस्ते! मैं प्रिया बोल रही हूँ, Meridian Group से। क्या दो मिनट बात कर सकते हैं?', language: 'hi', ...LATENCY },
      { role: 'user', text: 'हाँ जी बताइए', language: 'hi', sttMs: 610 },
      { role: 'assistant', text: 'ठीक है, आप घर खरीदने का सोच रहे हैं या अभी सिर्फ़ options देख रहे हैं?', language: 'hi', ...LATENCY },
      { role: 'user', text: 'मुझे घर खरीदना है, दो बीएचके चाहिए', language: 'hi', sttMs: 780 },
      {
        role: 'assistant',
        text: 'समझ गई। आपका budget लगभग कितना सोचा है?',
        language: 'hi',
        toolCalls: [{ name: 'update_requirements', args: { intent: 'buy', configuration: '2BHK' }, detail: 'set intent, configuration', ok: true }],
        ...LATENCY,
      },
      { role: 'user', text: 'बजट अस्सी लाख तक है', language: 'hi', sttMs: 700 },
      {
        role: 'assistant',
        text: 'बिल्कुल, नोट कर लिया। दो बीएचके की indicative pricing बहत्तर लाख से छियासी लाख है। यह indicative price है और availability पर निर्भर करता है।',
        language: 'hi',
        toolCalls: [
          { name: 'update_requirements', args: { budgetMax: 8_000_000 }, detail: 'set budget', ok: true },
          { name: 'get_project_info', args: { topic: 'price' }, detail: 'get_project_info(price) → Aureva Skyline', ok: true },
        ],
        ...LATENCY,
      },
      { role: 'user', text: 'छह महीने में लेना है, लोन से करूँगी। नाम सुनीता देशपांडे, नंबर ९७६५५१२३४०', language: 'hi', sttMs: 1_120 },
      {
        role: 'assistant',
        text: 'धन्यवाद सुनीता जी। मैं details भेज देती हूँ और site visit confirm कर दूँगी। आपका दिन शुभ रहे!',
        language: 'hi',
        toolCalls: [
          { name: 'capture_contact', args: { name: 'सुनीता देशपांडे', phone: '9765512340' }, detail: 'capture_contact → name, phone', ok: true },
          { name: 'end_call', args: { reason: 'qualified' }, detail: 'end_call(qualified)', ok: true },
        ],
        ...LATENCY,
      },
    ],
    summary: {
      keyPoints: ['Caller is buying for self use.', 'Wants a 2BHK.', 'Budget: up to ₹80 L.', 'Timeline: within 6 months.'],
      objections: [],
      questionsAgentCouldNotAnswer: [],
      sentiment: 'positive',
      nextAction: 'Send the 2 BHK floor plans and price sheet, then confirm a site visit.',
      followUpInDays: 1,
      agentNotes: 'Entire call in Hindi. Caller gave her number in Devanagari digits; parser handled it.',
      summaryEn:
        'Lead qualified after a 3-minute conversation across 9 turns.\nSunita Deshpande is looking at a 2 BHK in Hinjewadi Phase 2, with a budget of up to ₹80 L.\nShe wants to close within 6 months, financing via a home loan.\nNo objections were raised during the call.\nThe entire conversation was conducted in Hindi.\nQualification score 74/100 (hot).',
      summaryHi:
        'लीड qualified हुई — कुल 9 turns की बातचीत हुई।\nसुनीता देशपांडे 2BHK Hinjewadi Phase 2 में देख रही हैं, budget ₹80 L तक।\nTimeline: 6 महीने में, payment home loan से।\nकॉल में कोई objection नहीं आया।\nपूरी बातचीत हिंदी में हुई।\nQualification score 74/100 (hot)।',
    },
  },

  {
    minutesAgo: 320,
    transport: 'web',
    direction: 'inbound',
    languageMode: 'en',
    primaryLanguage: 'en',
    outcome: 'callback_requested',
    durationSec: 96,
    lead: {
      name: 'Arjun Menon',
      phone: '9900112233',
      email: 'arjun.menon@example.com',
      intent: 'invest',
      location: 'Kharadi',
      propertyType: 'apartment',
      configuration: '3BHK',
      budgetMin: 13_000_000,
      budgetMax: 16_000_000,
      purpose: 'investment',
      timeline: '12_months',
      financing: 'self_funded',
      preferredCallbackTime: 'Tomorrow after 7 pm',
      objections: ['Wants to compare rental yield against another Kharadi project'],
      score: 61,
      temperature: 'warm',
      status: 'callback_scheduled',
    },
    turns: [
      { role: 'assistant', text: 'Hello! This is Priya from Meridian Group. Do you have two minutes to talk?', language: 'en', ...LATENCY },
      { role: 'user', text: 'Sure, but I am in a meeting shortly', language: 'en', sttMs: 660 },
      { role: 'assistant', text: 'Understood, I will be quick. Are you looking to purchase, or just exploring options at this stage?', language: 'en', ...LATENCY },
      { role: 'user', text: 'Investment. A 3 BHK in Kharadi, roughly 1.3 to 1.6 crore, self funded', language: 'en', sttMs: 980 },
      {
        role: 'assistant',
        text: 'Noted. Meridian Verde in Kharadi has 3 BHK units from 1,290 to 1,365 sq ft carpet, indicatively ₹1.38 crore to ₹1.62 crore. This is an indicative price and subject to availability.',
        language: 'en',
        toolCalls: [
          { name: 'update_requirements', args: { intent: 'invest', configuration: '3BHK', location: 'Kharadi', budgetMin: 13_000_000, budgetMax: 16_000_000, purpose: 'investment', financing: 'self_funded' }, detail: 'set intent, configuration, location, budget, purpose, financing', ok: true },
          { name: 'check_matching_units', args: { configuration: '3BHK', projectSlug: 'meridian-verde' }, detail: 'check_matching_units → 3 match(es), from ₹1.39 Cr', ok: true },
        ],
        ...LATENCY,
      },
      { role: 'user', text: 'What rental yield can I expect there?', language: 'en', sttMs: 700 },
      {
        role: 'assistant',
        text: 'I do not have a confirmed rental yield figure, and I would rather not guess. Let me check with my senior and get back to you. What time would be convenient for me to call?',
        language: 'en',
        toolCalls: [{ name: 'get_project_info', args: { topic: 'price' }, detail: 'get_project_info(price) → Meridian Verde', ok: true }],
        ...LATENCY,
      },
      { role: 'user', text: 'Tomorrow after 7 pm. Arjun Menon, 99001 12233', language: 'en', sttMs: 840 },
      {
        role: 'assistant',
        text: 'Perfect, I will call you then. Thank you, have a good day!',
        language: 'en',
        toolCalls: [
          { name: 'capture_contact', args: { name: 'Arjun Menon', phone: '9900112233' }, detail: 'capture_contact → name, phone', ok: true },
          { name: 'end_call', args: { reason: 'callback_requested' }, detail: 'end_call(callback_requested)', ok: true },
        ],
        ...LATENCY,
      },
    ],
    summary: {
      keyPoints: ['Caller is investing.', 'Wants a 3BHK in Kharadi.', 'Budget: ₹1.3 Cr – ₹1.6 Cr.', 'Self funded, 12-month horizon.'],
      objections: ['Wants to compare rental yield against another Kharadi project'],
      questionsAgentCouldNotAnswer: ['Expected rental yield for Meridian Verde'],
      sentiment: 'neutral',
      nextAction: 'Call back tomorrow after 7 pm with a researched rental-yield answer.',
      followUpInDays: 1,
      agentNotes:
        'Agent correctly refused to invent a rental yield figure and logged it for follow-up.',
      summaryEn:
        'Callback requested after a 2-minute conversation across 9 turns.\nArjun Menon is looking at a 3 BHK in Kharadi as an investment, with a budget of ₹1.3 Cr – ₹1.6 Cr.\nHe is self funded with a 12-month horizon.\nHe asked about rental yield, which the agent could not answer from the knowledge base and escalated instead of guessing.\nQualification score 61/100 (warm).\nNext action: call back tomorrow after 7 pm with a researched answer.',
      summaryHi:
        'Callback माँगा गया — कुल 9 turns की बातचीत हुई।\nArjun Menon 3BHK Kharadi में investment के लिए देख रहे हैं, budget ₹1.3 Cr – ₹1.6 Cr।\nPayment self-funded, timeline एक साल।\nउन्होंने rental yield पूछा जो knowledge base में नहीं था — agent ने अंदाज़ा नहीं लगाया, follow-up के लिए log कर दिया।\nQualification score 61/100 (warm)।',
    },
    followUps: ['Expected rental yield for Meridian Verde'],
  },

  {
    minutesAgo: 460,
    transport: 'phone',
    direction: 'outbound',
    languageMode: 'auto',
    primaryLanguage: 'hi-en',
    outcome: 'not_interested',
    durationSec: 31,
    lead: {
      phone: '9812200455',
      objections: ['Annoyed at being called'],
      score: 8,
      temperature: 'cold',
      status: 'do_not_call',
    },
    turns: [
      { role: 'assistant', text: 'Namaste! Main Priya bol rahi hoon, Meridian Group se. Do minute baat kar sakte hain aapse?', language: 'hi-en', ...LATENCY },
      { role: 'user', text: 'Ye kya bakwas hai, roz phone karte ho. Pareshan mat karo', language: 'hi-en', sttMs: 900 },
      {
        role: 'assistant',
        text: 'Maaf kijiye agar maine disturb kiya. Main call yahin end kar deti hoon aur aapka number remove kar dungi. Thank you.',
        language: 'hi-en',
        toolCalls: [{ name: 'end_call', args: { reason: 'not_interested' }, detail: 'end_call(not_interested)', ok: true }],
        ...LATENCY,
      },
    ],
    summary: {
      keyPoints: ['Caller was hostile and asked not to be contacted.'],
      objections: ['Annoyed at being called'],
      questionsAgentCouldNotAnswer: [],
      sentiment: 'negative',
      nextAction: 'Add to the do-not-call list. No follow-up.',
      followUpInDays: null,
      agentNotes:
        'Compliance rule fired: hostility ended the call immediately without a second pitch.',
      summaryEn:
        'Caller not interested after a 1-minute conversation across 3 turns.\nThe caller was hostile and asked not to be contacted again.\nThe agent apologised once, did not defend or re-pitch, and ended the call.\nNo requirements were captured.\nQualification score 8/100 (cold).\nNext action: add to the do-not-call list.',
      summaryHi:
        'कॉलर ने interest नहीं दिखाया — कुल 3 turns की बातचीत हुई।\nकॉलर नाराज़ थे और उन्होंने दोबारा call न करने को कहा।\nAgent ने एक बार माफ़ी माँगी, बहस नहीं की, और call समाप्त कर दी।\nकोई requirement capture नहीं हुई।\nQualification score 8/100 (cold)।',
    },
  },

  {
    minutesAgo: 1_400,
    transport: 'phone',
    direction: 'outbound',
    languageMode: 'auto',
    primaryLanguage: 'hi-en',
    outcome: 'wrong_number',
    durationSec: 22,
    lead: {
      phone: '9700088111',
      objections: [],
      score: 0,
      temperature: 'cold',
      status: 'do_not_call',
    },
    turns: [
      { role: 'assistant', text: 'Namaste! Main Priya bol rahi hoon, Meridian Group se. Do minute baat kar sakte hain aapse?', language: 'hi-en', ...LATENCY },
      { role: 'user', text: 'Ye galat number hai, aisa koi yahan nahi rehta', language: 'hi-en', sttMs: 760 },
      {
        role: 'assistant',
        text: 'Oh, maaf kijiye — galti se call ho gayi. Main yeh number record se hata deti hoon. Thank you!',
        language: 'hi-en',
        toolCalls: [{ name: 'end_call', args: { reason: 'wrong_number' }, detail: 'end_call(wrong_number)', ok: true }],
        ...LATENCY,
      },
    ],
    summary: {
      keyPoints: ['Wrong number.'],
      objections: [],
      questionsAgentCouldNotAnswer: [],
      sentiment: 'negative',
      nextAction: 'Remove this number from the campaign list.',
      followUpInDays: null,
      agentNotes: 'Clean wrong-number handling; number flagged for removal.',
      summaryEn:
        'Wrong number after a 1-minute conversation across 3 turns.\nThe person reached was not the intended contact.\nThe agent apologised and closed the call immediately.\nNo requirements were captured.\nQualification score 0/100 (cold).\nNext action: remove this number from the campaign list.',
      summaryHi:
        'ग़लत नंबर — कुल 3 turns की बातचीत हुई।\nजिनसे बात हुई वे intended contact नहीं थे।\nAgent ने माफ़ी माँगकर तुरंत call समाप्त कर दी।\nकोई requirement capture नहीं हुई।\nQualification score 0/100 (cold)।',
    },
  },
];
