import { listLeads, type LeadStatus, type LeadTemperature } from '@rvagent/db';
import { budgetLabel, toCsv } from '@/lib/format';

export const dynamic = 'force-dynamic';

const COLUMNS = [
  'name',
  'phone',
  'email',
  'intent',
  'configuration',
  'location',
  'budget',
  'purpose',
  'timeline',
  'financing',
  'status',
  'temperature',
  'score',
  'objections',
  'lastCallAt',
  'lastCallOutcome',
  'lastCallLanguage',
  'callCount',
  'createdAt',
] as const;

/** CSV export honouring whatever filters the dashboard currently has applied. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const leads = await listLeads({
    search: params.get('q') ?? undefined,
    status: (params.get('status') as LeadStatus) || undefined,
    temperature: (params.get('temperature') as LeadTemperature) || undefined,
    language: params.get('language') ?? undefined,
    minScore: params.get('minScore') ? Number(params.get('minScore')) : undefined,
    take: 1_000,
  });

  const rows = leads.map((lead) => {
    const latest = lead.calls[0];
    return {
      name: lead.name ?? '',
      phone: lead.phone ?? '',
      email: lead.email ?? '',
      intent: lead.intent ?? '',
      configuration: lead.configuration ?? '',
      location: lead.location ?? '',
      budget: budgetLabel(lead.budgetMin, lead.budgetMax),
      purpose: lead.purpose ?? '',
      timeline: lead.timeline ?? '',
      financing: lead.financing ?? '',
      status: lead.status,
      temperature: lead.temperature ?? '',
      score: lead.score,
      objections: lead.objections,
      lastCallAt: latest?.startedAt.toISOString() ?? '',
      lastCallOutcome: latest?.outcome ?? '',
      lastCallLanguage: latest?.primaryLanguage ?? '',
      callCount: lead.calls.length,
      createdAt: lead.createdAt.toISOString(),
    };
  });

  // The BOM makes Excel open UTF-8 correctly, which matters because names and
  // objections can be in Devanagari.
  return new Response(`\uFEFF${toCsv(rows, COLUMNS)}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
