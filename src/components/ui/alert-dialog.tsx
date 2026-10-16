import * as React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from '@/lib/utils';

// ============================================
// AlertDialog — design system §14 (P6, P10)
// For destructive and money-moving confirmation. Unlike Dialog it refuses
// outside-click, and focus lands on Cancel, so the answer has to be given.
//
// The overlay is a second copy of dialog.tsx's rather than an import: Radix needs
// its own Primitive.Overlay child inside this Root, so a shared component cannot be
// injected. scripts/check-design.mjs allows `fixed inset-0` in both files and
// nowhere else.
// ============================================

export function AlertDialog(props: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root {...props} />;
}

export function AlertDialogTrigger(props: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger {...props} />;
}

export function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return <AlertDialogPrimitive.Action className={cn(className)} {...props} />;
}

export function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return <AlertDialogPrimitive.Cancel className={cn(className)} {...props} />;
}

export function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay
        className={cn('fixed inset-0 z-overlay bg-ink/45', 'animate-overlay-in data-[state=closed]:animate-overlay-out')}
      />
      <div className="fixed inset-0 z-modal grid place-items-center overflow-auto p-4 pointer-events-none">
        <AlertDialogPrimitive.Content
          className={cn(
            'pointer-events-auto relative w-full max-w-md rounded-card border border-hairline bg-panel shadow-overlay',
            'animate-panel-in data-[state=closed]:animate-panel-out',
            className,
          )}
          {...props}
        />
      </div>
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 p-4 pb-0', className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-hairline-soft p-4', className)}
      {...props}
    />
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn('text-title font-semibold leading-none tracking-tight text-ink', className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description className={cn('text-body text-ink-muted', className)} {...props} />;
}
