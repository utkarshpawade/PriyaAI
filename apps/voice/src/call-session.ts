import {
  AgentSession,
  createProviders,
  formatProviderSummary,
  generateCallSummary,
  statusForLead,
  type AgentEvent,
  type ProviderSetInstance,
} from '@rvagent/agent';
import { createCall, finalizeCall, saveSummary, syncLeadForCall } from '@rvagent/db';
import type { CallOutcome, LanguageMode, ProviderSet } from '@rvagent/shared';
import { randomUUID } from 'node:crypto';
import { agentConfigStore } from './agent-config-store.js';
import { persistenceEnabled } from './database.js';
import { logger } from './logger.js';
import { DatabaseAgentStore, toLeadSlots } from './persistence.js';

/**
 * Wires an `AgentSession` to the database and owns the call lifecycle.
 *
 * Both transports go through this: the browser handler and the Twilio handler
 * differ only in how they move audio, never in how a call is created, persisted
 * or summarised.
 */

let providers: ProviderSetInstance | null = null;
let providerSet: ProviderSet | null = null;

export function initialiseProviders(): { describe: ProviderSet; notices: string[] } {
  const selection = createProviders();
  providers = selection.providers;
  providerSet = selection.describe;

  logger.info(formatProviderSummary(selection.describe));
  for (const notice of selection.notices) logger.warn(notice);

  return { describe: selection.describe, notices: selection.notices };
}

export function activeProviderSet(): ProviderSet {
  if (!providerSet) return initialiseProviders().describe;
  return providerSet;
}

export interface StartCallOptions {
  transport: 'web' | 'phone';
  direction: 'inbound' | 'outbound';
  languageMode: LanguageMode;
  fromNumber?: string;
  toNumber?: string;
  twilioCallSid?: string;
  onEvent: (event: AgentEvent) => void;
}

export interface ActiveCall {
  callId: string;
  session: AgentSession;
  providerSet: ProviderSet;
  /** Ends the call, writes the summary, and finalises the Call row. */
  finish(outcome?: CallOutcome): Promise<void>;
}

export async function startCall(options: StartCallOptions): Promise<ActiveCall> {
  if (!providers) initialiseProviders();
  const providerInstances = providers;
  if (!providerInstances || !providerSet) throw new Error('providers not initialised');

  const config = await agentConfigStore.refresh();
  const callId = await createCallRow(options, providerSet, config.version);
  const store = new DatabaseAgentStore(callId);

  const session = new AgentSession({
    callId,
    providers: providerInstances,
    config,
    store,
    languageMode: options.languageMode,
    onEvent: options.onEvent,
  });

  let finished = false;

  const finish = async (outcome?: CallOutcome): Promise<void> => {
    if (finished) return;
    finished = true;

    const telemetry = session.telemetry();
    const resolved =
      outcome ?? (telemetry.outcome === 'in_progress' ? 'abandoned' : telemetry.outcome);
    await session.end(resolved);

    try {
      await writeCallRecords(callId, session, store, resolved);
    } catch (error) {
      logger.error({ err: error, callId }, 'failed to finalise call');
    }
  };

  return { callId, session, providerSet, finish };
}

async function createCallRow(
  options: StartCallOptions,
  set: ProviderSet,
  agentConfigId: number | null,
): Promise<string> {
  if (!persistenceEnabled()) return `local-${randomUUID()}`;

  try {
    const call = await createCall({
      transport: options.transport,
      direction: options.direction,
      languageMode: options.languageMode,
      providerSet: set,
      agentConfigId,
      fromNumber: options.fromNumber ?? null,
      toNumber: options.toNumber ?? null,
      twilioCallSid: options.twilioCallSid ?? null,
    });
    return call.id;
  } catch (error) {
    // A demo with a dead database is still a demo; the conversation continues
    // in memory and only the dashboard loses this call.
    logger.error({ err: error }, 'could not create call row, continuing without persistence');
    return `local-${randomUUID()}`;
  }
}

async function writeCallRecords(
  callId: string,
  session: AgentSession,
  store: DatabaseAgentStore,
  outcome: CallOutcome,
): Promise<void> {
  if (!persistenceEnabled() || callId.startsWith('local-')) return;

  const telemetry = session.telemetry();
  const config = agentConfigStore.get();
  const turns = store.transcript();
  const durationSec = estimateDurationSec(store);

  await finalizeCall({
    callId,
    outcome,
    primaryLanguage: telemetry.primaryLanguage,
    languageMix: store.languageMix(),
  });

  await syncLeadForCall({
    callId,
    slots: toLeadSlots(session.tracker.slots),
    score: telemetry.score.score,
    temperature: telemetry.score.temperature,
    status: statusForLead(telemetry.score, outcome),
  });

  if (!providers) return;

  const { summary, generatedBy } = await generateCallSummary(
    {
      turns,
      slots: session.tracker.slots,
      declined: session.tracker.declined,
      outcome,
      score: telemetry.score,
      unansweredQuestions: [...telemetry.unansweredQuestions, ...store.unansweredQuestions],
      projects: config.projects,
      durationSec,
    },
    providers.llm,
  );

  await saveSummary({
    callId,
    structured: summary,
    textEn: summary.summaryEn,
    textHi: summary.summaryHi,
    qualificationScore: summary.qualificationScore,
    leadTemperature: summary.leadTemperature,
    sentiment: summary.sentiment,
    nextAction: summary.nextAction,
    suggestedFollowUpDate: summary.suggestedFollowUpDate
      ? new Date(summary.suggestedFollowUpDate)
      : null,
    generatedBy,
  });

  logger.info({ callId, outcome, score: summary.qualificationScore, generatedBy }, 'call summarised');
}

/** Sum of measured turn times; close enough for a summary and needs no clock. */
function estimateDurationSec(store: DatabaseAgentStore): number {
  const totalMs = store.turns.reduce((sum, turn) => sum + (turn.latency.totalMs ?? 0), 0);
  return Math.max(1, Math.round(totalMs / 1000));
}
