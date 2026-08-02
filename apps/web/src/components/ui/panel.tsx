import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('panel', className)} {...props} />;
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        {description ? <p className="mt-1 text-xs text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PanelBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="max-w-2xl">
      {eyebrow ? (
        <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h2>
      {description ? <p className="mt-3 text-sm leading-relaxed text-ink-muted">{description}</p> : null}
    </div>
  );
}
