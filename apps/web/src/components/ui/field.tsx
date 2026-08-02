import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:border-accent focus:outline-none disabled:opacity-50';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1.5 block text-xs font-medium text-ink-muted', className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-24 resize-y leading-relaxed', className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, 'cursor-pointer', className)} {...props} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint ? <p className="mt-1.5 text-[11px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}
