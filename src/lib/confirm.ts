// ============================================
// Confirm bridge — design system §15 (P6)
// Mirrors lib/toast.ts: the request lives outside React and ConfirmDialogHost
// subscribes to it. This exists so the 19 native `confirm()` call sites, which are
// imperative ("if (!confirm(msg)) return"), can become `if (!(await confirmDialog(…)))
// return` without each one growing three pieces of state.
//
// Deliberately not named `confirm(` — scripts/check-design.mjs polices the native
// dialog, and a wrapper that reads the same as the thing it replaces defeats the gate.
// ============================================

/** Destructive and money-moving asks must not be dismissible by accident (P6). */
export type ConfirmTone = 'neutral' | 'money' | 'destructive';

export interface ConfirmReasonSpec {
  /** Label above the textarea. */
  label: string;
  placeholder?: string;
  /** Default 5 — a reason of "x" is not a reason. */
  minLength?: number;
}

export interface ConfirmRequest {
  title: string;
  /** P6: the outcome restated in concrete terms — what changes, for whom, how much.
   *  "Are you sure?" is not an effect, which is the whole defect being fixed. */
  effect: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** Presence of this field is what makes the dialog the "with reason" variant. */
  reason?: ConfirmReasonSpec;
}

export interface ConfirmOutcome {
  confirmed: boolean;
  reason?: string;
}

/** The single open request. Exported as one object so the host has one snapshot to
 *  subscribe to — id and request can therefore never be read out of step. */
export interface PendingConfirm {
  id: number;
  request: ConfirmRequest;
  resolve: (outcome: ConfirmOutcome) => void;
}

let pending: PendingConfirm | null = null;
const listeners = new Set<() => void>();
let lastId = 0;

function notify() {
  for (const l of listeners) l();
}

function open(req: ConfirmRequest): Promise<ConfirmOutcome> {
  // Two asks at once would leave the first caller awaiting forever, so the older
  // one is settled as a cancellation instead.
  if (pending) settleSelf(false);
  return new Promise<ConfirmOutcome>((resolve) => {
    pending = { id: ++lastId, request: req, resolve };
    notify();
  });
}

function settleSelf(confirmed: boolean, reason?: string): void {
  if (!pending) return;
  const { resolve } = pending;
  // Cleared before resolving, so a double click or an Escape racing the button
  // cannot settle the same request twice.
  pending = null;
  notify();
  resolve({ confirmed, reason });
}

/** Resolve the open request from the UI. Safe to call more than once. */
export function settleConfirm(confirmed: boolean, reason?: string): void {
  settleSelf(confirmed, reason);
}

export function getPendingConfirm(): PendingConfirm | null {
  return pending;
}

export function subscribeConfirm(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Yes/no. The result carries no reason, even if one was collected. */
export function confirmDialog(req: ConfirmRequest): Promise<boolean> {
  return confirmWithReason(req).then((outcome) => outcome.confirmed);
}

/** The only path that can return a reason; confirmDialog() is its boolean projection. */
export function confirmWithReason(req: ConfirmRequest): Promise<ConfirmOutcome> {
  return open(req);
}
