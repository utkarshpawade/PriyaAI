import type { Lead, LeadStatus, LeadTemperature, Prisma } from '../../generated/client/index.js';
import { prisma } from '../client.js';

/** The slot fields a Lead row mirrors. Kept structural so @rvagent/db stays dependency-free. */
export interface LeadSlotValues {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  intent?: string | null;
  location?: string | null;
  propertyType?: string | null;
  configuration?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  purpose?: string | null;
  timeline?: string | null;
  financing?: string | null;
  preferredCallbackTime?: string | null;
  objections?: string[];
}

export interface SyncLeadInput {
  callId: string;
  slots: LeadSlotValues;
  score?: number;
  temperature?: LeadTemperature | null;
  status?: LeadStatus;
}

/**
 * Writes the current slot state to the call's Lead, creating it on first use.
 *
 * Called on every `update_requirements`, so a demo that is interrupted halfway
 * still leaves a partially-qualified lead in the dashboard rather than nothing.
 */
export async function syncLeadForCall(input: SyncLeadInput): Promise<Lead> {
  const call = await prisma.call.findUnique({
    where: { id: input.callId },
    select: { id: true, leadId: true },
  });
  if (!call) throw new Error(`syncLeadForCall: unknown call ${input.callId}`);

  const data = toLeadData(input);
  const phone = normalisePhone(input.slots.phone);

  if (call.leadId) {
    const existingByPhone = phone ? await findOtherLeadByPhone(phone, call.leadId) : null;
    if (existingByPhone) {
      // The caller turned out to be a lead we already knew about. Fold this
      // call's findings into the known lead and drop the placeholder.
      const merged = await prisma.lead.update({ where: { id: existingByPhone.id }, data });
      await prisma.call.update({ where: { id: call.id }, data: { leadId: merged.id } });
      await prisma.lead.deleteMany({ where: { id: call.leadId, calls: { none: {} } } });
      return merged;
    }
    return prisma.lead.update({ where: { id: call.leadId }, data });
  }

  const existing = phone ? await prisma.lead.findUnique({ where: { phone } }) : null;
  const lead = existing
    ? await prisma.lead.update({ where: { id: existing.id }, data })
    : await prisma.lead.create({ data });

  await prisma.call.update({ where: { id: call.id }, data: { leadId: lead.id } });
  return lead;
}

export async function updateLead(id: string, patch: Prisma.LeadUpdateInput): Promise<Lead> {
  return prisma.lead.update({ where: { id }, data: patch });
}

export interface LeadListFilters {
  search?: string;
  status?: LeadStatus;
  temperature?: LeadTemperature;
  minScore?: number;
  language?: string;
  createdAfter?: Date;
  take?: number;
}

export async function listLeads(filters: LeadListFilters = {}) {
  const where: Prisma.LeadWhereInput = {};

  if (filters.search) {
    const search = filters.search;
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
      { location: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (filters.status) where.status = filters.status;
  if (filters.temperature) where.temperature = filters.temperature;
  if (filters.minScore != null) where.score = { gte: filters.minScore };
  if (filters.createdAfter) where.createdAt = { gte: filters.createdAfter };
  if (filters.language) where.calls = { some: { primaryLanguage: filters.language } };

  return prisma.lead.findMany({
    where,
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
    take: filters.take ?? 200,
    include: {
      calls: {
        orderBy: { startedAt: 'desc' },
        select: {
          id: true,
          startedAt: true,
          durationSec: true,
          outcome: true,
          primaryLanguage: true,
          transport: true,
        },
      },
    },
  });
}

export type LeadWithCalls = Awaited<ReturnType<typeof listLeads>>[number];

function toLeadData(input: SyncLeadInput): Prisma.LeadUncheckedCreateInput {
  const { slots } = input;
  return {
    name: slots.name ?? undefined,
    phone: normalisePhone(slots.phone) ?? undefined,
    email: slots.email ?? undefined,
    intent: slots.intent ?? undefined,
    location: slots.location ?? undefined,
    propertyType: slots.propertyType ?? undefined,
    configuration: slots.configuration ?? undefined,
    budgetMin: slots.budgetMin ?? undefined,
    budgetMax: slots.budgetMax ?? undefined,
    purpose: slots.purpose ?? undefined,
    timeline: slots.timeline ?? undefined,
    financing: slots.financing ?? undefined,
    preferredCallbackTime: slots.preferredCallbackTime ?? undefined,
    objections: slots.objections && slots.objections.length > 0 ? slots.objections : undefined,
    score: input.score,
    temperature: input.temperature ?? undefined,
    status: input.status,
  };
}

async function findOtherLeadByPhone(phone: string, excludeId: string) {
  const found = await prisma.lead.findUnique({ where: { phone }, select: { id: true } });
  return found && found.id !== excludeId ? found : null;
}

/** Stores Indian numbers as bare 10 digits so `+91`, `0`, and spacing all collide. */
export function normalisePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits.length > 0 ? digits : null;
}
