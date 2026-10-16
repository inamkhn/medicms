import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dismissToast, getToasts, subscribeToasts, type ToastIntent, type ToastItem } from '@/lib/toast';

// ============================================
// Toast — design system §15 (P6, P4, P7)
// Feedback that does not interrupt: a save confirmation belongs here, not in
// window.alert. The queue lives in src/lib/toast.ts and this component only
// subscribes to it, so nothing here calls setState from an effect.
// ============================================

// Red is reserved for destructive/failed and green for cleared — so `info` is
// deliberately left neutral instead of borrowing the interactive blue (P3, P9).
const intentStyles: Record<ToastIntent, { bar: string; icon: React.ReactNode }> = {
  success: { bar: 'bg-cleared', icon: <CheckCircle2 size={15} className="text-cleared" aria-hidden="true" /> },
  error: { bar: 'bg-danger', icon: <TriangleAlert size={15} className="text-danger" aria-hidden="true" /> },
  info: { bar: 'bg-hairline-strong', icon: <Info size={15} className="text-ink-muted" aria-hidden="true" /> },
};

function ToastCard({ toast }: { toast: ToastItem }) {
  const style = intentStyles[toast.intent];
  return (
    <ToastPrimitive.Root
      duration={toast.duration}
      onOpenChange={(open) => {
        if (!open) dismissToast(toast.id);
      }}
      className={cn(
        'relative pointer-events-auto w-full overflow-hidden rounded-card border border-hairline bg-panel shadow-overlay',
        'animate-toast-in data-[state=closed]:animate-toast-out',
        'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:animate-none',
      )}
    >
      {/* The bar repeats what the icon already says: colour alone must not carry
          the message (P4), and a fill is dropped by print anyway (P8). */}
      <span className={cn('absolute inset-y-0 left-0 w-[3px]', style.bar)} aria-hidden="true" />
      <div className="flex items-start gap-2.5 py-2.5 pl-3.5 pr-2">
        <span className="mt-0.5 shrink-0">{style.icon}</span>
        <div className="min-w-0 flex-1">
          <ToastPrimitive.Title className="text-body font-semibold leading-snug text-ink">
            {toast.title}
          </ToastPrimitive.Title>
          {toast.description && (
            <ToastPrimitive.Description className="mt-0.5 text-meta leading-snug text-ink-muted">
              {toast.description}
            </ToastPrimitive.Description>
          )}
          {toast.action && (
            <ToastPrimitive.Action
              altText={toast.action.label}
              onClick={(e) => {
                // preventDefault stops Radix closing the toast a second time; the
                // explicit dismiss below is what actually removes it from the queue.
                e.preventDefault();
                toast.action?.onClick();
                dismissToast(toast.id);
              }}
              className="mt-1.5 text-meta font-semibold text-accent underline-offset-4 hover:underline"
            >
              {toast.action.label}
            </ToastPrimitive.Action>
          )}
        </div>
        <ToastPrimitive.Close className="shrink-0 rounded-control p-1 text-ink-subtle transition-colors duration-120 hover:bg-hairline-soft hover:text-ink">
          <X size={14} aria-hidden="true" />
          <span className="sr-only">Dismiss</span>
        </ToastPrimitive.Close>
      </div>
    </ToastPrimitive.Root>
  );
}

/** Mount exactly once, above the router (see src/App.tsx). */
export function Toaster() {
  const toasts = React.useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  return (
    <ToastPrimitive.Provider label="Notifications">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
      {/* Width is declared once here and the cards fill it, so the stack and its
          items can never drift apart. */}
      <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-toast flex w-[320px] flex-col gap-2 p-4 outline-none" />
    </ToastPrimitive.Provider>
  );
}
