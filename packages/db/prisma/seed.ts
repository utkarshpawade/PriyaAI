/**
 * Seeds the demo database.
 *
 * Idempotent: it clears the seeded tables first, so `pnpm db:seed` can be run
 * before an interview to reset the dashboard to a known-good state.
 */
import { type Prisma, PrismaClient } from '../generated/client/index.js';
import { SEED_CALLS, type SeedCall } from './seed-data.js';

const prisma = new PrismaClient();

/**
 * Normalises a typed value for a `Json` column. Prisma's `InputJsonValue` does
 * not accept arrays of interface types (they lack an index signature), and the
 * round trip is exactly what the driver does anyway.
 */
function toJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

const DEFAULT_AGENT_CONFIG = {
  label: 'v1 — shipped default',
  greetingHinglish:
    'Namaste! Main Priya bol rahi hoon, Meridian Group se. Do minute baat kar sakte hain aapse?',
  greetingHindi: 'नमस्ते! मैं प्रिया बोल रही हूँ, Meridian Group से। क्या दो मिनट बात कर सकते हैं?',
  greetingEnglish: 'Hello! This is Priya from Meridian Group. Do you have two minutes to talk?',
  persona:
    'You have six years of experience selling homes in west Pune. You listen more than you talk, you never oversell, and you would rather lose a sale than mislead someone.',
  guardrails: [] as string[],
  slotOrder: [
    'intent',
    'configuration',
    'location',
    'budget',
    'purpose',
    'timeline',
    'financing',
    'name',
    'phone',
  ],
};

async function main(): Promise<void> {
  console.log('Seeding demo data…');

  // Order matters: children before parents, because a few relations use
  // SetNull rather than Cascade and would otherwise orphan rows.
  await prisma.turn.deleteMany();
  await prisma.summary.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.siteVisit.deleteMany();
  await prisma.call.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.agentConfig.deleteMany();

  const agentConfig = await prisma.agentConfig.create({
    data: { ...DEFAULT_AGENT_CONFIG, isActive: true, createdBy: 'seed' },
  });

  for (const seed of SEED_CALLS) {
    await seedCall(seed, agentConfig.id);
  }

  const [leads, calls, turns] = await Promise.all([
    prisma.lead.count(),
    prisma.call.count(),
    prisma.turn.count(),
  ]);

  console.log(`Seeded ${leads} leads, ${calls} calls, ${turns} turns.`);
  console.log(`Active agent config: #${agentConfig.id} "${agentConfig.label}"`);
}

async function seedCall(seed: SeedCall, agentConfigId: number): Promise<void> {
  const startedAt = new Date(Date.now() - seed.minutesAgo * 60_000);
  const endedAt = new Date(startedAt.getTime() + seed.durationSec * 1_000);

  const lead = await prisma.lead.create({
    data: {
      name: seed.lead.name ?? null,
      phone: seed.lead.phone ?? null,
      email: seed.lead.email ?? null,
      intent: seed.lead.intent ?? null,
      location: seed.lead.location ?? null,
      propertyType: seed.lead.propertyType ?? null,
      configuration: seed.lead.configuration ?? null,
      budgetMin: seed.lead.budgetMin ?? null,
      budgetMax: seed.lead.budgetMax ?? null,
      purpose: seed.lead.purpose ?? null,
      timeline: seed.lead.timeline ?? null,
      financing: seed.lead.financing ?? null,
      preferredCallbackTime: seed.lead.preferredCallbackTime ?? null,
      objections: seed.lead.objections ?? [],
      score: seed.lead.score,
      temperature: seed.lead.temperature,
      status: seed.lead.status,
      source: 'voice_agent',
      createdAt: startedAt,
    },
  });

  const call = await prisma.call.create({
    data: {
      leadId: lead.id,
      transport: seed.transport,
      direction: seed.direction,
      startedAt,
      endedAt,
      durationSec: seed.durationSec,
      languageMode: seed.languageMode,
      primaryLanguage: seed.primaryLanguage,
      languageMix: toJson(languageMix(seed)),
      outcome: seed.outcome,
      providerSet: toJson({
        stt: { name: 'MockSTT', model: 'scripted-vad', mode: 'mock' },
        llm: { name: 'MockLLM', model: 'rule-based-slot-machine', mode: 'mock' },
        tts: { name: 'MockTTS', model: 'tone-generator', mode: 'mock' },
      }),
      agentConfigId,
      fromNumber: seed.transport === 'phone' ? '+912071177000' : null,
      toNumber: seed.transport === 'phone' ? `+91${seed.lead.phone ?? ''}` : null,
      createdAt: startedAt,
    },
  });

  await prisma.turn.createMany({
    data: seed.turns.map((turn, index) => ({
      callId: call.id,
      index: index + 1,
      role: turn.role,
      text: turn.text,
      language: turn.language,
      interrupted: turn.interrupted ?? false,
      toolCalls: turn.toolCalls ? toJson(turn.toolCalls) : undefined,
      sttMs: turn.sttMs ?? null,
      llmFirstTokenMs: turn.llmFirstTokenMs ?? null,
      ttsFirstByteMs: turn.ttsFirstByteMs ?? null,
      totalMs: turn.totalMs ?? null,
      createdAt: new Date(startedAt.getTime() + index * 12_000),
    })),
  });

  const structured = {
    requirements: {
      intent: seed.lead.intent ?? null,
      configuration: seed.lead.configuration ?? null,
      location: seed.lead.location ?? null,
      budget: formatBudget(seed.lead.budgetMin, seed.lead.budgetMax),
      purpose: seed.lead.purpose ?? null,
      timeline: seed.lead.timeline ?? null,
      financing: seed.lead.financing ?? null,
      name: seed.lead.name ?? null,
      phone: seed.lead.phone ?? null,
    },
    qualificationScore: seed.lead.score,
    scoreReasoning: `Seeded demo call scored ${seed.lead.score}/100.`,
    leadTemperature: seed.lead.temperature,
    keyPoints: seed.summary.keyPoints,
    objections: seed.summary.objections,
    questionsAgentCouldNotAnswer: seed.summary.questionsAgentCouldNotAnswer,
    sentiment: seed.summary.sentiment,
    nextAction: seed.summary.nextAction,
    suggestedFollowUpDate: followUpDate(seed.summary.followUpInDays),
    agentNotes: seed.summary.agentNotes,
    summaryEn: seed.summary.summaryEn,
    summaryHi: seed.summary.summaryHi,
  };

  await prisma.summary.create({
    data: {
      callId: call.id,
      structured: toJson(structured),
      textEn: seed.summary.summaryEn,
      textHi: seed.summary.summaryHi,
      qualificationScore: seed.lead.score,
      leadTemperature: seed.lead.temperature,
      sentiment: seed.summary.sentiment,
      nextAction: seed.summary.nextAction,
      suggestedFollowUpDate: structured.suggestedFollowUpDate
        ? new Date(structured.suggestedFollowUpDate)
        : null,
      generatedBy: 'template',
      createdAt: endedAt,
    },
  });

  if (seed.siteVisit) {
    const scheduledFor = new Date(Date.now() + seed.siteVisit.inDays * 86_400_000);
    scheduledFor.setHours(17, 0, 0, 0);
    await prisma.siteVisit.create({
      data: {
        leadId: lead.id,
        callId: call.id,
        scheduledFor,
        dateHint: seed.siteVisit.dateHint,
        projectSlug: seed.siteVisit.projectSlug,
        status: 'confirmed',
      },
    });
  }

  for (const question of seed.followUps ?? []) {
    await prisma.followUp.create({ data: { callId: call.id, question } });
  }
}

function languageMix(seed: SeedCall): Record<string, number> {
  const mix: Record<string, number> = {};
  for (const turn of seed.turns) {
    if (turn.role !== 'user') continue;
    mix[turn.language] = (mix[turn.language] ?? 0) + 1;
  }
  return mix;
}

function followUpDate(inDays: number | null): string | null {
  if (inDays === null) return null;
  const date = new Date();
  date.setDate(date.getDate() + inDays);
  return date.toISOString().slice(0, 10);
}

function formatBudget(min?: number, max?: number): string | null {
  if (min == null && max == null) return null;
  const label = (value: number) =>
    value >= 10_000_000 ? `₹${(value / 10_000_000).toFixed(2).replace(/\.?0+$/, '')} Cr` : `₹${Math.round(value / 100_000)} L`;
  if (min != null && max != null) return `${label(min)} – ${label(max)}`;
  return max != null ? `up to ${label(max)}` : `${label(min!)}+`;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
