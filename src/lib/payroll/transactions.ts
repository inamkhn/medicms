// ============================================
// MediCMS Desktop — Staff & Payroll: approval transactions (§19–§23, §64, §65 t19–t21, t43, t50)
//
// The store is dumb storage; this is the one place a run's approval is turned
// into the records it must leave behind — and it is all-or-nothing. `approvePayrollRun`
// (run.ts) already decided *whether* approval may happen and built the frozen
// run plus its cost postings, salary payables and committed recovery events as
// one set. Here that set is merged into the persisted slice atomically: if the
// result is not ok, nothing changes (§6.1, no half-posted run); a second request
// for an already-approved run posts nothing (§65 t50); and an incoming record id
// that already exists is refused rather than double-posted (integrity 5). A
// reversal only ever appends linked contra records — history is never rewritten.
// Pure: no zustand, no clock, so the contract is unit-testable.
// ============================================

import type {
  AdvanceEvent,
  PayrollCostPosting,
  PayrollPayable,
  PayrollRecovery,
  PayrollRun,
} from './types.ts';
import type { ApprovalResult, ReversalResult } from './run.ts';

/** The payroll record collections the store persists (§64 — records only, no stored balances). */
export interface PayrollRecordSlice {
  runs: PayrollRun[];
  recoveries: PayrollRecovery[];
  costPostings: PayrollCostPosting[];
  payables: PayrollPayable[];
  advanceEvents: AdvanceEvent[];
}

export interface TransactionOutcome {
  ok: boolean;
  problems: string[];
  /** False when the write was a no-op — an already-approved re-request (§65 t50). */
  applied: boolean;
  /** The next slice to persist; only present when `applied`. */
  next?: PayrollRecordSlice;
}

function replaceOrAdd<T extends { id: string }>(list: T[], record: T): T[] {
  const index = list.findIndex((r) => r.id === record.id);
  if (index === -1) return [...list, record];
  const copy = list.slice();
  copy[index] = record;
  return copy;
}

/** Incoming ids that already live in the target collection — a double post. */
function collisions<T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): string[] {
  const seen = new Set(existing.map((r) => r.id));
  return incoming.filter((r) => seen.has(r.id)).map((r) => r.id);
}

/**
 * §19/§20.3 apply an approval result. Non-ok results change nothing (the whole
 * run is rejected atomically). An already-approved re-request is a no-op that
 * posts nothing (§65 t50). Otherwise the approved run is stored and its cost
 * postings, payables and recovery events appended together — unless one of those
 * ids already exists, which refuses the entire write (integrity 5).
 */
export function applyApproval(slice: PayrollRecordSlice, result: ApprovalResult): TransactionOutcome {
  if (!result.ok) return { ok: false, problems: result.problems, applied: false };
  if (result.alreadyApproved) return { ok: true, problems: [], applied: false, next: slice };

  const run = result.run;
  const postings = result.postings ?? [];
  const payables = result.payables ?? [];
  const recoveryEvents = result.recoveryEvents ?? [];
  if (!run) return { ok: false, problems: ['An approval produced no frozen run to store (§19).'], applied: false };

  const problems: string[] = [
    ...collisions(slice.costPostings, postings).map((id) => `Cost posting ${id} already exists — an approval posts once (integrity 5).`),
    ...collisions(slice.payables, payables).map((id) => `Payable ${id} already exists — an approval posts once (integrity 5).`),
    ...collisions(slice.advanceEvents, recoveryEvents).map((id) => `Recovery event ${id} already exists — a recovery commits once (integrity 5).`),
  ];
  if (problems.length) return { ok: false, problems, applied: false };

  return {
    ok: true,
    problems: [],
    applied: true,
    next: {
      runs: replaceOrAdd(slice.runs, run),
      recoveries: slice.recoveries,
      costPostings: [...slice.costPostings, ...postings],
      payables: [...slice.payables, ...payables],
      advanceEvents: [...slice.advanceEvents, ...recoveryEvents],
    },
  };
}

/**
 * §20.4 apply a reversal. The approved run flips to Reversed and its cost and
 * recoveries undo as *new* linked contra records; the originals are kept (no
 * silent rewrite). Nothing changes when the reversal was refused.
 */
export function applyReversal(slice: PayrollRecordSlice, result: ReversalResult): TransactionOutcome {
  if (!result.ok || !result.run) return { ok: false, problems: result.problems, applied: false };

  const reversalPostings = result.reversalPostings ?? [];
  const reversalEvents = result.recoveryReversalEvents ?? [];
  const problems: string[] = [
    ...collisions(slice.costPostings, reversalPostings).map((id) => `Reversal posting ${id} already exists — a reversal is recorded once (integrity 5).`),
    ...collisions(slice.advanceEvents, reversalEvents).map((id) => `Reversal event ${id} already exists (integrity 5).`),
  ];
  if (problems.length) return { ok: false, problems, applied: false };

  return {
    ok: true,
    problems: [],
    applied: true,
    next: {
      runs: replaceOrAdd(slice.runs, result.run),
      recoveries: slice.recoveries,
      costPostings: [...slice.costPostings, ...reversalPostings],
      payables: slice.payables,
      advanceEvents: [...slice.advanceEvents, ...reversalEvents],
    },
  };
}
