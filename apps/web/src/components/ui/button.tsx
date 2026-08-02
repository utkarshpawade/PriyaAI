import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-canvas hover:bg-accent-strong',
        secondary: 'bg-surface-raised text-ink border border-line-strong hover:border-accent/60',
        ghost: 'text-ink-muted hover:bg-surface-raised hover:text-ink',
        danger: 'bg-negative/15 text-negative border border-negative/40 hover:bg-negative/25',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}
