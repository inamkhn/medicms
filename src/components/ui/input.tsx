import * as React from 'react';
import { cn } from '@/lib/utils';

// ============================================
// Input — design system §7
// 32px tall (h-control-md, px-exact), rounded-control, one focus outline from the
// base layer. `invalid` is the only way this component says "error": it sets both
// the class and aria-invalid so the state is never colour-only (P3, P4) and is
// readable by assistive tech.
// ============================================

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Error state. Also emitted as aria-invalid so the state is not visual only. */
  invalid?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  /** Right-aligned tabular figures — for amounts, not for text (P2). */
  num?: boolean;
}

const baseClasses =
  'flex h-control-md w-full rounded-control border border-hairline bg-panel px-3 text-body text-ink ' +
  'transition-[border-color,box-shadow] duration-120 ease-standard ' +
  'placeholder:text-ink-subtle disabled:pointer-events-none disabled:opacity-55';

const invalidClasses = 'border-danger bg-danger-soft/40 placeholder:text-danger/70';

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid = false, leadingIcon, trailingIcon, num = false, ...props }, ref) => {
    const input = (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          baseClasses,
          invalid && invalidClasses,
          num && 'num',
          // Padding only makes room when an icon is actually rendered.
          leadingIcon && 'pl-8',
          trailingIcon && 'pr-8',
          // Caller overrides come last so `className` still wins (tailwind-merge
          // knows the token groups — see lib/utils.ts).
          className,
        )}
        {...props}
      />
    );

    if (!leadingIcon && !trailingIcon) return input;

    return (
      <span className="relative flex w-full items-center">
        {leadingIcon && (
          <span className="pointer-events-none absolute left-2.5 flex items-center text-ink-subtle" aria-hidden="true">
            {leadingIcon}
          </span>
        )}
        {input}
        {trailingIcon && (
          <span className="pointer-events-none absolute right-2.5 flex items-center text-ink-subtle" aria-hidden="true">
            {trailingIcon}
          </span>
        )}
      </span>
    );
  },
);
Input.displayName = 'Input';
