import { z } from 'zod';
import { kbTopicSchema } from '../kb/schema.js';

/**
 * The agent's tool surface.
 *
 * Each tool carries two schemas on purpose. `argsSchema` is zod and is the
 * enforcement boundary — nothing runs until the model's arguments parse. The
 * `parameters` literal is hand-written JSON Schema because the three LLM
 * providers accept overlapping but *different* subsets of JSON Schema (Gemini
 * rejects `$schema` and `additionalProperties`, Anthropic wants a plain object
 * schema), and generating it would mean fighting a converter to emit the
 * intersection. Six small schemas are cheaper to maintain than that.
 */

export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array';
  description: string;
  enum?: readonly string[];
  items?: { type: 'string' };
}

export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required: readonly string[];
}

export interface ToolDefinition<TArgs = unknown> {
  name: string;
  description: string;
  parameters: JsonSchemaObject;
  argsSchema: z.ZodType<TArgs>;
}

const INTENTS = ['buy', 'invest', 'rent', 'just_looking'] as const;
const PROPERTY_TYPES = ['apartment', 'villa', 'plot', 'commercial'] as const;
const CONFIGURATIONS = ['1BHK', '2BHK', '3BHK', '4BHK+', 'plot', 'office', 'retail'] as const;
const PURPOSES = ['self_use', 'investment'] as const;
const TIMELINES = ['immediate', '3_months', '6_months', '12_months', 'exploring'] as const;
const FINANCING = ['loan', 'self_funded', 'undecided'] as const;
const DECLINABLE = [
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
const END_REASONS = ['qualified', 'not_interested', 'callback_requested', 'wrong_number'] as const;

export const updateRequirementsArgs = z.object({
  intent: z.enum(INTENTS).optional(),
  location: z.string().max(120).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  configuration: z.enum(CONFIGURATIONS).optional(),
  budgetMin: z.number().positive().optional(),
  budgetMax: z.number().positive().optional(),
  purpose: z.enum(PURPOSES).optional(),
  timeline: z.enum(TIMELINES).optional(),
  financing: z.enum(FINANCING).optional(),
  preferredCallbackTime: z.string().max(120).optional(),
  objections: z.array(z.string().max(400)).max(10).optional(),
  declined: z.array(z.enum(DECLINABLE)).max(10).optional(),
  /**
   * Accepted but not advertised in the JSON schema. Models routinely put contact
   * details here instead of calling `capture_contact`; rejecting the call would
   * drop the name and number entirely, so the executor forwards them on.
   */
  name: z.string().max(120).optional(),
  phone: z.string().max(24).optional(),
  email: z.string().max(200).optional(),
});
export type UpdateRequirementsArgs = z.infer<typeof updateRequirementsArgs>;

export const getProjectInfoArgs = z.object({
  topic: kbTopicSchema,
  projectSlug: z.string().max(80).optional(),
});
export type GetProjectInfoArgs = z.infer<typeof getProjectInfoArgs>;

export const checkMatchingUnitsArgs = z.object({
  configuration: z.enum(CONFIGURATIONS).optional(),
  budgetMin: z.number().positive().optional(),
  budgetMax: z.number().positive().optional(),
  projectSlug: z.string().max(80).optional(),
});
export type CheckMatchingUnitsArgs = z.infer<typeof checkMatchingUnitsArgs>;

export const scheduleSiteVisitArgs = z.object({
  dateHint: z.string().min(1).max(120),
  time: z.string().max(40).optional(),
  projectSlug: z.string().max(80).optional(),
});
export type ScheduleSiteVisitArgs = z.infer<typeof scheduleSiteVisitArgs>;

export const captureContactArgs = z.object({
  name: z.string().max(120).optional(),
  phone: z.string().max(24).optional(),
  email: z.string().max(200).optional(),
});
export type CaptureContactArgs = z.infer<typeof captureContactArgs>;

export const endCallArgs = z.object({
  reason: z.enum(END_REASONS),
  note: z.string().max(400).optional(),
});
export type EndCallArgs = z.infer<typeof endCallArgs>;

const RUPEES_HINT = 'Absolute rupees, so 85 lakh is 8500000 and 1.2 crore is 12000000.';

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: 'update_requirements',
    description:
      'Record what the caller wants, the moment they say or change it. Use `declined` for slots they refuse.',
    parameters: {
      type: 'object',
      properties: {
        intent: { type: 'string', description: 'Why they are calling.', enum: INTENTS },
        location: { type: 'string', description: 'Preferred locality or city.' },
        propertyType: { type: 'string', description: 'Kind of property.', enum: PROPERTY_TYPES },
        configuration: { type: 'string', description: 'Unit configuration.', enum: CONFIGURATIONS },
        budgetMin: { type: 'number', description: `Lower bound of the budget. ${RUPEES_HINT}` },
        budgetMax: { type: 'number', description: `Upper bound of the budget. ${RUPEES_HINT}` },
        purpose: { type: 'string', description: 'Self use or investment.', enum: PURPOSES },
        timeline: { type: 'string', description: 'How soon they want to close.', enum: TIMELINES },
        financing: { type: 'string', description: 'How they intend to pay.', enum: FINANCING },
        preferredCallbackTime: {
          type: 'string',
          description: 'When they asked to be called back, in their own words.',
        },
        objections: {
          type: 'array',
          description: "Reservations the caller raised, in their own words.",
          items: { type: 'string' },
        },
        declined: {
          type: 'array',
          description: 'Slots the caller refused to answer. Never ask these again.',
          items: { type: 'string' },
        },
      },
      required: [],
    },
    argsSchema: updateRequirementsArgs,
  },
  {
    name: 'get_project_info',
    description:
      'Look up a verified project fact. Call before stating any price, date, distance, amenity or approval.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Which aspect of the project to look up.',
          enum: kbTopicSchema.options,
        },
        projectSlug: {
          type: 'string',
          description: 'Which project. Defaults to the project being pitched.',
        },
      },
      required: ['topic'],
    },
    argsSchema: getProjectInfoArgs,
  },
  {
    name: 'check_matching_units',
    description:
      'Search inventory. If nothing matches it returns nearest options, which you must call out as above budget.',
    parameters: {
      type: 'object',
      properties: {
        configuration: { type: 'string', description: 'Unit configuration.', enum: CONFIGURATIONS },
        budgetMin: { type: 'number', description: `Lower bound. ${RUPEES_HINT}` },
        budgetMax: { type: 'number', description: `Upper bound. ${RUPEES_HINT}` },
        projectSlug: { type: 'string', description: 'Restrict to one project.' },
      },
      required: [],
    },
    argsSchema: checkMatchingUnitsArgs,
  },
  {
    name: 'schedule_site_visit',
    description:
      'Book a site visit. Pass the caller own words for the date, e.g. "kal shaam".',
    parameters: {
      type: 'object',
      properties: {
        dateHint: {
          type: 'string',
          description: 'The date phrase exactly as the caller said it.',
        },
        time: { type: 'string', description: 'Time of day if they gave one, e.g. "4 pm", "shaam".' },
        projectSlug: { type: 'string', description: 'Which project they want to visit.' },
      },
      required: ['dateHint'],
    },
    argsSchema: scheduleSiteVisitArgs,
  },
  {
    name: 'capture_contact',
    description:
      'Store the caller name, phone or email. Indian mobile numbers are validated.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "The caller's name." },
        phone: { type: 'string', description: 'Indian mobile number, 10 digits.' },
        email: { type: 'string', description: 'Email address.' },
      },
      required: [],
    },
    argsSchema: captureContactArgs,
  },
  {
    name: 'end_call',
    description:
      'End the call. Say your closing line first. Use `not_interested` immediately on opt-out.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'How the call ended.', enum: END_REASONS },
        note: { type: 'string', description: 'One line of context for the sales team.' },
      },
      required: ['reason'],
    },
    argsSchema: endCallArgs,
  },
];

export const TOOL_NAMES = TOOL_DEFINITIONS.map((tool) => tool.name);

export function findToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((tool) => tool.name === name);
}
