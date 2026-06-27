import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'link' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const variantClasses: Record<string, string> = {
  default: 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-200/50 hover:shadow-md hover:shadow-blue-200/70 hover:from-blue-600 hover:to-blue-700',
  outline: 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700',
  ghost: 'hover:bg-slate-100/80 text-slate-600',
  link: 'text-blue-600 underline-offset-4 hover:underline p-0 h-auto',
  destructive: 'bg-red-500 text-white hover:bg-red-600 shadow-sm shadow-red-200/50',
};

const sizeClasses: Record<string, string> = {
  default: 'h-10 px-5 py-2 text-sm',
  sm: 'h-8 px-3.5 text-xs',
  lg: 'h-12 px-8 text-base',
  icon: 'h-10 w-10',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = 'Button';
