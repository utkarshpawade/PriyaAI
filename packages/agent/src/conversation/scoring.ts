import { isWithinBudget, type QualificationSlots } from '@rvagent/shared';
import type { Project } from '../kb/schema.js';

/**
 * Lead scoring.
 *
 * Deliberately a transparent additive model rather than an LLM judgement: the
 * dashboard shows the reasoning lines verbatim, so a sales manager can see
 * exactly why a lead scored 78 and argue with the weights instead of with a
 * black box.
 */

export type LeadTemperature = 'hot' | 'warm' | 'cold';

export interface LeadScore {
  score: number;
  temperature: LeadTemperature;
  reasoning: string[];
}

interface ScoreSignal {
  points: number;
  reason: string;
}

const INTENT_POINTS: Record<string, ScoreSignal> = {
  buy: { points: 22, reason: 'Intent is to buy (+22)' },
  invest: { points: 20, reason: 'Intent is to invest (+20)' },
  rent: { points: 6, reason: 'Looking to rent, not buy (+6)' },
  just_looking: { points: 6, reason: 'Only exploring at this stage (+6)' },
};

const TIMELINE_POINTS: Record<string, ScoreSignal> = {
  immediate: { points: 18, reason: 'Wants to close immediately (+18)' },
  '3_months': { points: 15, reason: 'Closing within 3 months (+15)' },
  '6_months': { points: 10, reason: 'Closing within 6 months (+10)' },
  '12_months': { points: 5, reason: 'Closing within 12 months (+5)' },
  exploring: { points: 2, reason: 'No timeline yet (+2)' },
};

export interface ScoreContext {
  projects: readonly Project[];
  /** Set when the caller opted out or turned hostile: caps the score. */
  disqualified?: boolean;
}

export function scoreLead(slots: QualificationSlots, context: ScoreContext): LeadScore {
  const reasoning: string[] = [];
  let score = 0;

  const award = (signal: ScoreSignal | undefined) => {
    if (!signal) return;
    score += signal.points;
    reasoning.push(signal.reason);
  };

  if (slots.intent) award(INTENT_POINTS[slots.intent]);
  if (slots.timeline) award(TIMELINE_POINTS[slots.timeline]);

  if (slots.configuration) {
    award({ points: 10, reason: `Configuration known: ${slots.configuration} (+10)` });
  }

  if (slots.budgetMin != null || slots.budgetMax != null) {
    award({ points: 12, reason: 'Budget stated (+12)' });

    const hasMatchingInventory = context.projects.some((project) =>
      project.inventory.some(
        (unit) =>
          unit.status === 'available' &&
          (!slots.configuration || unit.configuration === slots.configuration) &&
          isWithinBudget(unit.priceInr, slots.budgetMin, slots.budgetMax),
      ),
    );
    award(
      hasMatchingInventory
        ? { points: 10, reason: 'Budget matches available inventory (+10)' }
        : { points: 0, reason: 'Budget does not match current inventory (+0)' },
    );
  }

  if (slots.location) {
    const matchesProject = context.projects.some((project) =>
      [project.location.locality, project.location.city, ...project.location.aliases].some(
        (candidate) => candidate.toLowerCase().includes(slots.location!.toLowerCase()),
      ),
    );
    award(
      matchesProject
        ? { points: 10, reason: `Preferred location matches a live project (+10)` }
        : { points: 4, reason: 'Location stated but outside current projects (+4)' },
    );
  }

  if (slots.phone) award({ points: 10, reason: 'Contact number captured (+10)' });
  if (slots.name) award({ points: 5, reason: 'Name captured (+5)' });
  if (slots.purpose) award({ points: 4, reason: `Purpose known: ${slots.purpose} (+4)` });
  if (slots.financing) award({ points: 5, reason: `Financing known: ${slots.financing} (+5)` });

  if (slots.objections.length > 0) {
    const penalty = Math.min(9, slots.objections.length * 3);
    score -= penalty;
    reasoning.push(`${slots.objections.length} objection(s) raised (-${penalty})`);
  }

  if (context.disqualified) {
    score = Math.min(score, 15);
    reasoning.push('Caller opted out or ended the call negatively (score capped at 15)');
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return { score: bounded, temperature: temperatureFor(bounded), reasoning };
}

export function temperatureFor(score: number): LeadTemperature {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

/** Maps a scored lead onto the pipeline status the dashboard filters by. */
export function statusForLead(
  score: LeadScore,
  outcome: string,
): 'new_lead' | 'qualified' | 'unqualified' | 'callback_scheduled' | 'site_visit_scheduled' | 'do_not_call' {
  if (outcome === 'not_interested' || outcome === 'wrong_number') return 'do_not_call';
  if (outcome === 'callback_requested') return 'callback_scheduled';
  if (score.score >= 60) return 'qualified';
  if (score.score >= 25) return 'new_lead';
  return 'unqualified';
}
