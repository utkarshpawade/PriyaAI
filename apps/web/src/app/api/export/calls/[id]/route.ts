import { getCallDetail } from '@rvagent/db';
import { toCsv } from '@/lib/format';

export const dynamic = 'force-dynamic';

const COLUMNS = [
  'index',
  'role',
  'language',
  'text',
  'interrupted',
  'tools',
  'sttMs',
  'llmFirstTokenMs',
  'ttsFirstByteMs',
  'totalMs',
  'timestamp',
] as const;

interface ToolCallRecord {
  detail: string;
}

/** Full transcript with the latency breakdown, for offline analysis. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const call = await getCallDetail(id);

  if (!call) {
    return new Response('Call not found.', { status: 404 });
  }

  const rows = call.turns.map((turn) => ({
    index: turn.index,
    role: turn.role,
    language: turn.language,
    text: turn.text,
    interrupted: turn.interrupted ? 'yes' : 'no',
    tools: ((turn.toolCalls as ToolCallRecord[] | null) ?? []).map((tool) => tool.detail).join(' | '),
    sttMs: turn.sttMs ?? '',
    llmFirstTokenMs: turn.llmFirstTokenMs ?? '',
    ttsFirstByteMs: turn.ttsFirstByteMs ?? '',
    totalMs: turn.totalMs ?? '',
    timestamp: turn.createdAt.toISOString(),
  }));

  return new Response(`\uFEFF${toCsv(rows, COLUMNS)}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="call-${id}-transcript.csv"`,
    },
  });
}
