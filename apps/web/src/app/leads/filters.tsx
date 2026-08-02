'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { statusLabel } from '@/lib/format';

interface FilterState {
  q: string;
  status: string;
  temperature: string;
  language: string;
  minScore: string;
}

export function LeadFilters({
  statuses,
  temperatures,
  initial,
}: {
  statuses: readonly string[];
  temperatures: readonly string[];
  initial: FilterState;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<FilterState>(initial);

  const apply = useCallback(
    (next: FilterState) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(next)) {
        if (value) params.set(key, value);
      }
      router.push(params.toString() ? `/leads?${params}` : '/leads');
    },
    [router],
  );

  const update = useCallback(
    (patch: Partial<FilterState>) => {
      const next = { ...state, ...patch };
      setState(next);
      // Text search waits for submit; dropdowns apply immediately, which is
      // what people expect from a filter bar.
      if (!('q' in patch)) apply(next);
    },
    [apply, state],
  );

  const hasFilters = searchParams.toString().length > 0;

  return (
    <Panel className="mt-6 p-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          apply(state);
        }}
      >
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={state.q}
            onChange={(event) => update({ q: event.target.value })}
            placeholder="Search name, phone, email or locality"
            className="pl-9"
            aria-label="Search leads"
          />
        </div>

        <Select
          value={state.status}
          onChange={(event) => update({ status: event.target.value })}
          className="w-auto"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {statusLabel(status)}
            </option>
          ))}
        </Select>

        <Select
          value={state.temperature}
          onChange={(event) => update({ temperature: event.target.value })}
          className="w-auto"
          aria-label="Filter by temperature"
        >
          <option value="">Any temperature</option>
          {temperatures.map((temperature) => (
            <option key={temperature} value={temperature}>
              {temperature}
            </option>
          ))}
        </Select>

        <Select
          value={state.language}
          onChange={(event) => update({ language: event.target.value })}
          className="w-auto"
          aria-label="Filter by language"
        >
          <option value="">Any language</option>
          <option value="hi">Hindi</option>
          <option value="hi-en">Hinglish</option>
          <option value="en">English</option>
        </Select>

        <Select
          value={state.minScore}
          onChange={(event) => update({ minScore: event.target.value })}
          className="w-auto"
          aria-label="Filter by minimum score"
        >
          <option value="">Any score</option>
          <option value="70">70+ (hot)</option>
          <option value="40">40+ (warm)</option>
        </Select>

        <Button type="submit" size="md">
          Search
        </Button>

        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => {
              const cleared = { q: '', status: '', temperature: '', language: '', minScore: '' };
              setState(cleared);
              apply(cleared);
            }}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        ) : null}
      </form>
    </Panel>
  );
}
