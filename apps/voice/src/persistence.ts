import type { AgentStore, LeadScore, RecordedTurn } from '@rvagent/agent';
import { statusForLead } from '@rvagent/agent';
import {
  createSiteVisit,
  recordFollowUp,
  recordTurn,
  syncLeadForCall,
  type LeadSlotValues,
} from '@rvagent/db';
import type { CallOutcome, Language, QualificationSlots, SlotQuestionKey } from '@rvagent/shared';
import { persistenceEnabled } from './database.js';
import { logger } from './logger.js';

/**
 * Prisma-backed implementation of the agent's persistence port.
 *
 * Two properties matter here. Writes are fire-and-forget-safe: a database blip
 * logs and moves on rather than breaking a live call, because dropping a turn
 * row is far cheaper than dropping the conversation. And every turn is also
 * buffered in memory, so the post-call summarizer has the full transcript even
 * if some writes failed.
 */
export class DatabaseAgentStore implements AgentStore {
  readonly turns: RecordedTurn[] = [];
  readonly unansweredQuestions: string[] = [];
  latestScore: LeadScore | null = null;

  constructor(private readonly callId: string) {}

  async onRequirementsUpdated(payload: {
    slots: QualificationSlots;
    declined: readonly SlotQuestionKey[];
    score: LeadScore;
  }): Promise<void> {
    this.latestScore = payload.score;
    if (!persistenceEnabled()) return;

    await this.guard('syncLead', async () => {
      await syncLeadForCall({
        callId: this.callId,
        slots: toLeadSlots(payload.slots),
        score: payload.score.score,
        temperature: payload.score.temperature,
        status: statusForLead(payload.score, 'in_progress'),
      });
    });
  }

  async onSiteVisitScheduled(payload: {
    scheduledFor: Date;
    dateHint: string;
    projectSlug: string;
  }): Promise<void> {
    if (!persistenceEnabled()) return;
    await this.guard('createSiteVisit', async () => {
      await createSiteVisit({ callId: this.callId, ...payload });
    });
  }

  async onUnansweredQuestion(question: string): Promise<void> {
    this.unansweredQuestions.push(question);
    if (!persistenceEnabled()) return;
    await this.guard('recordFollowUp', () => recordFollowUp(this.callId, question).then(() => undefined));
  }

  async onTurn(turn: RecordedTurn): Promise<void> {
    this.turns.push(turn);
    if (!persistenceEnabled()) return;

    await this.guard('recordTurn', async () => {
      await recordTurn({
        callId: this.callId,
        index: turn.index,
        role: turn.role,
        text: turn.text,
        language: turn.language,
        interrupted: turn.interrupted,
        toolCalls: turn.toolCalls.length > 0 ? turn.toolCalls : undefined,
        sttMs: turn.latency.sttMs,
        llmFirstTokenMs: turn.latency.llmFirstTokenMs,
        ttsFirstByteMs: turn.latency.ttsFirstByteMs,
        totalMs: turn.latency.totalMs,
      });
    });
  }

  /** The transcript in the shape the summarizer wants. */
  transcript(): Array<{ role: 'user' | 'assistant'; text: string; language: Language }> {
    return this.turns
      .filter((turn) => turn.text.trim().length > 0)
      .map((turn) => ({ role: turn.role, text: turn.text, language: turn.language }));
  }

  languageMix(): Record<string, number> {
    const mix: Record<string, number> = {};
    for (const turn of this.turns) {
      if (turn.role !== 'user') continue;
      mix[turn.language] = (mix[turn.language] ?? 0) + 1;
    }
    return mix;
  }

  private async guard(operation: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      logger.error({ err: error, callId: this.callId, operation }, 'persistence write failed');
    }
  }
}

export function toLeadSlots(slots: QualificationSlots): LeadSlotValues {
  return {
    name: slots.name ?? null,
    phone: slots.phone ?? null,
    email: slots.email ?? null,
    intent: slots.intent ?? null,
    location: slots.location ?? null,
    propertyType: slots.propertyType ?? null,
    configuration: slots.configuration ?? null,
    budgetMin: slots.budgetMin ?? null,
    budgetMax: slots.budgetMax ?? null,
    purpose: slots.purpose ?? null,
    timeline: slots.timeline ?? null,
    financing: slots.financing ?? null,
    preferredCallbackTime: slots.preferredCallbackTime ?? null,
    objections: slots.objections,
  };
}

export type { CallOutcome };
