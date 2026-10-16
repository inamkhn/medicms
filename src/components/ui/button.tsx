import * as React from 'react';
import * as SlotPrimitive from '@radix-ui/react-slot';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Button — design system §5 (docs/DESIGN_SYSTEM.md)
// No gradient, no blue ring: one focus outline (index.css base layer), three
// elevations, and heights that are physically exact because the root is 13px.
// ============================================

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'subtle' | 'destructive' | 'link';
  /** sm 28px · md 32px (the default) · lg 40px · icon 32x32. P1: never 44px. */
  size?: 'sm' | 'md' | 'lg' | 'icon';
  /**
   * Render the child element instead of a <button>, merging these props onto it.
   * Use for Link / anchor actions: `<Button asChild><Link to="…">`. Wrapping a
   * Link in a <button> produces invalid nested-interactive DOM, which is why
   * pages currently hand-roll `className="h-7"` button-looking-links.
   */
  asChild?: boolean;
  /**
   * Sets aria-busy and blocks the click. With `asChild` only aria-busy is applied:
   * Slot accepts exactly one child, so a spinner cannot be inserted beside it.
   */
  loading?: boolean;
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  default: 'bg-accent text-white shadow-card hover:bg-accent-hover active:bg-brand-800',
  outline: 'border border-hairline-strong bg-panel text-ink-secondary hover:bg-hairline-soft hover:text-ink',
  ghost: 'text-ink-muted hover:bg-hairline-soft hover:text-ink',
  subtle: 'bg-accent-soft text-accent hover:bg-brand-100',
  // Red means "this destroys or spends money" and nothing else (P3).
  destructive: 'bg-danger text-white shadow-card hover:bg-danger-hover',
  link: 'h-auto p-0 text-accent underline-offset-4 hover:underline',
};

// `h-control-*` are px-exact utilities, not scale steps — see index.css. They are
// registered in tailwind-merge's height group so a caller's `h-7` still wins.
const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-control-sm px-3 text-micro gap-1',
  md: 'h-control-md px-4 text-body gap-1.5',
  lg: 'h-control-lg px-6 text-ui gap-2',
  icon: 'h-control-md w-[32px] px-0',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'default', size = 'md', asChild = false, loading = false, type, disabled, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? SlotPrimitive.Root : 'button';
    return (
      <Comp
        ref={ref}
        // Default to type="button": an untyped <button> inside a <form> submits it.
        // Call sites that genuinely submit pass type="submit" explicitly.
        type={asChild ? undefined : (type ?? 'button')}
        aria-busy={loading || undefined}
        // `disabled` is not a valid attribute on an <a>, so an asChild button signals
        // the state with aria-disabled only — enforcement stays with the route/gate.
        aria-disabled={asChild && (disabled || loading) ? true : undefined}
        disabled={asChild ? undefined : disabled || loading}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-control font-medium',
          'transition-[background-color,border-color,color,box-shadow] duration-120 ease-standard',
          'cursor-pointer select-none disabled:pointer-events-none disabled:opacity-55',
          // An asChild button cannot be `disabled`, so aria-disabled must render the
          // same treatment — otherwise a blocked link looks clickable.
          'aria-disabled:pointer-events-none aria-disabled:opacity-55',
          sizeClasses[size],
          variantClasses[variant],
          className,
        )}
        {...props}
      >
        {loading && !asChild && (
          <LoaderCircle size={size === 'lg' ? 16 : 14} className="animate-spin" aria-hidden="true" />
        )}
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
