import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download } from 'lucide-react';
import { getCallDetail } from '@rvagent/db';
import type { CallSummary } from '@rvagent/agent';
import { Badge, outcomeTone, temperatureTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel';
import {
  budgetLabel,
  formatDateTime,
  formatDuration,
  formatMs,
  humanise,
  languageLabel,
  outcomeLabel,
  statusLabel,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { CopyButton } from './copy-button';
import { EditableLead } from './editable-lead';

export const metadata: Metadata = { title: 'Call detail — Priya' };
export const dynamic = 'force-dynamic';

interface ToolCallRecord {
  name: string;
  detail: string;
  ok: boolean;
}

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await getCallDetail(id);
  if (!call) notFound();

  const summary = call.summary?.structured as CallSummary | undefined;
  const lead = call.lead;

  const measuredTurns = call.turns.filter((turn) => turn.ttsFirstByteMs != null);
  const medianFirstAudio = median(measuredTurns.map((turn) => turn.ttsFirstByteMs ?? 0));

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10">
      <Link
        href="/leads"
        className="inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to leads
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {lead?.name ?? 'Unnamed caller'}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <Badge tone={outcomeTone(call.outcome)}>{outcomeLabel(call.outcome)}</Badge>
            {lead ? (
              <Badge tone={temperatureTone(lead.temperature)}>{statusLabel(lead.status)}</Badge>
            ) : null}
            <Badge>{humanise(call.transport)}</Badge>
            <Badge>{languageLabel(call.primaryLanguage)}</Badge>
            <span>{formatDateTime(call.startedAt)}</span>
            <span>· {formatDuration(call.durationSec)}</span>
            <span>· {call.turns.length} turns</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Link href={`/api/calls/${call.id}/summary`} prefetch={false}>
            <Button variant="secondary" size="sm">
              <Download className="h-3.5 w-3.5" />
              Summary JSON
            </Button>
          </Link>
          <Link href={`/api/export/calls/${call.id}`} prefetch={false}>
            <Button variant="secondary" size="sm">
              <Download className="h-3.5 w-3.5" />
              Transcript CSV
            </Button>
          </Link>
        </div>
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Panel>
            <PanelHeader
              title="Transcript"
              description="With per-turn language, latency and the tools each turn invoked."
            />
            <PanelBody className="space-y-4">
              {call.turns.map((turn) => {
                const toolCalls = (turn.toolCalls as ToolCallRecord[] | null) ?? [];
                return (
                  <div key={turn.id} className="border-b border-line/50 pb-4 last:border-0 last:pb-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'text-[11px] font-semibold',
                          turn.role === 'assistant' ? 'text-accent' : 'text-ink',
                        )}
                      >
                        {turn.role === 'assistant' ? 'Priya' : 'Caller'}
                      </span>
                      <Badge className="px-2 py-0">{languageLabel(turn.language)}</Badge>
                      {turn.interrupted ? <Badge tone="negative">interrupted</Badge> : null}
                      <span className="tabular ml-auto text-[11px] text-ink-faint">
                        {turn.totalMs != null ? formatMs(turn.totalMs) : ''}
                        {turn.ttsFirstByteMs != null
                          ? ` · first audio ${formatMs(turn.ttsFirstByteMs)}`
                          : ''}
                      </span>
                    </div>

                    <p
                      className={cn(
                        'text-[13.5px] leading-relaxed text-ink-muted',
                        turn.language === 'hi' && 'devanagari',
                      )}
                      lang={turn.language === 'en' ? 'en' : 'hi'}
                    >
                      {turn.text}
                    </p>

                    {toolCalls.length > 0 ? (
                      <ul className="mt-2 space-y-1 border-l-2 border-line pl-3 font-mono text-[11px]">
                        {toolCalls.map((tool, index) => (
                          <li key={`${turn.id}-${index}`} className="flex gap-2">
                            <span className={tool.ok ? 'text-positive' : 'text-negative'}>
                              {tool.ok ? '✓' : '✕'}
                            </span>
                            <span className="text-ink-faint">{tool.detail}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </PanelBody>
          </Panel>

          {summary ? (
            <Panel>
              <PanelHeader
                title="Narrative summary"
                description={`Generated by ${call.summary?.generatedBy ?? 'template'}.`}
                actions={
                  <CopyButton
                    label="Copy"
                    value={`${summary.summaryEn}\n\n---\n\n${summary.summaryHi}`}
                  />
                }
              />
              <PanelBody className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-[11px] tracking-wider text-ink-faint uppercase">English</p>
                  <p className="text-[13px] leading-relaxed whitespace-pre-line text-ink-muted">
                    {summary.summaryEn}
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-[11px] tracking-wider text-ink-faint uppercase">हिन्दी</p>
                  <p
                    className="devanagari text-[13px] leading-relaxed whitespace-pre-line text-ink-muted"
                    lang="hi"
                  >
                    {summary.summaryHi}
                  </p>
                </div>
              </PanelBody>
            </Panel>
          ) : null}
        </div>

        <div className="space-y-5">
          {lead ? <EditableLead lead={serialiseLead(lead)} /> : null}

          {summary ? (
            <Panel>
              <PanelHeader title="Qualification" />
              <PanelBody className="space-y-4">
                <div className="flex items-baseline gap-2">
                  <span className="tabular text-3xl font-semibold text-accent">
                    {summary.qualificationScore}
                  </span>
                  <span className="text-sm text-ink-faint">/100</span>
                  <Badge tone={temperatureTone(summary.leadTemperature)} className="ml-auto">
                    {summary.leadTemperature}
                  </Badge>
                </div>
                <p className="text-xs leading-relaxed text-ink-muted">{summary.scoreReasoning}</p>

                <SummaryList title="Key points" items={summary.keyPoints} />
                <SummaryList title="Objections" items={summary.objections} />
                <SummaryList
                  title="Could not answer"
                  items={summary.questionsAgentCouldNotAnswer}
                  tone="warn"
                />

                <div className="border-t border-line pt-3">
                  <p className="mb-1 text-[11px] tracking-wider text-ink-faint uppercase">
                    Next action
                  </p>
                  <p className="text-xs leading-relaxed text-ink">{summary.nextAction}</p>
                  {summary.suggestedFollowUpDate ? (
                    <p className="mt-1.5 text-[11px] text-ink-faint">
                      Follow up by {summary.suggestedFollowUpDate}
                    </p>
                  ) : null}
                </div>
              </PanelBody>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader title="Call metrics" />
            <PanelBody className="space-y-2 text-xs">
              <Metric label="Duration" value={formatDuration(call.durationSec)} />
              <Metric label="Turns" value={String(call.turns.length)} />
              <Metric label="Median first audio" value={formatMs(medianFirstAudio)} />
              <Metric label="Requirement" value={lead?.configuration ?? '—'} />
              <Metric label="Budget" value={budgetLabel(lead?.budgetMin, lead?.budgetMax)} />
              <Metric
                label="Providers"
                value={providerLabel(call.providerSet)}
              />
              <Metric
                label="Agent config"
                value={call.agentConfig ? `#${call.agentConfig.id} ${call.agentConfig.label}` : '—'}
              />
            </PanelBody>
          </Panel>

          {call.siteVisits.length > 0 ? (
            <Panel>
              <PanelHeader title="Site visit" description="Simulated — no calendar was contacted." />
              <PanelBody className="space-y-2 text-xs">
                {call.siteVisits.map((visit) => (
                  <div key={visit.id}>
                    <p className="text-ink">{formatDateTime(visit.scheduledFor)}</p>
                    <p className="mt-0.5 text-ink-faint">
                      Caller said &ldquo;{visit.dateHint}&rdquo; · {visit.projectSlug}
                    </p>
                  </div>
                ))}
              </PanelBody>
            </Panel>
          ) : null}

          {call.followUps.length > 0 ? (
            <Panel>
              <PanelHeader title="Follow-up queue" description="Questions the KB could not answer." />
              <PanelBody>
                <ul className="space-y-1.5 text-xs text-ink-muted">
                  {call.followUps.map((followUp) => (
                    <li key={followUp.id}>• {followUp.question}</li>
                  ))}
                </ul>
              </PanelBody>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryList({
  title,
  items,
  tone,
}: {
  title: string;
  items: readonly string[];
  tone?: 'warn';
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-[11px] tracking-wider text-ink-faint uppercase">{title}</p>
      <ul className={cn('space-y-1 text-xs leading-relaxed', tone === 'warn' ? 'text-warm' : 'text-ink-muted')}>
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-faint">{label}</span>
      <span className="truncate text-right text-ink">{value}</span>
    </div>
  );
}

function providerLabel(providerSet: unknown): string {
  const set = providerSet as
    | { stt?: { name?: string }; llm?: { name?: string }; tts?: { name?: string } }
    | null;
  if (!set) return '—';
  return [set.stt?.name, set.llm?.name, set.tts?.name].filter(Boolean).join(' · ') || '—';
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Dates cannot cross the server/client boundary, so the row is flattened here. */
function serialiseLead(lead: NonNullable<Awaited<ReturnType<typeof getCallDetail>>>['lead']) {
  if (!lead) throw new Error('lead expected');
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    location: lead.location,
    configuration: lead.configuration,
    budgetMin: lead.budgetMin,
    budgetMax: lead.budgetMax,
    timeline: lead.timeline,
    status: lead.status,
    notes: lead.notes,
  };
}
