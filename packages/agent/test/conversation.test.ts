import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultAgentConfig } from '../src/config.js';
import { applyGuardrails, filterAgentOutput, splitSentences } from '../src/conversation/guardrails.js';
import { buildSystemPrompt } from '../src/conversation/prompt.js';
import { scoreLead } from '../src/conversation/scoring.js';
import { QualificationTracker } from '../src/conversation/state.js';
import { findMatchingUnits, applyKbOverrides, primaryProject } from '../src/kb/index.js';
import { buildTemplateSummary } from '../src/summary/generate.js';
import { callSummarySchema, parseSummaryJson } from '../src/summary/schema.js';
import { renderCompiledPrompts } from '../scripts/compile-prompts.mjs';

describe('QualificationTracker', () => {
  it('reports the next unanswered slot in order', () => {
    const tracker = new QualificationTracker();
    expect(tracker.nextSlot()).toBe('intent');
    tracker.merge({ intent: 'buy' });
    expect(tracker.nextSlot()).toBe('configuration');
  });

  it('never re-asks a declined slot', () => {
    const tracker = new QualificationTracker();
    tracker.merge({ intent: 'buy', configuration: '2BHK', location: 'Wakad', budgetMax: 8_000_000 });
    expect(tracker.nextSlot()).toBe('purpose');
    tracker.decline('purpose');
    expect(tracker.nextSlot()).toBe('timeline');
    expect(tracker.remainingSlots()).not.toContain('purpose');
  });

  it('accepts a revision to a filled slot and reports it as one', () => {
    const tracker = new QualificationTracker();
    tracker.merge({ configuration: '2BHK', budgetMax: 7_000_000 });

    const result = tracker.merge({ configuration: '3BHK', budgetMax: 15_000_000 });

    expect(tracker.slots.configuration).toBe('3BHK');
    expect(tracker.slots.budgetMax).toBe(15_000_000);
    expect(result.changes.map((change) => change.key).sort()).toEqual(['budget', 'configuration']);
    expect(result.changes.every((change) => change.isRevision)).toBe(true);
  });

  it('reports budget as a single question even though it is two fields', () => {
    const tracker = new QualificationTracker();
    const result = tracker.merge({ budgetMin: 5_000_000, budgetMax: 6_000_000 });
    expect(result.changes.filter((change) => change.key === 'budget')).toHaveLength(1);
  });

  it('gives up on a slot the caller keeps ignoring', () => {
    const tracker = new QualificationTracker();
    expect(tracker.nextSlot()).toBe('intent');

    // Three consecutive turns where intent is still the open question.
    tracker.markAsked('intent');
    tracker.markAsked('intent');
    expect(tracker.nextSlot()).toBe('intent');

    tracker.markAsked('intent');
    expect(tracker.declined).toContain('intent');
    expect(tracker.nextSlot()).toBe('configuration');
  });

  it('does not give up on a slot that got answered', () => {
    const tracker = new QualificationTracker();
    tracker.markAsked('intent');
    tracker.merge({ intent: 'buy' });
    tracker.markAsked('intent');
    tracker.markAsked('intent');
    expect(tracker.declined).not.toContain('intent');
  });

  it('un-declines a slot when the caller volunteers it later', () => {
    const tracker = new QualificationTracker();
    tracker.decline('phone');
    tracker.merge({ phone: '9876543210' });
    expect(tracker.declined).not.toContain('phone');
  });

  it('accepts an admin-supplied slot order and backfills anything omitted', () => {
    const tracker = new QualificationTracker(undefined, ['budget', 'configuration']);
    expect(tracker.slotOrder.slice(0, 2)).toEqual(['budget', 'configuration']);
    expect(tracker.slotOrder).toContain('phone');
  });

  it('ignores an invalid patch instead of corrupting state', () => {
    const tracker = new QualificationTracker();
    tracker.merge({ intent: 'buy' });
    tracker.merge({ intent: 'lease' } as never);
    expect(tracker.slots.intent).toBe('buy');
  });
});

describe('guardrails', () => {
  it('rewrites promises of returns', () => {
    const result = applyGuardrails('This gives assured returns of 12 percent.', 'en');
    expect(result.text).not.toMatch(/assured returns/i);
    expect(result.text).toContain('returns depend on market conditions');
    expect(result.violations[0].ruleId).toBe('assured_returns');
  });

  it('blocks predictions of price movement', () => {
    const result = applyGuardrails('Buy now. The price will definitely double in three years.', 'en');
    expect(result.blocked).toBe(true);
    expect(result.text).not.toMatch(/double/i);
  });

  it('catches the Hinglish and Hindi forms too', () => {
    expect(applyGuardrails('Ye bilkul safe investment hai', 'hi-en').violations.length).toBeGreaterThan(0);
    expect(applyGuardrails('पक्का रिटर्न मिलेगा', 'hi').violations.length).toBeGreaterThan(0);
  });

  it('rejects manufactured urgency', () => {
    const result = applyGuardrails('Only 2 units left today, last chance!', 'en');
    expect(result.blocked).toBe(true);
  });

  it('appends the indicative qualifier to any quoted price', () => {
    const filtered = filterAgentOutput('The 2 BHK is 72 lakh.', 'en');
    expect(filtered.text).toMatch(/indicative/i);
  });

  it('does not double up when the qualifier is already present', () => {
    const text = 'Indicative price is 72 lakh, subject to availability.';
    expect(filterAgentOutput(text, 'en').text).toBe(text);
  });

  it('marks possession dates as expected', () => {
    expect(filterAgentOutput('Possession in December 2027.', 'en').text).toMatch(/expected/i);
  });

  it('leaves compliant copy untouched', () => {
    const text = 'The clubhouse has a lap pool and a gym.';
    const result = filterAgentOutput(text, 'en');
    expect(result.text).toBe(text);
    expect(result.violations).toHaveLength(0);
  });

  it('splits sentences on the Devanagari full stop', () => {
    expect(splitSentences('पहला वाक्य। दूसरा वाक्य।')).toHaveLength(2);
  });
});

describe('lead scoring', () => {
  const projects = defaultAgentConfig().projects;

  it('scores a complete, in-budget, urgent lead hot', () => {
    const score = scoreLead(
      {
        intent: 'buy',
        configuration: '2BHK',
        location: 'Hinjewadi',
        budgetMin: 7_000_000,
        budgetMax: 8_500_000,
        timeline: 'immediate',
        purpose: 'self_use',
        financing: 'loan',
        name: 'Rohit',
        phone: '9876543210',
        objections: [],
      },
      { projects },
    );
    expect(score.temperature).toBe('hot');
    expect(score.score).toBeGreaterThanOrEqual(70);
    expect(score.reasoning.join(' ')).toContain('Budget matches available inventory');
  });

  it('caps a disqualified caller regardless of how much they told us', () => {
    const score = scoreLead(
      {
        intent: 'buy',
        configuration: '3BHK',
        budgetMax: 15_000_000,
        timeline: 'immediate',
        name: 'X',
        phone: '9876543210',
        objections: [],
      },
      { projects, disqualified: true },
    );
    expect(score.score).toBeLessThanOrEqual(15);
    expect(score.temperature).toBe('cold');
  });

  it('penalises objections', () => {
    const base = { intent: 'buy' as const, objections: [] };
    const clean = scoreLead(base, { projects });
    const objected = scoreLead({ ...base, objections: ['too expensive', 'far'] }, { projects });
    expect(objected.score).toBeLessThan(clean.score);
  });
});

describe('knowledge base', () => {
  const projects = defaultAgentConfig().projects;

  it('returns in-budget matches when they exist', () => {
    const result = findMatchingUnits(projects, {
      configuration: '2BHK',
      budgetMax: 8_000_000,
    });
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches.every((match) => match.unit.priceInr <= 8_000_000)).toBe(true);
    expect(result.alternatives).toHaveLength(0);
  });

  it('never returns a sold or held unit as a match', () => {
    const result = findMatchingUnits(projects, { configuration: '2BHK' });
    expect(result.matches.every((match) => match.unit.status === 'available')).toBe(true);
  });

  it('falls back to nearest options with an honest instruction', () => {
    const result = findMatchingUnits(projects, { configuration: '3BHK', budgetMax: 3_000_000 });
    expect(result.matches).toHaveLength(0);
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(result.note).toMatch(/above the stated range/i);
    expect(result.alternatives[0].overshoot).toBeGreaterThan(0);
  });

  it('merges an admin override and re-validates it', () => {
    const patched = applyKbOverrides({
      'aureva-skyline': { possession: { expectedDate: 'March 2028' } },
    });
    expect(primaryProject(patched).possession.expectedDate).toBe('March 2028');
    // Untouched fields survive the merge.
    expect(primaryProject(patched).possession.expectedQuarter).toBe('Q4 2027');
  });

  it('rejects an override that would break the schema', () => {
    expect(() =>
      applyKbOverrides({ 'aureva-skyline': { scale: { towers: -1 } } }),
    ).toThrow();
  });
});

describe('system prompt', () => {
  it('substitutes every placeholder', () => {
    const config = defaultAgentConfig();
    const tracker = new QualificationTracker();
    tracker.merge({ intent: 'buy', configuration: '2BHK' });

    const prompt = buildSystemPrompt({
      config,
      languageMode: 'auto',
      language: 'hi-en',
      tracker,
    });

    expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(prompt).toContain('Aureva Skyline');
    expect(prompt).toContain('**configuration**: 2BHK');
    expect(prompt).toContain('Mirror the caller');
  });

  it('states the forced register when the operator picks one', () => {
    const prompt = buildSystemPrompt({
      config: defaultAgentConfig(),
      languageMode: 'hi',
      language: 'en',
      tracker: new QualificationTracker(),
    });
    expect(prompt).toContain('Reply only in Hindi');
  });

  it('keeps the compiled prompts in sync with the markdown source', () => {
    const compiledPath = join(import.meta.dirname, '..', 'src', 'prompts', 'compiled.ts');
    expect(readFileSync(compiledPath, 'utf8')).toBe(renderCompiledPrompts());
  });
});

describe('call summary', () => {
  const projects = defaultAgentConfig().projects;

  it('produces a schema-valid summary in both languages', () => {
    const summary = buildTemplateSummary({
      turns: [
        { role: 'assistant', text: 'Namaste', language: 'hi-en' },
        { role: 'user', text: 'Mujhe 2 BHK chahiye', language: 'hi-en' },
      ],
      slots: {
        intent: 'buy',
        configuration: '2BHK',
        location: 'Hinjewadi',
        budgetMax: 8_000_000,
        timeline: '3_months',
        name: 'Rohit',
        phone: '9876543210',
        objections: [],
      },
      declined: [],
      outcome: 'qualified',
      score: scoreLead({ intent: 'buy', objections: [] }, { projects }),
      unansweredQuestions: [],
      projects,
      durationSec: 145,
    });

    expect(callSummarySchema.safeParse(summary).success).toBe(true);
    expect(summary.summaryHi).toMatch(/[ऀ-ॿ]/);
    expect(summary.summaryEn.split('\n').length).toBeGreaterThanOrEqual(4);
    expect(summary.requirements.configuration).toBe('2BHK');
  });

  it('gives an opted-out caller no follow-up date', () => {
    const summary = buildTemplateSummary({
      turns: [],
      slots: { objections: [] },
      declined: [],
      outcome: 'not_interested',
      score: scoreLead({ objections: [] }, { projects, disqualified: true }),
      unansweredQuestions: [],
      projects,
      durationSec: 20,
    });
    expect(summary.suggestedFollowUpDate).toBeNull();
    expect(summary.nextAction).toMatch(/do-not-call/i);
  });

  it('parses a model response wrapped in a markdown fence', () => {
    const payload = buildTemplateSummary({
      turns: [],
      slots: { objections: [] },
      declined: [],
      outcome: 'qualified',
      score: scoreLead({ intent: 'buy', objections: [] }, { projects }),
      unansweredQuestions: [],
      projects,
      durationSec: 30,
    });
    const fenced = '```json\n' + JSON.stringify(payload) + '\n```';
    expect(parseSummaryJson(fenced)?.qualificationScore).toBe(payload.qualificationScore);
  });

  it('returns null for a response that is not a valid summary', () => {
    expect(parseSummaryJson('sorry, I cannot do that')).toBeNull();
    expect(parseSummaryJson('{"qualificationScore": 900}')).toBeNull();
  });
});
