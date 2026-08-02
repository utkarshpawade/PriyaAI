import Link from 'next/link';
import { ArrowRight, Database, Languages, Mic, Radio, ShieldCheck, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel, SectionHeading } from '@/components/ui/panel';

export const dynamic = 'force-static';

const CAPABILITIES = [
  {
    icon: Languages,
    title: 'Mirrors the caller',
    body: 'Detects Hindi, Hinglish or English on every turn and replies in the same register — including a mid-call switch. Hindi goes out in Devanagari with English loanwords left in Latin script, which is what makes the voice sound right.',
  },
  {
    icon: Zap,
    title: 'Interruptible',
    body: 'An energy VAD in the AudioWorklet flags speech in 60 ms. The server aborts the TTS stream and the LLM generation, flushes the client buffer, and truncates the assistant turn to only what the caller actually heard.',
  },
  {
    icon: ShieldCheck,
    title: 'Cannot invent facts',
    body: 'Every property answer comes from a zod-validated knowledge base through a tool call. An output filter rewrites or blocks guarantees, and forces "indicative" on prices and "expected" on timelines.',
  },
  {
    icon: Radio,
    title: 'One core, two transports',
    body: 'The agent consumes PCM frames and emits PCM frames plus events. The browser and Twilio Media Streams are adapters that resample at their own edge — barge-in and slot tracking are written once.',
  },
  {
    icon: Database,
    title: 'Every call is a record',
    body: 'Leads, calls, per-turn transcripts with latency breakdowns, tool traces, structured summaries in English and Hindi, and versioned agent config — all in Postgres via Prisma.',
  },
  {
    icon: Mic,
    title: 'Runs with zero API keys',
    body: 'Each provider sits behind an interface with a mock. With no credentials the browser transcribes locally, a deterministic rule-based LLM drives the flow, and the browser speaks the reply.',
  },
];

const REALITY = [
  { capability: 'Browser voice call (mic → agent → speech)', status: 'real' as const, note: 'Full duplex over WebSocket, PCM16 at 24 kHz.' },
  { capability: 'Barge-in / interruption handling', status: 'real' as const, note: 'Aborts TTS and LLM, flushes playback, truncates history.' },
  { capability: 'Language detection and mirroring', status: 'real' as const, note: 'Per-turn classifier, stored on every turn.' },
  { capability: 'Slot extraction and lead qualification', status: 'real' as const, note: 'LLM tools plus a deterministic parser backstop.' },
  { capability: 'Knowledge-base grounding and guardrails', status: 'real' as const, note: 'Tool-only facts, enforced output filter.' },
  { capability: 'Postgres persistence and dashboard', status: 'real' as const, note: 'Leads, calls, turns, summaries, exports.' },
  { capability: 'Live config editing without redeploy', status: 'real' as const, note: 'Versioned AgentConfig, hot-reloaded.' },
  { capability: 'STT / LLM / TTS providers', status: 'depends' as const, note: 'Live with keys (Deepgram, Sarvam, ElevenLabs, Gemini, OpenAI, Anthropic); mocks otherwise.' },
  { capability: 'Outbound phone calls', status: 'simulated' as const, note: 'Twilio Media Streams implemented; number not provisioned (DLT/regulatory).' },
  { capability: 'Site-visit booking', status: 'simulated' as const, note: 'Parses the date and writes a row; no calendar or CRM is contacted.' },
  { capability: 'Project inventory and pricing', status: 'simulated' as const, note: 'Two fictional projects; not a real inventory system.' },
];

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-5">
      <section className="lit -mx-5 px-5 pt-16 pb-14 sm:pt-24 sm:pb-20">
        <div className="mx-auto max-w-3xl text-center">
          <Badge tone="accent" className="mb-5">
            Hindi · Hinglish · English
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            A voice agent that qualifies real estate leads —{' '}
            <span className="text-accent">in the language they actually speak</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-ink-muted">
            Priya is a senior sales consultant for a fictional Pune developer. She picks up, mirrors
            your language, qualifies you against a real slot machine, answers only what the knowledge
            base supports, and files a structured summary when the call ends.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/demo">
              <Button size="lg">
                Start a live call <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/leads">
              <Button size="lg" variant="secondary">
                See captured leads
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-ink-faint">
            No API keys required — the demo falls back to mock providers automatically.
          </p>
        </div>
      </section>

      <section className="pb-16">
        <SectionHeading
          eyebrow="Architecture"
          title="One agent core, two transports"
          description="The single most important design decision: the agent core consumes an async stream of PCM frames and emits PCM frames plus typed events. It has no idea whether it is talking to a browser or a phone line."
        />

        <Panel className="mt-7 overflow-x-auto p-5 sm:p-7">
          <pre className="min-w-[640px] font-mono text-[11.5px] leading-[1.9] text-ink-muted sm:text-xs">
{`  Browser mic ──WebSocket (PCM16 · 24 kHz · 20 ms frames)──┐
                                                            ├──▶  Voice server (Fastify + ws)
  Twilio Media Stream ──(G.711 μ-law · 8 kHz)───────────────┘             │
                                                                          ▼
                                   ┌──────────────────────────────────────────────┐
                                   │            Agent core (packages/agent)       │
                                   │   VAD → STT → LLM (+6 tools) → guardrails    │
                                   │   → TTS · barge-in · slot state machine      │
                                   └──────────────────────────────────────────────┘
                                                    │                      │
                                    Prisma ──▶ Postgres            provider adapters
                                    Lead · Call · Turn             Deepgram · Sarvam
                                    Summary · SiteVisit            ElevenLabs · Gemini
                                    FollowUp · AgentConfig         OpenAI · Anthropic
                                                    │                 (+ mock each)
                                                    ▼
                              Next.js:  /  ·  /demo  ·  /leads  ·  /leads/[id]  ·  /admin`}
          </pre>
        </Panel>
      </section>

      <section className="pb-16">
        <SectionHeading eyebrow="Capabilities" title="What it actually does" />
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((item) => (
            <Panel key={item.title} className="p-5">
              <item.icon className="h-5 w-5 text-accent" strokeWidth={1.75} />
              <h3 className="mt-3.5 text-sm font-semibold">{item.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{item.body}</p>
            </Panel>
          ))}
        </div>
      </section>

      <section className="pb-20">
        <SectionHeading
          eyebrow="Honesty"
          title="What is real and what is simulated"
          description="Being precise about this is more useful than pretending everything is production-ready."
        />

        <Panel className="mt-7 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wider text-ink-faint uppercase">
                  <th className="px-5 py-3 font-medium">Capability</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {REALITY.map((row) => (
                  <tr key={row.capability} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-3 font-medium text-ink">{row.capability}</td>
                    <td className="px-5 py-3">
                      <Badge
                        tone={
                          row.status === 'real'
                            ? 'positive'
                            : row.status === 'depends'
                              ? 'accent'
                              : 'mock'
                        }
                      >
                        {row.status === 'real'
                          ? 'Functional'
                          : row.status === 'depends'
                            ? 'Live with keys'
                            : 'Simulated'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-ink-muted">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>
    </div>
  );
}
