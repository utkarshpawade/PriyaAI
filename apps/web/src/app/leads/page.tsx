import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { listLeads, type LeadStatus, type LeadTemperature } from '@rvagent/db';
import { Badge, temperatureTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel, SectionHeading } from '@/components/ui/panel';
import {
  budgetLabel,
  formatDuration,
  formatRelative,
  humanise,
  languageLabel,
  outcomeLabel,
  statusLabel,
} from '@/lib/format';
import { LeadFilters } from './filters';

export const metadata: Metadata = { title: 'Leads — Priya' };
export const dynamic = 'force-dynamic';

const STATUSES: LeadStatus[] = [
  'new_lead',
  'qualified',
  'unqualified',
  'callback_scheduled',
  'site_visit_scheduled',
  'do_not_call',
];
const TEMPERATURES: LeadTemperature[] = ['hot', 'warm', 'cold'];

interface SearchParams {
  q?: string;
  status?: string;
  temperature?: string;
  language?: string;
  minScore?: string;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const leads = await listLeads({
    search: params.q || undefined,
    status: STATUSES.includes(params.status as LeadStatus) ? (params.status as LeadStatus) : undefined,
    temperature: TEMPERATURES.includes(params.temperature as LeadTemperature)
      ? (params.temperature as LeadTemperature)
      : undefined,
    language: params.language || undefined,
    minScore: params.minScore ? Number(params.minScore) : undefined,
  });

  const exportQuery = new URLSearchParams(
    Object.entries(params).filter(([, value]) => Boolean(value)) as [string, string][],
  ).toString();

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading
          eyebrow="Pipeline"
          title="Leads"
          description="Every lead the agent captured, scored by the same transparent model the dashboard shows."
        />
        <Link href={`/api/export/leads?${exportQuery}`} prefetch={false}>
          <Button variant="secondary" size="sm">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </Link>
      </div>

      <LeadFilters
        statuses={STATUSES}
        temperatures={TEMPERATURES}
        initial={{
          q: params.q ?? '',
          status: params.status ?? '',
          temperature: params.temperature ?? '',
          language: params.language ?? '',
          minScore: params.minScore ?? '',
        }}
      />

      <Panel className="mt-5 overflow-hidden">
        {leads.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-sm text-ink-muted">No leads match these filters.</p>
            <p className="mt-2 text-xs text-ink-faint">
              Run <code className="font-mono text-accent">pnpm db:seed</code> to load the demo data,
              or take a call on the demo page.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wider text-ink-faint uppercase">
                  <th className="px-5 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Requirement</th>
                  <th className="px-4 py-3 font-medium">Budget</th>
                  <th className="px-4 py-3 font-medium">Language</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Score</th>
                  <th className="px-5 py-3 text-right font-medium">Last call</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const latestCall = lead.calls[0];
                  return (
                    <tr
                      key={lead.id}
                      className="group border-b border-line/60 transition-colors last:border-0 hover:bg-surface-raised"
                    >
                      <td className="px-5 py-3">
                        {latestCall ? (
                          <Link href={`/leads/${latestCall.id}`} className="block">
                            <p className="font-medium text-ink group-hover:text-accent">
                              {lead.name ?? 'Unnamed caller'}
                            </p>
                            <p className="tabular mt-0.5 text-xs text-ink-faint">
                              {lead.phone ?? 'no number captured'}
                            </p>
                          </Link>
                        ) : (
                          <p className="font-medium text-ink">{lead.name ?? 'Unnamed caller'}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        <span className="text-ink">{lead.configuration ?? '—'}</span>
                        {lead.location ? (
                          <span className="text-xs"> · {lead.location}</span>
                        ) : null}
                      </td>
                      <td className="tabular px-4 py-3 text-ink-muted">
                        {budgetLabel(lead.budgetMin, lead.budgetMax)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge>{languageLabel(latestCall?.primaryLanguage)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={temperatureTone(lead.temperature)}>
                            {statusLabel(lead.status)}
                          </Badge>
                          {latestCall ? (
                            <span className="text-[11px] text-ink-faint">
                              {outcomeLabel(latestCall.outcome)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="tabular px-4 py-3 text-right font-medium">
                        <span
                          className={
                            lead.score >= 70
                              ? 'text-hot'
                              : lead.score >= 40
                                ? 'text-warm'
                                : 'text-ink-muted'
                          }
                        >
                          {lead.score}
                        </span>
                        <span className="text-xs text-ink-faint">/100</span>
                      </td>
                      <td className="px-5 py-3 text-right text-xs text-ink-muted">
                        {latestCall ? (
                          <>
                            <span>{formatRelative(latestCall.startedAt)}</span>
                            <span className="block text-ink-faint">
                              {formatDuration(latestCall.durationSec)} ·{' '}
                              {humanise(latestCall.transport)}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="mt-3 text-xs text-ink-faint">
        Showing {leads.length} lead{leads.length === 1 ? '' : 's'}.
      </p>
    </div>
  );
}
