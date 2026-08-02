'use client';

import type { ProviderSet, TurnLatency } from '@rvagent/shared';
import { FIRST_AUDIO_TARGET_MS } from '@rvagent/shared';
import { Badge } from '@/components/ui/badge';
import { formatMs } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Per-turn latency breakdown.
 *
 * Surfaced in the demo rather than buried in logs because "how fast is it, and
 * where does the time go" is the first question anyone asks about a voice agent.
 */
export function LatencyReadout({ latency }: { latency: TurnLatency | null }) {
  const rows: Array<{ label: string; value: number | null; hint: string }> = [
    { label: 'STT', value: latency?.sttMs ?? null, hint: 'End of speech → final transcript (includes the endpoint hold)' },
    { label: 'LLM', value: latency?.llmFirstTokenMs ?? null, hint: 'Turn start → first token or tool call' },
    { label: 'TTS', value: latency?.ttsFirstByteMs ?? null, hint: 'Turn start → first audio byte' },
    { label: 'Total', value: latency?.totalMs ?? null, hint: 'Turn start → reply finished' },
  ];

  const firstAudio = latency?.ttsFirstByteMs ?? null;
  const withinTarget = firstAudio != null && firstAudio <= FIRST_AUDIO_TARGET_MS;

  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {rows.map((row) => (
          <div key={row.label} title={row.hint} className="rounded-lg bg-canvas px-2.5 py-2">
            <p className="text-[10px] tracking-wider text-ink-faint uppercase">{row.label}</p>
            <p
              className={cn(
                'tabular mt-0.5 text-sm font-medium',
                row.label === 'TTS' && firstAudio != null
                  ? withinTarget
                    ? 'text-positive'
                    : 'text-warm'
                  : 'text-ink',
              )}
            >
              {formatMs(row.value)}
            </p>
          </div>
        ))}
      </div>
      {firstAudio != null ? (
        <p className="mt-2 text-[11px] text-ink-faint">
          First audio target is {FIRST_AUDIO_TARGET_MS} ms — this turn was{' '}
          <span className={withinTarget ? 'text-positive' : 'text-warm'}>
            {withinTarget ? 'inside' : 'over'}
          </span>{' '}
          it.
        </p>
      ) : null}
    </div>
  );
}

export function ProviderBadges({ providers }: { providers: ProviderSet | null }) {
  if (!providers) {
    return <Badge tone="mock">providers unknown</Badge>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {(['stt', 'llm', 'tts'] as const).map((kind) => {
        const provider = providers[kind];
        return (
          <Badge
            key={kind}
            tone={provider.mode === 'live' ? 'positive' : provider.mode === 'browser' ? 'accent' : 'mock'}
            title={`${provider.name} · ${provider.model}`}
          >
            {kind.toUpperCase()} {provider.name}
          </Badge>
        );
      })}
    </div>
  );
}
