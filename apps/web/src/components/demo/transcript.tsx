'use client';

import { useEffect, useRef } from 'react';
import type { Language } from '@rvagent/shared';
import { Badge } from '@/components/ui/badge';
import { languageLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface TranscriptTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  language: Language;
  isFinal: boolean;
  interrupted: boolean;
}

export function Transcript({ turns }: { turns: readonly TranscriptTurn[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  if (turns.length === 0) {
    return (
      <div className="flex h-full min-h-64 items-center justify-center px-6 text-center">
        <p className="max-w-xs text-sm leading-relaxed text-ink-faint">
          Start the call and Priya will open in Hinglish. Speak, or type below if the microphone is
          not available.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {turns.map((turn) => (
        <div
          key={turn.id}
          className={cn('flex flex-col gap-1', turn.role === 'user' ? 'items-end' : 'items-start')}
        >
          <div className="flex items-center gap-2 px-1">
            <span className="text-[11px] font-medium text-ink-faint">
              {turn.role === 'user' ? 'Caller' : 'Priya'}
            </span>
            <Badge tone={turn.role === 'assistant' ? 'accent' : 'neutral'} className="px-2 py-0">
              {languageLabel(turn.language)}
            </Badge>
            {turn.interrupted ? <Badge tone="negative">interrupted</Badge> : null}
          </div>

          <div
            className={cn(
              'max-w-[85%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed',
              turn.role === 'user'
                ? 'rounded-br-sm bg-surface-raised text-ink'
                : 'rounded-bl-sm border border-accent/25 bg-accent-dim/50 text-ink',
              !turn.isFinal && 'opacity-60',
              turn.language === 'hi' && 'devanagari',
            )}
            lang={turn.language === 'en' ? 'en' : 'hi'}
          >
            {turn.text}
            {!turn.isFinal ? <span className="ml-1 animate-pulse text-accent">▍</span> : null}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

export interface ToolTraceEntry {
  id: string;
  name: string;
  detail: string;
  ok: boolean;
}

export function ToolTrace({ entries }: { entries: readonly ToolTraceEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-ink-faint">No tools called yet.</p>;
  }

  return (
    <ul className="space-y-1.5 font-mono text-[11px]">
      {entries.slice(-8).map((entry) => (
        <li key={entry.id} className="flex items-start gap-2">
          <span className={entry.ok ? 'text-positive' : 'text-negative'}>{entry.ok ? '✓' : '✕'}</span>
          <span className="text-ink-muted">{entry.detail}</span>
        </li>
      ))}
    </ul>
  );
}
