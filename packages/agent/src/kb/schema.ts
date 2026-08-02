import { configurationSchema, propertyTypeSchema } from '@rvagent/shared';
import { z } from 'zod';

/**
 * The knowledge base schema.
 *
 * Everything the agent is allowed to state as fact about a property lives in a
 * structure validated by this schema. The orchestrator has no other source of
 * property information, which is what makes "never invent a fact" enforceable
 * rather than aspirational.
 */

export const kbTopicSchema = z.enum([
  'price',
  'amenities',
  'possession',
  'connectivity',
  'approvals',
  'payment_plan',
  'floor_plans',
  'location',
  'developer',
  'charges',
  'overview',
]);
export type KbTopic = z.infer<typeof kbTopicSchema>;

export const unitStatusSchema = z.enum(['available', 'on_hold', 'sold']);
export type UnitStatus = z.infer<typeof unitStatusSchema>;

export const configurationDetailSchema = z.object({
  configuration: configurationSchema,
  label: z.string(),
  carpetAreaSqft: z.tuple([z.number().positive(), z.number().positive()]),
  bathrooms: z.number().int().positive(),
  balconies: z.number().int().nonnegative(),
  /** Indicative all-inclusive price band in rupees. Never quoted as final. */
  priceBandInr: z.tuple([z.number().positive(), z.number().positive()]),
  floorPlanNote: z.string(),
});

export const connectivityItemSchema = z.object({
  name: z.string(),
  category: z.enum(['it_park', 'highway', 'metro', 'school', 'hospital', 'mall', 'airport', 'railway']),
  distanceKm: z.number().nonnegative(),
  driveTimeMin: z.number().int().nonnegative(),
});

export const paymentPlanSchema = z.object({
  name: z.string(),
  description: z.string(),
  milestones: z.array(z.object({ stage: z.string(), percent: z.number().min(0).max(100) })),
});

export const inventoryUnitSchema = z.object({
  unitId: z.string(),
  tower: z.string(),
  floor: z.number().int().nonnegative(),
  configuration: configurationSchema,
  carpetAreaSqft: z.number().positive(),
  facing: z.enum(['east', 'west', 'north', 'south', 'north-east', 'south-east', 'garden', 'road']),
  priceInr: z.number().positive(),
  status: unitStatusSchema,
});
export type InventoryUnit = z.infer<typeof inventoryUnitSchema>;

export const faqEntrySchema = z.object({
  question: z.string(),
  answer: z.string(),
  topics: z.array(kbTopicSchema).min(1),
});

export const projectSchema = z.object({
  /**
   * Fictional-data marker. Present on every project and surfaced in the UI and
   * the system prompt so nobody can mistake seeded demo data for real inventory.
   */
  IS_FICTIONAL: z.literal(true),

  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  developer: z.string(),
  developerNote: z.string(),
  /** Placeholder in RERA format. Explicitly not a real registration. */
  reraId: z.string(),
  reraNote: z.string(),
  propertyType: propertyTypeSchema,
  positioning: z.string(),

  location: z.object({
    locality: z.string(),
    city: z.string(),
    state: z.string(),
    pincode: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    /** Alternative spellings a caller might use, for fuzzy location matching. */
    aliases: z.array(z.string()).default([]),
  }),

  scale: z.object({
    landAreaAcres: z.number().positive(),
    towers: z.number().int().positive(),
    floorsPerTower: z.string(),
    totalUnits: z.number().int().positive(),
    openSpacePercent: z.number().min(0).max(100),
  }),

  configurations: z.array(configurationDetailSchema).min(1),
  amenities: z.array(z.string()).min(25),

  possession: z.object({
    expectedQuarter: z.string(),
    expectedDate: z.string(),
    constructionStatus: z.string(),
    percentComplete: z.number().min(0).max(100),
    note: z.string(),
  }),

  connectivity: z.array(connectivityItemSchema).min(5),
  approvals: z.array(z.string()).min(3),
  paymentPlans: z.array(paymentPlanSchema).min(1),
  bankTieUps: z.array(z.string()).min(3),

  charges: z.object({
    maintenancePerSqftPerMonth: z.number().positive(),
    coveredParkingInr: z.number().nonnegative(),
    clubhouseMembershipInr: z.number().nonnegative(),
    note: z.string(),
  }),

  inventory: z.array(inventoryUnitSchema).min(1),
  highlights: z.array(z.string()).min(3),
  faq: z.array(faqEntrySchema).min(1),
});

export type Project = z.infer<typeof projectSchema>;
export type ConfigurationDetail = z.infer<typeof configurationDetailSchema>;
