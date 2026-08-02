import type {
  CallDirection,
  CallOutcome,
  CallTransport,
  LeadTemperature,
  SiteVisitStatus,
  TurnRole,
} from '../../generated/client/index.js';
import { prisma, toJson } from '../client.js';

export interface CreateCallInput {
  transport: CallTransport;
  direction: CallDirection;
  languageMode: string;
  providerSet: unknown;
  agentConfigId?: number | null;
  leadId?: string | null;
  fromNumber?: string | null;
  toNumber?: string | null;
  twilioCallSid?: string | null;
}

export async function createCall(input: CreateCallInput) {
  return prisma.call.create({
    data: {
      transport: input.transport,
      direction: input.direction,
      languageMode: input.languageMode,
      providerSet: toJson(input.providerSet),
      agentConfigId: input.agentConfigId ?? null,
      leadId: input.leadId ?? null,
      fromNumber: input.fromNumber ?? null,
      toNumber: input.toNumber ?? null,
      twilioCallSid: input.twilioCallSid ?? null,
    },
  });
}

export interface RecordTurnInput {
  callId: string;
  index: number;
  role: TurnRole;
  text: string;
  language: string;
  interrupted?: boolean;
  toolCalls?: unknown;
  sttMs?: number | null;
  llmFirstTokenMs?: number | null;
  ttsFirstByteMs?: number | null;
  totalMs?: number | null;
}

/**
 * Upserts rather than creates: an assistant turn is written once when it starts
 * streaming and rewritten if a barge-in truncates it, and both writes carry the
 * same (callId, index).
 */
export async function recordTurn(input: RecordTurnInput) {
  const data = {
    role: input.role,
    text: input.text,
    language: input.language,
    interrupted: input.interrupted ?? false,
    toolCalls: input.toolCalls == null ? undefined : toJson(input.toolCalls),
    sttMs: round(input.sttMs),
    llmFirstTokenMs: round(input.llmFirstTokenMs),
    ttsFirstByteMs: round(input.ttsFirstByteMs),
    totalMs: round(input.totalMs),
  };

  return prisma.turn.upsert({
    where: { callId_index: { callId: input.callId, index: input.index } },
    create: { callId: input.callId, index: input.index, ...data },
    update: data,
  });
}

export interface FinalizeCallInput {
  callId: string;
  outcome: CallOutcome;
  primaryLanguage?: string | null;
  languageMix?: Record<string, number>;
  recordingUrl?: string | null;
}

export async function finalizeCall(input: FinalizeCallInput) {
  const call = await prisma.call.findUnique({ where: { id: input.callId } });
  if (!call) return null;

  const endedAt = new Date();
  return prisma.call.update({
    where: { id: input.callId },
    data: {
      outcome: input.outcome,
      endedAt,
      durationSec: Math.max(0, Math.round((endedAt.getTime() - call.startedAt.getTime()) / 1000)),
      primaryLanguage: input.primaryLanguage ?? null,
      languageMix: input.languageMix == null ? undefined : toJson(input.languageMix),
      recordingUrl: input.recordingUrl ?? null,
    },
  });
}

export interface SaveSummaryInput {
  callId: string;
  structured: unknown;
  textEn: string;
  textHi: string;
  qualificationScore: number;
  leadTemperature: LeadTemperature;
  sentiment: string;
  nextAction: string;
  suggestedFollowUpDate?: Date | null;
  generatedBy: string;
}

export async function saveSummary(input: SaveSummaryInput) {
  const data = {
    structured: toJson(input.structured),
    textEn: input.textEn,
    textHi: input.textHi,
    qualificationScore: input.qualificationScore,
    leadTemperature: input.leadTemperature,
    sentiment: input.sentiment,
    nextAction: input.nextAction,
    suggestedFollowUpDate: input.suggestedFollowUpDate ?? null,
    generatedBy: input.generatedBy,
  };
  return prisma.summary.upsert({
    where: { callId: input.callId },
    create: { callId: input.callId, ...data },
    update: data,
  });
}

export interface CreateSiteVisitInput {
  callId: string;
  leadId?: string | null;
  scheduledFor: Date;
  dateHint: string;
  projectSlug: string;
  status?: SiteVisitStatus;
  notes?: string | null;
}

export async function createSiteVisit(input: CreateSiteVisitInput) {
  return prisma.siteVisit.create({
    data: {
      callId: input.callId,
      leadId: input.leadId ?? null,
      scheduledFor: input.scheduledFor,
      dateHint: input.dateHint,
      projectSlug: input.projectSlug,
      status: input.status ?? 'requested',
      notes: input.notes ?? null,
    },
  });
}

/** Logs a question the knowledge base could not answer, for human follow-up. */
export async function recordFollowUp(callId: string, question: string, reason?: string) {
  return prisma.followUp.create({
    data: { callId, question, reason: reason ?? 'outside_knowledge_base' },
  });
}

export async function getCallDetail(callId: string) {
  return prisma.call.findUnique({
    where: { id: callId },
    include: {
      lead: true,
      summary: true,
      siteVisits: true,
      followUps: true,
      agentConfig: true,
      turns: { orderBy: { index: 'asc' } },
    },
  });
}

export type CallDetail = NonNullable<Awaited<ReturnType<typeof getCallDetail>>>;

function round(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value);
}
