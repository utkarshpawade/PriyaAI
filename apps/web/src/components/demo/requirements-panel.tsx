'use client';

import { Check, Minus } from 'lucide-react';
import type { QualificationSlots, SlotQuestionKey } from '@rvagent/shared';
import { Badge } from '@/components/ui/badge';
import { budgetLabel, humanise, slotLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The live slot panel.
 *
 * This is the screen that proves comprehension to an interviewer: chips fill in
 * as the agent extracts them, and a revised answer visibly overwrites the old
 * one rather than being appended.
 */

const DISPLAY_ORDER: SlotQuestionKey[] = [
  'intent',
  'configuration',
  'location',
  'budget',
  'purpose',
  'timeline',
  'financing',
  'name',
  'phone',
];

export function RequirementsPanel({
  slots,
  declined,
  completeness,
  nextSlot,
}: {
  slots: QualificationSlots;
  declined: readonly string[];
  completeness: number;
  nextSlot: string | null;
}) {
  const valueFor = (key: SlotQuestionKey): string | null => {
    if (key === 'budget') {
      return slots.budgetMin != null || slots.budgetMax != null
        ? budgetLabel(slots.budgetMin, slots.budgetMax)
        : null;
    }
    const value = slots[key];
    return value == null || String(value).length === 0 ? null : humanise(String(value));
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${Math.round(completeness * 100)}%` }}
          />
        </div>
        <span className="tabular text-xs text-ink-muted">{Math.round(completeness * 100)}%</span>
      </div>

      <ul className="space-y-1.5">
        {DISPLAY_ORDER.map((key) => {
          const value = valueFor(key);
          const isDeclined = declined.includes(key);
          const isNext = nextSlot === key;

          return (
            <li
              key={key}
              className={cn(
                'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors',
                value
                  ? 'border-accent/30 bg-accent-dim/40'
                  : isNext
                    ? 'border-accent/50 border-dashed bg-transparent'
                    : 'border-line bg-transparent',
              )}
            >
              <span className="flex items-center gap-2 text-xs text-ink-muted">
                {value ? (
                  <Check className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
                ) : isDeclined ? (
                  <Minus className="h-3.5 w-3.5 text-ink-faint" strokeWidth={2.5} />
                ) : (
                  <span
                    className={cn(
                      'h-3.5 w-3.5 rounded-full border',
                      isNext ? 'animate-pulse border-accent' : 'border-line-strong',
                    )}
                  />
                )}
                {slotLabel(key)}
              </span>

              {value ? (
                <span className="truncate text-right text-xs font-medium text-ink">{value}</span>
              ) : isDeclined ? (
                <Badge tone="mock">declined</Badge>
              ) : isNext ? (
                <span className="text-[11px] text-accent">asking next</span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {slots.objections.length > 0 ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-[11px] tracking-wider text-ink-faint uppercase">Objections</p>
          <ul className="space-y-1">
            {slots.objections.map((objection) => (
              <li key={objection} className="text-xs leading-relaxed text-ink-muted">
                • {objection}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
