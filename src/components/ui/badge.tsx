import * as React from 'react';
import { cn } from '@/lib/utils';

// ============================================
// Badge — design system §8
// A filled pill. It conveys state by colour alone and disappears entirely in
// print, where `.print-area [class*=bg-]` is forced transparent — so it must not
// be used for student status. Use StatusIndicator (components/patterns), which
// carries dot + label + sign (P4, P8). Kept for counts, tags and metadata.
// ============================================

/** The five reserved status colours plus three neutral treatments (P3). */
export type BadgeVariant =
  | 'default'
  | 'outline'
  | 'secondary'
  | 'cleared'
  | 'dues'
  | 'credit'
  | 'struckoff'
  | 'danger';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-accent-soft text-accent border border-brand-100',
  outline: 'bg-panel text-ink-secondary border border-hairline-strong',
  secondary: 'bg-hairline-soft text-ink-secondary border border-transparent',
  cleared: 'bg-cleared-soft text-cleared border border-cleared/25',
  dues: 'bg-dues-soft text-dues border border-dues/25',
  credit: 'bg-credit-soft text-credit border border-credit/25',
  struckoff: 'bg-struckoff-soft text-struckoff border border-struckoff/25',
  danger: 'bg-danger-soft text-danger border border-danger/25',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-micro font-medium whitespace-nowrap',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
