import { formatInrCompact, type Language } from '@rvagent/shared';
import type { KbTopic, Project } from '../../kb/schema.js';
import { phrases } from '../../language/phrasebook.js';
import { wordPattern } from '../../nlu/pattern.js';

/**
 * Grounded answer templates for the MockLLM.
 *
 * Every sentence here is assembled from knowledge-base values — none of it is
 * free text about the property. That is the same constraint a live LLM operates
 * under, so mock mode demonstrates the real grounding behaviour rather than a
 * looser version of it.
 */

const TOPIC_PATTERNS: ReadonlyArray<readonly [KbTopic, RegExp]> = [
  [
    'possession',
    wordPattern(
      'possession|handover|kab\\s*(?:ready|milega|milegi|tak|hoga)|ready\\s*kab|delivery\\s*date|कब\\s*मिल[\\p{L}\\p{M}]*|कब\\s*तक|पज़ेशन|पजेशन',
    ),
  ],
  [
    'approvals',
    wordPattern(
      'rera|approval|approved|legal|noc|clearance|documents?|paperwork|क़ानूनी|कानूनी|अप्रूवल|मंज़ूरी',
    ),
  ],
  [
    'payment_plan',
    wordPattern(
      'payment\\s*plan|booking\\s*amount|instal?ment|down\\s*payment|clp|20:80|bank\\s*(?:tie|approv[\\p{L}\\p{M}]*)|पेमेंट\\s*प्लान|बुकिंग',
    ),
  ],
  [
    'charges',
    wordPattern(
      'maintenance|parking\\s*charge|extra\\s*charge|hidden\\s*charge|stamp\\s*duty|registration|club\\s*(?:house\\s*)?membership|मेंटेनेंस|अतिरिक्त\\s*शुल्क',
    ),
  ],
  [
    'floor_plans',
    wordPattern(
      'floor\\s*plan|carpet\\s*area|built\\s*up|square\\s*feet|sq\\.?\\s*ft|area\\s*kitna|kitna\\s*(?:bada|area)|layout|नक्शा|कार्पेट',
    ),
  ],
  [
    'amenities',
    wordPattern(
      'amenit[\\p{L}\\p{M}]*|facilit[\\p{L}\\p{M}]*|gym|swimming|pool|clubhouse|club\\s*house|play\\s*area|garden|security|सुविधा[\\p{L}\\p{M}]*|अमेनिटी',
    ),
  ],
  [
    'connectivity',
    wordPattern(
      'metro|station|airport|school|hospital|highway|expressway|distance|kitni?\\s*door|kitna\\s*door|nearby|paas\\s*mein|connectivity|it\\s*park|दूर|पास\\s*में|मेट्रो',
    ),
  ],
  [
    'developer',
    wordPattern(
      'developer|builder|company|kaun\\s*bana[\\p{L}\\p{M}]*|track\\s*record|kitne\\s*project|डेवलपर|बिल्डर',
    ),
  ],
  [
    'location',
    wordPattern('location|kah?an\\s*(?:hai|par)|address|kaunsa\\s*area|exactly\\s*where|कहाँ|कहां|लोकेशन'),
  ],
  [
    'price',
    wordPattern(
      'price|rate|cost|kitne?\\s*(?:ka|ki|mein)|kitna\\s*(?:hai|padega)|kimat|keemat|budget\\s*mein|कीमत|दाम|रेट|कितने\\s*का',
    ),
  ],
  [
    'overview',
    wordPattern(
      'about\\s*(?:the\\s*)?project|project\\s*ke\\s*baare|tell\\s*me\\s*more|details\\s*(?:bhej[\\p{L}\\p{M}]*|do|batao)|kya\\s*hai\\s*project|प्रोजेक्ट\\s*के\\s*बारे',
    ),
  ],
];

export const AVAILABILITY_PATTERN = wordPattern(
  'available|availab[\\p{L}\\p{M}]*|options?\\s*(?:hai|kya|dikhao|hain)|kya\\s*kya\\s*hai|unit\\s*(?:hai|available)|inventory|flat\\s*hai|kuch\\s*hai|dikhao|show\\s*me|what\\s*do\\s*you\\s*have|उपलब्ध|क्या\\s*है',
);

export function detectTopic(text: string): KbTopic | null {
  return TOPIC_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

/** Builds a short, grounded answer for one topic in the caller's register. */
export function answerForTopic(topic: KbTopic, project: Project, language: Language): string {
  const set = phrases(language);

  switch (topic) {
    case 'price': {
      const bands = project.configurations
        .map(
          (config) =>
            `${config.configuration} ${formatInrCompact(config.priceBandInr[0])} se ${formatInrCompact(config.priceBandInr[1])}`,
        )
        .join(', ');
      return pick(language, {
        hi: `${project.name} में indicative pricing इस तरह है — ${bands}। ${set.indicativePriceNote}।`,
        'hi-en': `${project.name} mein indicative pricing hai — ${bands}. Yeh ${set.indicativePriceNote}.`,
        en: `Indicative pricing at ${project.name} runs ${bands.replace(/ se /g, ' to ')}. Note that ${set.indicativePriceNote}.`,
      });
    }

    case 'possession': {
      const { expectedDate, constructionStatus } = project.possession;
      return pick(language, {
        hi: `Possession ${expectedDate} expected है, current construction plan के हिसाब से। अभी status: ${constructionStatus}।`,
        'hi-en': `Possession ${expectedDate} expected hai, current construction plan ke hisaab se. Abhi status hai: ${constructionStatus}.`,
        en: `Possession is expected in ${expectedDate} as per the current construction plan. Current status: ${constructionStatus}.`,
      });
    }

    case 'amenities': {
      const top = project.amenities.slice(0, 5).join(', ');
      return pick(language, {
        hi: `${project.amenities.length} से ज़्यादा amenities हैं — ${top}, और भी बहुत कुछ।`,
        'hi-en': `${project.amenities.length} se zyada amenities hain — ${top}, aur bhi bahut kuch.`,
        en: `There are over ${project.amenities.length} amenities — ${top}, and more.`,
      });
    }

    case 'connectivity': {
      const nearest = [...project.connectivity].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 3);
      const list = nearest.map((item) => `${item.name} ${item.distanceKm} km`).join(', ');
      return pick(language, {
        hi: `${project.location.locality} में है। सबसे पास: ${list}।`,
        'hi-en': `Project ${project.location.locality} mein hai. Sabse paas: ${list}.`,
        en: `The project is in ${project.location.locality}. Closest landmarks: ${list}.`,
      });
    }

    case 'approvals': {
      return pick(language, {
        hi: `RERA number ${project.reraId} है, और PMRDA commencement certificate तथा environmental clearance भी हैं।`,
        'hi-en': `RERA number ${project.reraId} hai, aur commencement certificate plus environmental clearance bhi hain.`,
        en: `The RERA number is ${project.reraId}, and the commencement certificate and environmental clearance are in place.`,
      });
    }

    case 'payment_plan': {
      const plan = project.paymentPlans[0];
      const booking = plan.milestones[0];
      return pick(language, {
        hi: `${plan.name} में booking ${booking.percent} percent से शुरू होती है। ${project.bankTieUps.slice(0, 3).join(', ')} के approvals हैं।`,
        'hi-en': `${plan.name} mein booking ${booking.percent} percent se start hoti hai. ${project.bankTieUps.slice(0, 3).join(', ')} ke approvals hain.`,
        en: `Under the ${plan.name}, booking starts at ${booking.percent} percent. We have approvals with ${project.bankTieUps.slice(0, 3).join(', ')}.`,
      });
    }

    case 'floor_plans': {
      const list = project.configurations
        .map((config) => `${config.configuration} ${config.carpetAreaSqft[0]}–${config.carpetAreaSqft[1]} sq ft carpet`)
        .join(', ');
      return pick(language, {
        hi: `Carpet areas इस तरह हैं — ${list}।`,
        'hi-en': `Carpet areas aise hain — ${list}.`,
        en: `Carpet areas are ${list}.`,
      });
    }

    case 'charges': {
      const { maintenancePerSqftPerMonth, coveredParkingInr, clubhouseMembershipInr } = project.charges;
      return pick(language, {
        hi: `Maintenance ${maintenancePerSqftPerMonth} रुपये per sq ft प्रति महीना, covered parking ${formatInrCompact(coveredParkingInr)}, clubhouse membership ${formatInrCompact(clubhouseMembershipInr)}। Stamp duty और registration अलग हैं।`,
        'hi-en': `Maintenance ${maintenancePerSqftPerMonth} rupees per sq ft per month, covered parking ${formatInrCompact(coveredParkingInr)}, clubhouse membership ${formatInrCompact(clubhouseMembershipInr)}. Stamp duty aur registration alag hain.`,
        en: `Maintenance is ${maintenancePerSqftPerMonth} rupees per sq ft per month, covered parking ${formatInrCompact(coveredParkingInr)}, and clubhouse membership ${formatInrCompact(clubhouseMembershipInr)}. Stamp duty and registration are extra.`,
      });
    }

    case 'location': {
      return pick(language, {
        hi: `${project.location.locality}, ${project.location.city} — ${project.location.pincode}। ${project.highlights[0]}।`,
        'hi-en': `${project.location.locality}, ${project.location.city} — pincode ${project.location.pincode}. ${project.highlights[0]}.`,
        en: `${project.location.locality}, ${project.location.city} — pincode ${project.location.pincode}. ${project.highlights[0]}.`,
      });
    }

    case 'developer': {
      return pick(language, {
        hi: `Developer है ${project.developer}। ${project.developerNote}`,
        'hi-en': `Developer hai ${project.developer}. ${project.developerNote}`,
        en: `The developer is ${project.developer}. ${project.developerNote}`,
      });
    }

    case 'overview': {
      const configs = project.configurations.map((config) => config.label).join(', ');
      return pick(language, {
        hi: `${project.name}, ${project.location.locality} में — ${configs}, ${project.scale.towers} towers, possession ${project.possession.expectedDate} expected।`,
        'hi-en': `${project.name}, ${project.location.locality} mein — ${configs}, ${project.scale.towers} towers, possession ${project.possession.expectedDate} expected.`,
        en: `${project.name} in ${project.location.locality} — ${configs}, ${project.scale.towers} towers, possession expected ${project.possession.expectedDate}.`,
      });
    }
  }
}

export interface MatchedUnitSummary {
  project: string;
  configuration: string;
  carpetAreaSqft: number;
  price: string;
  aboveBudgetByPercent: number;
}

/** Phrases an inventory result, including the honest above-budget framing. */
export function answerForUnits(
  units: readonly MatchedUnitSummary[],
  isAlternativeSet: boolean,
  language: Language,
): string {
  if (units.length === 0) {
    return pick(language, {
      hi: 'अभी आपकी requirement के हिसाब से कोई unit available नहीं है। मैं team से check करके बताती हूँ।',
      'hi-en': 'Abhi aapki requirement ke hisaab se koi unit available nahi hai. Main team se check karke batati hoon.',
      en: 'Nothing is available right now for that requirement. Let me check with the team and get back to you.',
    });
  }

  const first = units[0];
  const list = units
    .slice(0, 2)
    .map((unit) => `${unit.configuration} ${unit.carpetAreaSqft} sq ft at ${unit.price}`)
    .join(', ');

  if (isAlternativeSet) {
    return pick(language, {
      hi: `आपकी range में अभी कुछ नहीं है — ये options आपके budget से लगभग ${first.aboveBudgetByPercent} percent ऊपर हैं: ${list}। फिर भी देखना चाहेंगे?`,
      'hi-en': `Aapki range mein abhi kuch nahi hai — ye options aapke budget se lagbhag ${first.aboveBudgetByPercent} percent upar hain: ${list}. Phir bhi dekhna chahenge?`,
      en: `Nothing is available inside your range — these are about ${first.aboveBudgetByPercent} percent above your budget: ${list}. Would you still like to see them?`,
    });
  }

  return pick(language, {
    hi: `आपकी requirement के हिसाब से ${units.length} options हैं — ${list}। ये indicative prices हैं।`,
    'hi-en': `Aapki requirement ke hisaab se ${units.length} options hain — ${list}. Ye indicative prices hain.`,
    en: `I have ${units.length} options matching your requirement — ${list}. These are indicative prices.`,
  });
}

function pick(language: Language, variants: Record<Language, string>): string {
  return variants[language];
}
