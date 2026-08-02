import { z } from 'zod';

/**
 * The post-call summary contract.
 *
 * Validated whether it came from a model or from the deterministic template, so
 * the dashboard, the CSV export and `GET /api/calls/:id/summary` all consume
 * exactly one shape.
 */
export const callSummarySchema = z.object({
  requirements: z.object({
    intent: z.string().nullable(),
    configuration: z.string().nullable(),
    location: z.string().nullable(),
    budget: z.string().nullable(),
    purpose: z.string().nullable(),
    timeline: z.string().nullable(),
    financing: z.string().nullable(),
    name: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  qualificationScore: z.number().int().min(0).max(100),
  scoreReasoning: z.string().max(1_000),
  leadTemperature: z.enum(['hot', 'warm', 'cold']),
  keyPoints: z.array(z.string().max(300)).max(8),
  objections: z.array(z.string().max(300)).max(8),
  questionsAgentCouldNotAnswer: z.array(z.string().max(300)).max(8),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  nextAction: z.string().max(400),
  /** ISO date, or null when the caller opted out. */
  suggestedFollowUpDate: z.string().nullable(),
  agentNotes: z.string().max(1_000),
  /** 4–6 lines of prose. */
  summaryEn: z.string().max(2_000),
  summaryHi: z.string().max(2_000),
});

export type CallSummary = z.infer<typeof callSummarySchema>;

/** Tolerates the fenced-JSON a model sometimes returns despite instructions. */
export function parseSummaryJson(raw: string): CallSummary | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();

  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
    const result = callSummarySchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
