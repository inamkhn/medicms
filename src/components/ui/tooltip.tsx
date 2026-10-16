import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

// ============================================
// Tooltip — design system §12, and the mechanism behind P5
// P5 is "never disable a control without saying why". A tooltip is the only place a
// reason can live without a second dialog, but it has a trap: a disabled <button>
// fires no pointer events, so a tooltip attached to the disabled thing can never open.
// DisableHint below is the wrapper that makes the rule actually work.
// ============================================

/** Mount once, above the tree (beside Toaster and ConfirmDialogHost). */
export function TooltipProvider({ delayDuration = 300, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

export function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props} />;
}

export function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger {...props} />;
}

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // z-tooltip(80): a tooltip has to be able to explain a disabled control that
        // sits inside a dialog, so it must clear the modal layer rather than hide under it.
        'z-tooltip pointer-events-none max-w-[16rem] rounded-control bg-ink px-2 py-1.5',
        'text-meta leading-snug text-panel shadow-raised',
        // Radix reports two open states, not one: delayed-open on hover, instant-open
        // when a keyboard user focuses the trigger. Covering only the first would leave
        // the keyboard path popping in unanimated.
        'data-[state=delayed-open]:animate-panel-in data-[state=instant-open]:animate-panel-in',
        'data-[state=closed]:animate-panel-out',
        className,
      )}
      {...props}
    >
      {children}
      <TooltipPrimitive.Arrow className="fill-ink" />
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export interface DisableHintProps {
  disabled: boolean;
  /** The reason. No reason, no tooltip — an unexplained disabled control is the bug. */
  reason?: React.ReactNode;
  side?: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>['side'];
  children: React.ReactNode;
}

/**
 * Wrap a control that can be disabled. When it is, the reason is reachable by hover
 * *and* by keyboard; otherwise the child renders untouched, so the common case costs no
 * extra DOM.
 */
export function DisableHint({ disabled, reason, side = 'top', children }: DisableHintProps) {
  if (!disabled || !reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* tabIndex is what lets a keyboard user reach the explanation at all: the
            disabled button inside is not focusable. cursor-not-allowed lives here for
            the same reason — the button swallows its own pointer styling. */}
        <span tabIndex={0} className="inline-flex cursor-not-allowed rounded-control">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side}>{reason}</TooltipContent>
    </Tooltip>
  );
}
