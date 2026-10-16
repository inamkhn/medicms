// ============================================
// Toast emitter — design system §15 (P6, P7)
// The queue lives here, not in React state, because the thing that *causes* a
// toast (a ledger write, a failed save) is usually not a component. Toaster
// subscribes via useSyncExternalStore, so there is no effect and no setState
// during render — the pattern that react-hooks/set-state-in-effect exists to stop.
//
// Kept out of components/ui/toast.tsx on purpose: a non-component export in a
// component file disables fast refresh for every module that imports it.
// ============================================

export type ToastIntent = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  intent: ToastIntent;
  /** For undo — P7 says offer it only when the action is genuinely reversible. */
  action?: ToastAction;
  /** ms. Errors stay longer; a transient confirmation should not outlive its usefulness. */
  duration: number;
}

let queue: ToastItem[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function nextId(): number {
  // Impure by nature, and impurity belongs in a module function, not in component
  // scope (the same rule that moved Date.now() into lib/txn.ts).
  return ++lastId;
}
let lastId = 0;

export interface ToastOptions {
  title: string;
  description?: string;
  action?: ToastAction;
  duration?: number;
}

export function toast(input: ToastOptions | string): number {
  const opts: ToastOptions = typeof input === 'string' ? { title: input } : input;
  const item: ToastItem = {
    id: nextId(),
    title: opts.title,
    description: opts.description,
    // No intent in the public API: inferring it keeps "error" meaning exactly one
    // thing instead of every call site picking its own colour (P9).
    intent: opts.description && opts.description.toLowerCase().includes('failed') ? 'error' : 'info',
    action: opts.action,
    duration: opts.duration ?? 4500,
  };
  queue = [...queue, item];
  notify();
  return item.id;
}

export function toastSuccess(opts: ToastOptions | string): number {
  const id = toast(opts);
  queue = queue.map((t) => (t.id === id ? { ...t, intent: 'success' } : t));
  notify();
  return id;
}

export function toastError(opts: ToastOptions | string): number {
  const id = toast(opts);
  queue = queue.map((t) => (t.id === id ? { ...t, intent: 'error', duration: 7000 } : t));
  notify();
  return id;
}

export function dismissToast(id: number): void {
  const before = queue.length;
  queue = queue.filter((t) => t.id !== id);
  if (queue.length !== before) notify();
}

export function getToasts(): readonly ToastItem[] {
  return queue;
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
