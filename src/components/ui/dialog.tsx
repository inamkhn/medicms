import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================
// Dialog — design system §14 (principle P10)
// The focus trap, Escape, outside-click, aria-modal, body scroll-lock and return
// focus are all Radix's job. This file is the ONLY place besides alert-dialog that
// may contain `fixed inset-0` — scripts/check-design.mjs enforces that, because a
// hand-rolled overlay (StruckOffModal) silently ships none of the above.
// ============================================

// Wrapped as functions rather than `const Dialog = DialogPrimitive.Root` so
// react-refresh still treats this module as components-only (see select.tsx).
export function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}

export function DialogTrigger(props: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger {...props} />;
}

export function DialogClose(props: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close {...props} />;
}

/**
 * Non-blocking panel. If the action is destructive or moves money, use
 * AlertDialog / ConfirmDialog instead — the point of the alert variant is that
 * Escape and outside-click do NOT dismiss it (P6).
 */
export function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { showClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn('fixed inset-0 z-overlay bg-ink/45', 'animate-overlay-in data-[state=closed]:animate-overlay-out')}
      />
      {/* Centre with flex rather than translate(-50%): a dialog taller than the
          viewport scrolls here instead of being clipped by its own transform.
          pointer-events-none lets backdrop clicks reach the overlay so outside-click
          still dismisses, while the panel itself stays interactive. */}
      <div className="fixed inset-0 z-modal grid place-items-center overflow-auto p-4 pointer-events-none">
        <DialogPrimitive.Content
          className={cn(
            'pointer-events-auto relative w-full max-w-lg rounded-card border border-hairline bg-panel shadow-overlay',
            'animate-panel-in data-[state=closed]:animate-panel-out',
            className,
          )}
          {...props}
        >
          {children}
          {showClose && (
            <DialogPrimitive.Close className="absolute right-3 top-3 rounded-control p-1 text-ink-subtle transition-colors duration-120 hover:bg-hairline-soft hover:text-ink">
              <X size={16} aria-hidden="true" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 border-b border-hairline-soft p-4 pr-12', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-title font-semibold leading-none tracking-tight text-ink', className)}
      {...props}
    />
  );
}

/** Required in practice: Radix warns when a dialog has no description, and screen
 *  readers need the sentence that says what the panel is about to do. */
export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-body text-ink-muted', className)} {...props} />;
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 text-body text-ink-secondary', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-end gap-2 border-t border-hairline-soft p-4', className)}
      {...props}
    />
  );
}
