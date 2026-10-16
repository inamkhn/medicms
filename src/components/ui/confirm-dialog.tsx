import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  getPendingConfirm,
  settleConfirm,
  subscribeConfirm,
  type ConfirmRequest,
  type ConfirmTone,
} from '@/lib/confirm';
import type { AuditChange } from '@/types';

// ============================================
// ConfirmDialog / ConfirmWithReasonDialog — design system §15 (P6)
// The rule this file exists to enforce: an irreversible ask must state its effect
// in concrete terms, and `tone: 'money' | 'destructive'` refuses Escape so the
// answer has to be given rather than dodged. window.confirm stated nothing.
// ============================================

const confirmVariant: Record<ConfirmTone, 'default' | 'destructive'> = {
  neutral: 'default',
  // Moving money is serious but not destructive; red is reserved (P3).
  money: 'default',
  destructive: 'destructive',
};

/** The well that carries the restated effect. Neutral for a plain ask, danger-tinted
 *  only for the destructive tone so the tint keeps meaning "this cannot be undone". */
function EffectStatement({ effect, tone }: { effect: string; tone: ConfirmTone }) {
  return (
    <div
      className={cn(
        'rounded-control border p-3 text-body leading-relaxed',
        tone === 'destructive' ? 'border-danger/25 bg-danger-soft text-ink' : 'border-hairline bg-hairline-soft text-ink-secondary',
      )}
    >
      {effect}
    </div>
  );
}

/** Before → after, read from the same AuditChange shape the log stores. */
export function ChangePreview({ changes }: { changes: readonly AuditChange[] }) {
  if (!changes.length) return null;
  return (
    <dl className="rounded-control border border-hairline divide-y divide-hairline-soft bg-panel">
      {changes.map((c) => (
        <div key={c.field} className="grid grid-cols-[minmax(0,7rem)_1fr] gap-2 px-3 py-2 text-meta">
          <dt className="text-ink-muted">{c.field}</dt>
          <dd className="min-w-0 text-ink">
            <span className="text-ink-subtle line-through">{c.before}</span>
            <span aria-hidden="true" className="mx-1.5 text-ink-subtle">
              &rarr;
            </span>
            {c.after}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface ConfirmLayoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  effect: string;
  description?: React.ReactNode;
  tone?: ConfirmTone;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  /** Rendered after the effect statement, before the footer. */
  children?: React.ReactNode;
  onConfirm: () => void;
  onEscapeBlockedHint?: () => void;
}

/** Shared body for both variants so the two can never drift apart visually (P9). */
function ConfirmLayout({
  open,
  onOpenChange,
  title,
  effect,
  description,
  tone = 'neutral',
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  confirmDisabled = false,
  children,
  onConfirm,
  onEscapeBlockedHint,
}: ConfirmLayoutProps) {
  const lockEscape = tone === 'money' || tone === 'destructive';
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onEscapeKeyDown={
          lockEscape
            ? (e) => {
                e.preventDefault();
                onEscapeBlockedHint?.();
              }
            : undefined
        }
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <div className="mt-3 flex flex-col gap-3 px-4">
          <EffectStatement effect={effect} tone={tone} />
          {children}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline">{cancelLabel}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild disabled={confirmDisabled} onClick={onConfirm}>
            <Button variant={confirmVariant[tone]}>{confirmLabel}</Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export type ConfirmDialogProps = Omit<ConfirmLayoutProps, 'children' | 'onEscapeBlockedHint'>;

/** Declarative yes/no for a screen that already owns the state. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  return <ConfirmLayout {...props} />;
}

export interface ConfirmWithReasonDialogProps
  extends Omit<ConfirmLayoutProps, 'children' | 'onEscapeBlockedHint' | 'onConfirm'> {
  reasonLabel: string;
  reasonPlaceholder?: string;
  /** Default 5 — a one-character reason is not a reason. */
  reasonMinLength?: number;
  /** Optional before/after preview; the edit screens already compute this for the log. */
  changes?: readonly AuditChange[];
  onConfirm: (reason: string) => void;
}

/**
 * The variant the design doc requires for edits, strike-off and imports: the reason
 * is not optional, and the dialog will not close until it clears the minimum length.
 */
export function ConfirmWithReasonDialog({
  reasonLabel,
  reasonPlaceholder,
  reasonMinLength = 5,
  changes,
  onConfirm,
  ...props
}: ConfirmWithReasonDialogProps) {
  const [reason, setReason] = React.useState('');
  const fieldId = React.useId();
  const trimmed = reason.trim();
  const valid = trimmed.length >= reasonMinLength;

  return (
    <ConfirmLayout
      {...props}
      confirmDisabled={!valid}
      onConfirm={() => onConfirm(trimmed)}
      // Reason state lives here rather than at every call site, and is cleared on the
      // way out (an event handler) instead of in an effect.
      onOpenChange={(next) => {
        if (!next) setReason('');
        props.onOpenChange(next);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fieldId}>{reasonLabel}</Label>
        <textarea
          id={fieldId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={reasonPlaceholder}
          rows={3}
          className={cn(
            'w-full resize-y rounded-control border bg-panel px-3 py-2 text-body text-ink',
            'placeholder:text-ink-subtle',
            // Only complain once the user has started answering, so a fresh dialog is not accusatory.
            !valid && trimmed.length > 0 ? 'border-danger' : 'border-hairline',
          )}
        />
        {!valid && (
          <p className={cn('text-meta', trimmed.length > 0 ? 'text-danger' : 'text-ink-muted')}>
            At least {reasonMinLength} characters — this is the only record of why it changed.
          </p>
        )}
      </div>
      {changes && changes.length > 0 ? <ChangePreview changes={changes} /> : null}
    </ConfirmLayout>
  );
}

/**
 * Bridges lib/confirm.ts to the UI so imperative call sites (`if (!confirm(…)) return`)
 * can await a dialog without each one owning state. Mount once beside <Toaster/>.
 *
 * The key on each dialog resets the reason field per request. Note that the imperative
 * path skips the exit animation — the request is removed from the store the instant it
 * settles, so there is no window in which to play it. The declarative variants animate.
 */
export function ConfirmDialogHost() {
  const pending = React.useSyncExternalStore(subscribeConfirm, getPendingConfirm, getPendingConfirm);
  if (!pending) return null;

  const { request } = pending;

  // Ordering invariant: AlertDialogAction runs our onConfirm first and then asks Radix
  // to close, which arrives here as onOpenChange(false). settleConfirm() clears the
  // request before resolving, so the trailing close is a no-op rather than a second,
  // contradicting answer. Do not "simplify" it by resolving straight from the button.
  if (request.reason) {
    return (
      <ConfirmWithReasonDialog
        key={pending.id}
        open
        onOpenChange={(next) => {
          if (!next) settleConfirm(false);
        }}
        title={request.title}
        effect={request.effect}
        description={request.description}
        tone={request.tone}
        confirmLabel={request.confirmLabel ?? 'Confirm'}
        cancelLabel={request.cancelLabel}
        reasonLabel={request.reason.label}
        reasonPlaceholder={request.reason.placeholder}
        reasonMinLength={request.reason.minLength}
        onConfirm={(reason) => settleConfirm(true, reason)}
      />
    );
  }

  return (
    <ConfirmDialog
      key={pending.id}
      open
      onOpenChange={(next) => {
        if (!next) settleConfirm(false);
      }}
      title={request.title}
      effect={request.effect}
      description={request.description}
      tone={request.tone}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      onConfirm={() => settleConfirm(true)}
    />
  );
}

// Re-exported for call sites that already import this component; the definitions live
// in lib/confirm.ts, which is also why PendingConfirm's resolver is not re-exported —
// settleConfirm() is the only way the UI may end a request.
export type { ConfirmRequest, ConfirmTone };
