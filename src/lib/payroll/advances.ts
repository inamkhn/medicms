// ============================================
// MediCMS Desktop — Staff & Payroll: advances (§14–§16, §10.3–§10.5, §65)
//
// The advance ledger and the recovery planner. Pure: no clock, no store. An
// advance is money-out plus a *recoverable balance* — never salary cost (§13,
// §16) — and its balance is rebuilt from events, not typed into a field (§17).
// Recovering it in a pay run cuts take-home pay and the advance outstanding,
// not gross cost, and creates no money-in (§15). The actual money-out and its
// account/cheque are Finance Core's; here we only reference them.
// ============================================

import type { Advance, AdvanceEvent, AdvanceStatus, RecoverySelection } from './types.ts';

// ----------------------------------------------------------------------------
// The derived balance (§14, §17)
// ----------------------------------------------------------------------------

export interface AdvanceSummary {
  disbursed: number;
  recovered: number;
  /** §14 reversals of a recovery, which restore the outstanding balance. */
  reversed: number;
  /** §14: disbursed − recovered + reversed. Never below zero for a valid ledger. */
  balance: number;
  /** §65 t13: an advance approved but never paid carries no funded balance. */
  funded: boolean;
}

/** §14 the running total of one advance's event ledger. */
export function advanceSummary(events: readonly AdvanceEvent[]): AdvanceSummary {
  let disbursed = 0;
  let recovered = 0;
  let reversed = 0;
  for (const e of events) {
    // A malformed amount is surfaced by the ledger's own checks; skip it here so
    // a bad event can never silently make the balance negative.
    if (!Number.isInteger(e.amount) || e.amount < 0) continue;
    if (e.kind === 'Disbursed') disbursed += e.amount;
    else if (e.kind === 'Recovered') recovered += e.amount;
    else reversed += e.amount;
  }
  return { disbursed, recovered, reversed, balance: Math.max(0, disbursed - recovered + reversed), funded: disbursed > 0 };
}

/** §64 the balance of one advance, filtered from a shared event list. */
export function advanceBalance(advanceId: string, events: readonly AdvanceEvent[]): number {
  return advanceSummary(events.filter((e) => e.advanceId === advanceId)).balance;
}

// ----------------------------------------------------------------------------
// Field integrity and lifecycle (§14, §15)
// ----------------------------------------------------------------------------

/** The §14 checks on one advance record. */
export function advanceProblems(advance: Advance): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(advance.requestedAmount) || advance.requestedAmount <= 0) {
    problems.push('A requested advance is a positive whole number of rupees (§14).');
  }
  if (advance.approvedAmount !== undefined && (!Number.isInteger(advance.approvedAmount) || advance.approvedAmount < 0)) {
    problems.push('An approved advance amount is in whole non-negative rupees (§14).');
  }
  if (!advance.reason.trim()) problems.push('An advance needs a reason (§14).');
  if (!/^\d{4}-\d{2}$/.test(advance.startRecoveryMonth)) {
    problems.push('The recovery start is a service month, YYYY-MM (§14).');
  }
  if (advance.recoveryPolicy === 'Fixed per month') {
    if (advance.fixedRecoveryAmount === undefined || !Number.isInteger(advance.fixedRecoveryAmount) || advance.fixedRecoveryAmount <= 0) {
      problems.push('A fixed-per-month policy needs a positive whole recovery amount (§14).');
    }
  }
  return problems;
}

/** §15 the lifecycle the money and the ledger permit. Cancelling a disbursed advance is a Finance reversal, not this map. */
export const ALLOWED_ADVANCE_TRANSITIONS: Record<AdvanceStatus, readonly AdvanceStatus[]> = {
  Draft: ['Approved', 'Cancelled'],
  Approved: ['Pending disbursement', 'Active', 'Cancelled'],
  'Pending disbursement': ['Active', 'Cancelled'],
  Active: ['Recovered'],
  Recovered: [],
  Cancelled: [],
};

/** §15 is one status change legal from another? */
export function canTransitionAdvance(from: AdvanceStatus, to: AdvanceStatus): boolean {
  return ALLOWED_ADVANCE_TRANSITIONS[from].includes(to);
}

// ----------------------------------------------------------------------------
// Recovery planning (§10.3–§10.5, §12, §65 t14–t18)
// ----------------------------------------------------------------------------

/** One funded, still-outstanding advance the planner may draw on, oldest-first. */
export interface OutstandingAdvance {
  advanceId: string;
  balance: number;
  /** §10.4 the disbursement date orders the default oldest-first recovery. */
  paymentDate: string;
}

/** §10.4 the staff member's funded outstanding advances, oldest disbursement first. */
export function outstandingOldestFirst(advances: readonly Advance[], events: readonly AdvanceEvent[]): OutstandingAdvance[] {
  const out: OutstandingAdvance[] = [];
  for (const a of advances) {
    const s = advanceSummary(events.filter((e) => e.advanceId === a.id));
    if (s.funded && s.balance > 0) out.push({ advanceId: a.id, balance: s.balance, paymentDate: a.paymentDate ?? a.createdAt });
  }
  return out.sort((x, y) => (x.paymentDate === y.paymentDate ? 0 : x.paymentDate < y.paymentDate ? -1 : 1));
}

export interface RecoveryAllocation {
  advanceId: string;
  amount: number;
}

export interface RecoveryPlanInput {
  /** §10.3 the earned gross available to recover against, before any recovery. */
  availableSalary: number;
  /** §10.5 what the policy or Admin asked to recover this run. */
  requested: number;
  /** Oldest-first order comes from `outstandingOldestFirst`; Manual uses `advances` order. */
  advances: readonly OutstandingAdvance[];
  selection?: RecoverySelection;
  /** §65 t18 when `Manual`, the Admin's chosen amount per advance. */
  manual?: Record<string, number>;
}

export interface RecoveryPlan {
  allocations: RecoveryAllocation[];
  totalRecovered: number;
  /** §64 balance left on each advance after this run; feeds the next run's carry-forward. */
  remainingBalances: Record<string, number>;
  /** §10.5 total still outstanding across the advances after this run. */
  carryForward: number;
  /** §65 t15/t16 preview notices — the run may proceed, these are shown to the Admin. */
  notes: string[];
  /** Hard integrity failures; a plan with problems recovers nothing. */
  problems: string[];
}

/**
 * §10.3–§10.5 the rupees to recover from a staff member's advances for one run.
 * Total recovery is capped at available salary (carry the rest forward) and each
 * advance at its outstanding balance (never below zero). Oldest-first fills by
 * default; `Manual` honours the Admin's per-advance choice within the same caps.
 */
export function planAdvanceRecovery(input: RecoveryPlanInput): RecoveryPlan {
  const problems: string[] = [];
  const notes: string[] = [];

  if (!Number.isInteger(input.availableSalary) || input.availableSalary < 0) {
    problems.push('Available salary is a whole non-negative amount (§10.3).');
  }
  if (!Number.isInteger(input.requested) || input.requested < 0) {
    problems.push('A requested recovery is a whole non-negative amount (§10.3).');
  }
  for (const a of input.advances) {
    if (!Number.isInteger(a.balance) || a.balance < 0) problems.push(`Advance ${a.advanceId} has a negative or fractional balance (§14).`);
  }
  const empty = { allocations: [], totalRecovered: 0, remainingBalances: {}, carryForward: 0, notes, problems };
  if (problems.length) return empty;

  const selection: RecoverySelection = input.selection ?? 'Oldest first';
  // §10.5 never recover more than the salary leaves, nor more than was requested.
  const target = Math.min(input.requested, input.availableSalary);
  const remaining: Record<string, number> = {};
  for (const a of input.advances) remaining[a.advanceId] = a.balance;

  const allocations: RecoveryAllocation[] = [];
  let recovered = 0;
  const give = (advanceId: string, want: number): void => {
    const capped = Math.min(want, remaining[advanceId] ?? 0, target - recovered);
    if (capped <= 0) return;
    remaining[advanceId] -= capped;
    recovered += capped;
    allocations.push({ advanceId, amount: capped });
  };

  if (selection === 'Manual') {
    for (const a of input.advances) {
      const chosen = input.manual?.[a.advanceId] ?? 0;
      if (!Number.isInteger(chosen) || chosen < 0) {
        problems.push(`A manual recovery amount for ${a.advanceId} is a whole non-negative number (§10.4).`);
        continue;
      }
      if (chosen > a.balance) notes.push(`Advance ${a.advanceId} reduced to its ${a.balance} outstanding — never below zero (§65 t16).`);
      give(a.advanceId, chosen);
    }
  } else {
    for (const a of input.advances) give(a.advanceId, a.balance);
  }

  if (problems.length) return { ...empty, problems };

  const carryForward = Object.values(remaining).reduce((s, v) => s + v, 0);
  if (recovered < input.requested && input.availableSalary < input.requested) {
    notes.push(`Recovery capped at available salary ${input.availableSalary}; ${input.requested - recovered} carried forward (§10.5, §65 t15).`);
  }
  return { allocations, totalRecovered: recovered, remainingBalances: remaining, carryForward, notes, problems };
}
