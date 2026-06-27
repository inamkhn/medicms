import * as React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'secondary';
}

const variantClasses: Record<string, string> = {
  default: 'bg-blue-50 text-blue-700 border-blue-100',
  outline: 'border border-slate-200 text-slate-700 bg-white',
  secondary: 'bg-slate-100 text-slate-700',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-medium', variantClasses[variant], className)}
      {...props}
    />
  );
}
