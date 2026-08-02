import { NextResponse } from 'next/server';
import { z } from 'zod';
import { agentConfigFromRecord, applyKbOverrides } from '@rvagent/agent';
import { activateAgentConfig, createAgentConfigVersion, listAgentConfigs } from '@rvagent/db';
import { INTERNAL_API_TOKEN, VOICE_INTERNAL_URL } from '@/lib/env';

export const dynamic = 'force-dynamic';

const SLOT_KEYS = [
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

const configSchema = z.object({
  label: z.string().trim().min(1).max(120),
  greetingHinglish: z.string().trim().min(1).max(600),
  greetingHindi: z.string().trim().min(1).max(600),
  greetingEnglish: z.string().trim().min(1).max(600),
  persona: z.string().trim().min(1).max(2_000),
  guardrails: z.array(z.string().trim().max(400)).max(20).default([]),
  slotOrder: z.array(z.enum(SLOT_KEYS)).max(12).default([]),
  /** Sparse, slug-keyed overrides merged over the compiled knowledge base. */
  kbOverrides: z.record(z.unknown()).nullable().default(null),
});

export async function GET() {
  const versions = await listAgentConfigs();
  return NextResponse.json({ versions });
}

/**
 * Saving appends a new version, activates it, and pushes a reload to the voice
 * server so the very next call uses it — no redeploy, no restart.
 */
export async function POST(request: Request) {
  const parsed = configSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid configuration.', detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Validate the knowledge-base patch before it is ever persisted. A malformed
  // override would otherwise be loaded by the agent on the next call.
  try {
    applyKbOverrides(parsed.data.kbOverrides ?? undefined);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Knowledge base override is invalid — nothing was saved.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }

  const record = await createAgentConfigVersion({
    ...parsed.data,
    kbOverrides: parsed.data.kbOverrides ?? undefined,
  });

  // Prove the stored row compiles into a usable runtime config.
  const runtime = agentConfigFromRecord(record);
  const reload = await notifyVoiceServer();

  return NextResponse.json({
    version: record.id,
    label: record.label,
    slotOrder: runtime.slotOrder,
    projects: runtime.projects.map((project) => ({ slug: project.slug, name: project.name })),
    voiceServerReloaded: reload.ok,
    voiceServerMessage: reload.message,
  });
}

const activateSchema = z.object({ version: z.number().int().positive() });

/** Rolls back to an earlier version. */
export async function PUT(request: Request) {
  const parsed = activateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Expected { version: number }.' }, { status: 400 });
  }

  const record = await activateAgentConfig(parsed.data.version);
  const reload = await notifyVoiceServer();

  return NextResponse.json({
    version: record.id,
    label: record.label,
    voiceServerReloaded: reload.ok,
    voiceServerMessage: reload.message,
  });
}

async function notifyVoiceServer(): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(`${VOICE_INTERNAL_URL}/internal/reload-config`, {
      method: 'POST',
      headers: INTERNAL_API_TOKEN ? { authorization: `Bearer ${INTERNAL_API_TOKEN}` } : {},
      // The dashboard should not hang if the voice server is down.
      signal: AbortSignal.timeout(4_000),
    });
    return response.ok
      ? { ok: true, message: 'Voice server reloaded — the next call uses this version.' }
      : { ok: false, message: `Voice server replied ${response.status}.` };
  } catch {
    return {
      ok: false,
      message: 'Saved, but the voice server is unreachable. It will pick this up when it restarts.',
    };
  }
}
