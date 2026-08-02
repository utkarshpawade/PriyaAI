import type { QualificationSlots } from '@rvagent/shared';
import { defaultAgentConfig } from '../src/config.js';
import type { GuardrailViolation } from '../src/conversation/guardrails.js';
import type { AgentEvent } from '../src/orchestrator/events.js';
import { AgentSession } from '../src/orchestrator/session.js';
import { MockLlmProvider } from '../src/providers/mock/llm.js';
import { MockSttProvider } from '../src/providers/mock/stt.js';
import { MockTtsProvider } from '../src/providers/mock/tts.js';
import type { AgentStore } from '../src/tools/executor.js';
import { generateCallSummary } from '../src/summary/generate.js';
import type { Scenario, ScenarioExpectation } from './scenarios.js';

export interface ScenarioFailure {
  check: string;
  expected: string;
  actual: string;
}

export interface ScenarioResult {
  scenario: Scenario;
  passed: boolean;
  failures: ScenarioFailure[];
  slots: QualificationSlots;
  outcome: string;
  score: number;
  toolsCalled: string[];
  agentSpeech: string;
  turnCount: number;
  guardrailViolations: GuardrailViolation[];
  durationMs: number;
}

/** Records everything the session persists, without touching a database. */
class RecordingStore implements AgentStore {
  readonly siteVisits: Array<{ dateHint: string; scheduledFor: Date }> = [];
  readonly unanswered: string[] = [];
  readonly turns: Array<{ role: string; text: string }> = [];

  async onRequirementsUpdated(): Promise<void> {}

  async onSiteVisitScheduled(payload: { scheduledFor: Date; dateHint: string }): Promise<void> {
    this.siteVisits.push(payload);
  }

  async onUnansweredQuestion(question: string): Promise<void> {
    this.unanswered.push(question);
  }

  async onTurn(turn: { role: 'user' | 'assistant'; text: string }): Promise<void> {
    this.turns.push({ role: turn.role, text: turn.text });
  }
}

export async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const startedAt = performance.now();
  const store = new RecordingStore();
  const toolsCalled: string[] = [];
  const agentUtterances: string[] = [];

  const session = new AgentSession({
    callId: `eval-${scenario.id}`,
    providers: {
      stt: new MockSttProvider(),
      llm: new MockLlmProvider(),
      // Real-time pacing would make a 16-scenario run take minutes.
      tts: new MockTtsProvider({ realtime: false, silent: true }),
    },
    config: defaultAgentConfig(),
    store,
    languageMode: scenario.languageMode,
    enableIdleTimers: scenario.simulateSilence === true,
    idleTimeoutMs: 40,
    onEvent: (event: AgentEvent) => {
      if (event.type === 'tool_call') toolsCalled.push(event.name);
      if (event.type === 'transcript' && event.role === 'assistant' && event.isFinal) {
        agentUtterances.push(event.text);
      }
    },
  });

  await session.start();

  for (const turn of scenario.turns) {
    if (session.isEnded) break;
    await session.pushText(turn);
  }

  if (scenario.simulateSilence) {
    await waitForEnd(session, 2_000);
  }

  if (!session.isEnded) await session.end('abandoned', 'Eval run finished.');

  const telemetry = session.telemetry();
  const slots = session.tracker.slots;
  const agentSpeech = agentUtterances.join(' \n ');

  // Exercise the summarizer on every scenario so a schema regression is caught
  // by the eval rather than in the dashboard.
  const summary = await generateCallSummary(
    {
      turns: store.turns
        .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
        .map((turn) => ({
          role: turn.role as 'user' | 'assistant',
          text: turn.text,
          language: 'hi-en' as const,
        })),
      slots,
      declined: session.tracker.declined,
      outcome: telemetry.outcome,
      score: telemetry.score,
      unansweredQuestions: store.unanswered,
      projects: defaultAgentConfig().projects,
      durationSec: 60,
    },
    new MockLlmProvider(),
  );

  const failures = checkExpectations(scenario.expect, {
    slots,
    outcome: telemetry.outcome,
    score: telemetry.score.score,
    toolsCalled,
    agentSpeech,
    guardrailViolations: telemetry.guardrailViolations,
    declined: [...session.tracker.declined],
    summaryOk: summary.summary.summaryEn.length > 0 && summary.summary.summaryHi.length > 0,
  });

  return {
    scenario,
    passed: failures.length === 0,
    failures,
    slots,
    outcome: telemetry.outcome,
    score: telemetry.score.score,
    toolsCalled: [...new Set(toolsCalled)],
    agentSpeech,
    turnCount: telemetry.turnCount,
    guardrailViolations: telemetry.guardrailViolations,
    durationMs: performance.now() - startedAt,
  };
}

interface ObservedRun {
  slots: QualificationSlots;
  outcome: string;
  score: number;
  toolsCalled: string[];
  agentSpeech: string;
  guardrailViolations: GuardrailViolation[];
  declined: string[];
  summaryOk: boolean;
}

function checkExpectations(
  expected: ScenarioExpectation,
  observed: ObservedRun,
): ScenarioFailure[] {
  const failures: ScenarioFailure[] = [];
  const speech = observed.agentSpeech.toLowerCase();

  for (const [key, value] of Object.entries(expected.slots ?? {})) {
    const actual = observed.slots[key as keyof QualificationSlots];
    if (actual !== value) {
      failures.push({ check: `slot.${key}`, expected: String(value), actual: String(actual) });
    }
  }

  if (expected.outcome && observed.outcome !== expected.outcome) {
    failures.push({ check: 'outcome', expected: expected.outcome, actual: observed.outcome });
  }

  for (const tool of expected.toolsCalled ?? []) {
    if (!observed.toolsCalled.includes(tool)) {
      failures.push({ check: `tool.${tool}`, expected: 'called', actual: 'never called' });
    }
  }

  for (const phrase of expected.agentSays ?? []) {
    if (!speech.includes(phrase.toLowerCase())) {
      failures.push({ check: 'agentSays', expected: phrase, actual: 'not spoken' });
    }
  }

  for (const phrase of expected.agentNeverSays ?? []) {
    if (speech.includes(phrase.toLowerCase())) {
      failures.push({ check: 'agentNeverSays', expected: `never "${phrase}"`, actual: 'spoken' });
    }
  }

  if (expected.minScore != null && observed.score < expected.minScore) {
    failures.push({ check: 'minScore', expected: `>= ${expected.minScore}`, actual: String(observed.score) });
  }
  if (expected.maxScore != null && observed.score > expected.maxScore) {
    failures.push({ check: 'maxScore', expected: `<= ${expected.maxScore}`, actual: String(observed.score) });
  }

  for (const slot of expected.declined ?? []) {
    if (!observed.declined.includes(slot)) {
      failures.push({ check: `declined.${slot}`, expected: 'declined', actual: 'not declined' });
    }
  }

  // Guardrails are non-negotiable and checked on every scenario.
  const blocking = observed.guardrailViolations.filter((violation) => violation.severity === 'block');
  if (blocking.length > 0) {
    failures.push({
      check: 'guardrails',
      expected: 'no blocking violations',
      actual: blocking.map((violation) => violation.ruleId).join(', '),
    });
  }

  if (!observed.summaryOk) {
    failures.push({ check: 'summary', expected: 'EN + HI summary produced', actual: 'missing' });
  }

  return failures;
}

function waitForEnd(session: AgentSession, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const poll = setInterval(() => {
      if (session.isEnded || Date.now() - startedAt > timeoutMs) {
        clearInterval(poll);
        resolve();
      }
    }, 10);
  });
}
