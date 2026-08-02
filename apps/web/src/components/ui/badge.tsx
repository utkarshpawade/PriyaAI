import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badge = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-line-strong bg-surface-raised text-ink-muted',
        accent: 'border-accent/40 bg-accent-dim text-accent-strong',
        hot: 'border-hot/40 bg-hot/10 text-hot',
        warm: 'border-warm/40 bg-warm/10 text-warm',
        cold: 'border-cold/40 bg-cold/10 text-cold',
        positive: 'border-positive/40 bg-positive/10 text-positive',
        negative: 'border-negative/40 bg-negative/10 text-negative',
        /** Marks anything simulated, so nothing is mistaken for live data. */
        mock: 'border-dashed border-ink-faint/60 bg-transparent text-ink-faint',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}

export function temperatureTone(temperature: string | null | undefined) {
  if (temperature === 'hot') return 'hot' as const;
  if (temperature === 'warm') return 'warm' as const;
  if (temperature === 'cold') return 'cold' as const;
  return 'neutral' as const;
}

export function outcomeTone(outcome: string) {
  if (outcome === 'qualified') return 'positive' as const;
  if (outcome === 'not_interested' || outcome === 'wrong_number') return 'negative' as const;
  if (outcome === 'callback_requested') return 'accent' as const;
  return 'neutral' as const;
}
