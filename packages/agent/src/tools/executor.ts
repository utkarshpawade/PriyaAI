import {
  formatBudgetRange,
  formatInrCompact,
  type CallOutcome,
  type Language,
  type QualificationSlots,
  type SlotQuestionKey,
} from '@rvagent/shared';
import type { AgentRuntimeConfig } from '../config.js';
import { scoreLead, type LeadScore } from '../conversation/scoring.js';
import type { QualificationTracker } from '../conversation/state.js';
import { findMatchingUnits, findProject, lookupTopic, primaryProject } from '../kb/index.js';
import type { RecordedTurn } from '../orchestrator/events.js';
import { parseVisitDateTime } from '../nlu/datetime.js';
import { normaliseIndianMobile } from '../nlu/phone.js';
import { normaliseToolArgs } from './normalise-args.js';
import {
  captureContactArgs,
  checkMatchingUnitsArgs,
  endCallArgs,
  findToolDefinition,
  getProjectInfoArgs,
  scheduleSiteVisitArgs,
  updateRequirementsArgs,
} from './definitions.js';

/**
 * Side effects the agent core needs but does not own.
 *
 * Keeping persistence behind this port is what lets the eval harness run the
 * *real* orchestrator against an in-memory store with no database, which is the
 * difference between an eval that proves the conversation logic and one that
 * only proves the mocks.
 */
export interface AgentStore {
  onRequirementsUpdated(payload: {
    slots: QualificationSlots;
    declined: readonly SlotQuestionKey[];
    score: LeadScore;
  }): Promise<void>;
  onSiteVisitScheduled(payload: {
    scheduledFor: Date;
    dateHint: string;
    projectSlug: string;
  }): Promise<void>;
  onUnansweredQuestion(question: string): Promise<void>;
  onTurn(turn: RecordedTurn): Promise<void>;
}

export const noopAgentStore: AgentStore = {
  async onRequirementsUpdated() {},
  async onSiteVisitScheduled() {},
  async onUnansweredQuestion() {},
  async onTurn() {},
};

export interface ToolContext {
  tracker: QualificationTracker;
  config: AgentRuntimeConfig;
  language: Language;
  store: AgentStore;
  now: () => Date;
}

export interface ToolResult {
  ok: boolean;
  /** Fed back to the LLM as the function response. */
  data: Record<string, unknown>;
  /** One line for the dashboard's tool trace. */
  detail: string;
  /** Set by `end_call` to stop the conversation. */
  endCall?: { outcome: CallOutcome; note?: string };
}

export async function executeTool(
  name: string,
  rawArgs: unknown,
  context: ToolContext,
): Promise<ToolResult> {
  if (!findToolDefinition(name)) {
    return { ok: false, data: { error: `Unknown tool "${name}".` }, detail: `Unknown tool ${name}` };
  }

  // Live models emit near-miss vocabulary; coerce before zod sees it.
  const args = normaliseToolArgs(name, isRecord(rawArgs) ? rawArgs : {});

  switch (name) {
    case 'update_requirements':
      return updateRequirements(args, context);
    case 'get_project_info':
      return getProjectInfo(rawArgs, context);
    case 'check_matching_units':
      return checkMatchingUnits(args, context);
    case 'schedule_site_visit':
      return scheduleSiteVisit(rawArgs, context);
    case 'capture_contact':
      return captureContact(rawArgs, context);
    case 'end_call':
      return endCall(rawArgs);
    default:
      return { ok: false, data: { error: `Unhandled tool "${name}".` }, detail: `Unhandled ${name}` };
  }
}

async function updateRequirements(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
  const parsed = updateRequirementsArgs.safeParse(rawArgs);
  if (!parsed.success) return invalidArgs('update_requirements', parsed.error.message);

  const { declined, phone, ...slotPatch } = parsed.data;
  // Contact details belong to `capture_contact`, but models put them here
  // constantly. Normalise the phone the same way rather than storing junk.
  const normalisedPhone = phone ? normaliseIndianMobile(phone.replace(/\D/g, '')) : null;
  const { changes } = context.tracker.merge({
    ...slotPatch,
    ...(normalisedPhone ? { phone: normalisedPhone } : {}),
  });
  for (const key of declined ?? []) context.tracker.decline(key);

  const score = persistRequirements(context);
  await context.store.onRequirementsUpdated({
    slots: context.tracker.slots,
    declined: context.tracker.declined,
    score,
  });

  const revisions = changes.filter((change) => change.isRevision).map((change) => change.key);
  const nextSlot = context.tracker.nextSlot();

  return {
    ok: true,
    data: {
      updated: changes.map((change) => change.key),
      revised: revisions,
      declined: context.tracker.declined,
      remaining: context.tracker.remainingSlots(),
      nextSlotToAsk: nextSlot,
      qualificationScore: score.score,
    },
    detail: describeUpdate(changes.map((change) => change.key), revisions, declined ?? []),
  };
}

function describeUpdate(
  updated: SlotQuestionKey[],
  revised: SlotQuestionKey[],
  declined: readonly string[],
): string {
  const parts: string[] = [];
  if (updated.length > 0) parts.push(`set ${updated.join(', ')}`);
  if (revised.length > 0) parts.push(`revised ${revised.join(', ')}`);
  if (declined.length > 0) parts.push(`declined ${declined.join(', ')}`);
  return parts.length > 0 ? parts.join(' · ') : 'no change';
}

async function getProjectInfo(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
  const parsed = getProjectInfoArgs.safeParse(rawArgs);
  if (!parsed.success) return invalidArgs('get_project_info', parsed.error.message);

  const project = parsed.data.projectSlug
    ? findProject(context.config.projects, parsed.data.projectSlug)
    : primaryProject(context.config.projects);

  if (!project) {
    await context.store.onUnansweredQuestion(
      `Project "${parsed.data.projectSlug}" is not in the knowledge base.`,
    );
    return {
      ok: false,
      data: {
        error: 'No such project in the knowledge base.',
        instruction: 'Tell the caller you will check and get back to them. Do not invent details.',
      },
      detail: `get_project_info(${parsed.data.topic}) — unknown project`,
    };
  }

  const facts = lookupTopic(project, parsed.data.topic);
  return {
    ok: true,
    data: { ...facts, isFictionalDemoData: true },
    detail: `get_project_info(${parsed.data.topic}) → ${project.name}`,
  };
}

async function checkMatchingUnits(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
  const parsed = checkMatchingUnitsArgs.safeParse(rawArgs);
  if (!parsed.success) return invalidArgs('check_matching_units', parsed.error.message);

  const slots = context.tracker.slots;
  const query = {
    configuration: parsed.data.configuration ?? slots.configuration ?? null,
    budgetMin: parsed.data.budgetMin ?? slots.budgetMin ?? null,
    budgetMax: parsed.data.budgetMax ?? slots.budgetMax ?? null,
    projectSlug: parsed.data.projectSlug ?? null,
  };

  const result = findMatchingUnits(context.config.projects, query);
  const shown = result.matches.length > 0 ? result.matches : result.alternatives;

  return {
    ok: true,
    data: {
      query: { ...query, budgetLabel: formatBudgetRange(query.budgetMin, query.budgetMax) },
      matchCount: result.matches.length,
      units: shown.map((entry) => ({
        project: entry.project,
        unitId: entry.unit.unitId,
        tower: entry.unit.tower,
        floor: entry.unit.floor,
        configuration: entry.unit.configuration,
        carpetAreaSqft: entry.unit.carpetAreaSqft,
        facing: entry.unit.facing,
        price: entry.priceLabel,
        aboveBudgetByPercent: Math.round(entry.overshoot * 100),
      })),
      isAlternativeSet: result.matches.length === 0,
      instruction: result.note,
      disclaimer: 'All prices are indicative and subject to availability.',
    },
    detail:
      result.matches.length > 0
        ? `check_matching_units → ${result.matches.length} match(es), from ${result.matches[0].priceLabel}`
        : `check_matching_units → 0 matches, ${result.alternatives.length} alternative(s) above budget`,
  };
}

async function scheduleSiteVisit(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
  const parsed = scheduleSiteVisitArgs.safeParse(rawArgs);
  if (!parsed.success) return invalidArgs('schedule_site_visit', parsed.error.message);

  const phrase = [parsed.data.dateHint, parsed.data.time].filter(Boolean).join(' ');
  const resolved = parseVisitDateTime(phrase, context.now());

  if (!resolved) {
    return {
      ok: false,
      data: {
        error: 'Could not resolve that date.',
        instruction: 'Ask the caller for a specific day, e.g. "Saturday" or "kal".',
      },
      detail: `schedule_site_visit("${phrase}") — unresolved`,
    };
  }

  const project = parsed.data.projectSlug
    ? findProject(context.config.projects, parsed.data.projectSlug)
    : primaryProject(context.config.projects);
  const projectSlug = project?.slug ?? primaryProject(context.config.projects).slug;

  await context.store.onSiteVisitScheduled({
    scheduledFor: resolved.scheduledFor,
    dateHint: phrase,
    projectSlug,
  });

  return {
    ok: true,
    data: {
      scheduledFor: resolved.scheduledFor.toISOString(),
      readable: formatVisitTime(resolved.scheduledFor),
      timeAssumed: resolved.timeAssumed,
      project: project?.name ?? projectSlug,
      instruction: resolved.timeAssumed
        ? 'Confirm the day back to the caller and check the time suits them.'
        : 'Confirm the day and time back to the caller.',
      note: 'This booking is simulated for the demo — no calendar or CRM is contacted.',
    },
    detail: `schedule_site_visit("${phrase}") → ${formatVisitTime(resolved.scheduledFor)}`,
  };
}

async function captureContact(rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
  const parsed = captureContactArgs.safeParse(rawArgs);
  if (!parsed.success) return invalidArgs('capture_contact', parsed.error.message);

  const phone = parsed.data.phone ? normaliseIndianMobile(parsed.data.phone.replace(/\D/g, '')) : null;
  const phoneRejected = Boolean(parsed.data.phone) && phone === null;

  const email = parsed.data.email?.trim();
  const emailValid = email ? /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) : true;

  context.tracker.merge({
    name: parsed.data.name?.trim() || undefined,
    phone: phone ?? undefined,
    email: emailValid ? email || undefined : undefined,
  });

  const score = persistRequirements(context);
  await context.store.onRequirementsUpdated({
    slots: context.tracker.slots,
    declined: context.tracker.declined,
    score,
  });

  const captured = [
    parsed.data.name ? 'name' : null,
    phone ? 'phone' : null,
    emailValid && email ? 'email' : null,
  ].filter(Boolean);

  return {
    ok: !phoneRejected,
    data: {
      captured,
      phoneValid: !phoneRejected,
      instruction: phoneRejected
        ? 'That is not a valid 10-digit Indian mobile number. Read it back and ask them to confirm.'
        : 'Contact stored.',
    },
    detail: phoneRejected
      ? `capture_contact — rejected invalid phone "${parsed.data.phone}"`
      : `capture_contact → ${captured.join(', ') || 'nothing new'}`,
  };
}

async function endCall(rawArgs: unknown): Promise<ToolResult> {
  const parsed = endCallArgs.safeParse(rawArgs);
  if (!parsed.success) return invalidArgs('end_call', parsed.error.message);

  return {
    ok: true,
    data: { ended: true, reason: parsed.data.reason },
    detail: `end_call(${parsed.data.reason})`,
    endCall: { outcome: parsed.data.reason, note: parsed.data.note },
  };
}

function persistRequirements(context: ToolContext): LeadScore {
  return scoreLead(context.tracker.slots, { projects: context.config.projects });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidArgs(tool: string, message: string): ToolResult {
  return {
    ok: false,
    data: { error: `Invalid arguments for ${tool}.`, detail: message },
    detail: `${tool} — invalid arguments`,
  };
}

function formatVisitTime(date: Date): string {
  return date.toLocaleString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Re-exported so callers can render a budget in a tool trace consistently. */
export { formatInrCompact };
