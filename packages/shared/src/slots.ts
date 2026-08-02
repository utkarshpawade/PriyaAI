import { z } from 'zod';

/**
 * The lead qualification slots.
 *
 * These live in `shared` rather than `agent` on purpose: they cross three
 * boundaries (agent core, WebSocket protocol, Prisma row, React requirements
 * panel) and a single zod schema keeps all four in step.
 */

export const intentSchema = z.enum(['buy', 'invest', 'rent', 'just_looking']);
export const propertyTypeSchema = z.enum(['apartment', 'villa', 'plot', 'commercial']);
export const configurationSchema = z.enum([
  '1BHK',
  '2BHK',
  '3BHK',
  '4BHK+',
  'plot',
  'office',
  'retail',
]);
export const purposeSchema = z.enum(['self_use', 'investment']);
export const timelineSchema = z.enum([
  'immediate',
  '3_months',
  '6_months',
  '12_months',
  'exploring',
]);
export const financingSchema = z.enum(['loan', 'self_funded', 'undecided']);

export type Intent = z.infer<typeof intentSchema>;
export type PropertyType = z.infer<typeof propertyTypeSchema>;
export type Configuration = z.infer<typeof configurationSchema>;
export type Purpose = z.infer<typeof purposeSchema>;
export type Timeline = z.infer<typeof timelineSchema>;
export type Financing = z.infer<typeof financingSchema>;

export const qualificationSlotsSchema = z.object({
  intent: intentSchema.nullish(),
  location: z.string().trim().min(1).max(120).nullish(),
  propertyType: propertyTypeSchema.nullish(),
  configuration: configurationSchema.nullish(),
  /** Rupees. Stored as absolute INR so 85 lakh is 8_500_000. */
  budgetMin: z.number().int().positive().nullish(),
  budgetMax: z.number().int().positive().nullish(),
  purpose: purposeSchema.nullish(),
  timeline: timelineSchema.nullish(),
  name: z.string().trim().min(1).max(120).nullish(),
  phone: z.string().trim().min(6).max(20).nullish(),
  email: z.string().trim().email().max(200).nullish(),
  preferredCallbackTime: z.string().trim().min(1).max(120).nullish(),
  financing: financingSchema.nullish(),
  objections: z.array(z.string().trim().min(1).max(400)).max(20).default([]),
});

export type QualificationSlots = z.infer<typeof qualificationSlotsSchema>;

/** The partial the `update_requirements` tool accepts. */
export const qualificationSlotsPatchSchema = qualificationSlotsSchema.partial();
export type QualificationSlotsPatch = z.input<typeof qualificationSlotsPatchSchema>;

/**
 * One *question* the agent can ask. `budget` covers both budgetMin and
 * budgetMax because a caller answers them in a single breath ("60 se 75 lakh").
 */
export const SLOT_QUESTION_KEYS = [
  'intent',
  'configuration',
  'location',
  'budget',
  'purpose',
  'timeline',
  'financing',
  'name',
  'phone',
  'preferredCallbackTime',
] as const;

export const slotQuestionKeySchema = z.enum(SLOT_QUESTION_KEYS);
export type SlotQuestionKey = z.infer<typeof slotQuestionKeySchema>;

/** Slots that must be filled before a lead counts as qualified. */
export const REQUIRED_SLOT_KEYS: readonly SlotQuestionKey[] = [
  'intent',
  'configuration',
  'location',
  'budget',
  'timeline',
  'name',
  'phone',
];

export const qualificationStateSchema = z.object({
  slots: qualificationSlotsSchema,
  /** Slots the caller refused; never asked again. */
  declined: z.array(slotQuestionKeySchema).default([]),
  /** The slot the agent asked about on its previous turn, for follow-up parsing. */
  lastAsked: slotQuestionKeySchema.nullable().default(null),
});

export type QualificationState = z.infer<typeof qualificationStateSchema>;

export function emptySlots(): QualificationSlots {
  return qualificationSlotsSchema.parse({ objections: [] });
}

export function emptyQualificationState(): QualificationState {
  return { slots: emptySlots(), declined: [], lastAsked: null };
}

/** True when the question represented by `key` already has an answer. */
export function isSlotFilled(slots: QualificationSlots, key: SlotQuestionKey): boolean {
  if (key === 'budget') {
    return slots.budgetMin != null || slots.budgetMax != null;
  }
  const value = slots[key];
  return value != null && String(value).length > 0;
}

/** 0..1 — share of the required slots that are answered or explicitly declined. */
export function completeness(state: QualificationState): number {
  const resolved = REQUIRED_SLOT_KEYS.filter(
    (key) => isSlotFilled(state.slots, key) || state.declined.includes(key),
  ).length;
  return resolved / REQUIRED_SLOT_KEYS.length;
}
