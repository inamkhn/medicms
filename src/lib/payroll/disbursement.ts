// ============================================
// MediCMS Desktop — Staff & Payroll: disbursement (§25–§30, §65 t22–t30)
//
// The other half of the core rule: approval decided *what is owed*; this is the
// only place money is allowed to move — and even here it moves through Finance
// Core, never by editing a payable. Everything is pure: payables, disbursements
// and cheque states come in; the settled/pending/outstanding picture is derived,
// never stored (§6.1). Three rules drive every function:
//   • Payouts run only against an Approved, frozen run (§30).
//   • A line is never paid beyond its approved net — planned + issued + paid
//     must stay within it (§25, §64 integrity 7, §65 t29).
//   • An issued cheque is a *commitment*, not a payment: it reduces available
//     balance but only becomes cash out when it clears (§26, §29, §65 t24–t26).
// The money entries these rules gate are produced by `execution.ts` and posted
// through Finance Core's `moneyStore.postEntries` — never by editing a payable.
// ============================================

import type { PayrollDisbursement, PayrollPayable, PayrollRun, RunDisbursementState } from './types.ts';

// ----------------------------------------------------------------------------
// The derived payable position (§29)
// ----------------------------------------------------------------------------

/** How a disbursement settles at a point in time: cash out, a commitment, or neither. */
export type SettlementClass = 'paid' | 'pending' | 'none';

/** §26/§29 classify one disbursement: paid money out, an uncleared cheque commitment, or nothing. */
export function disbursementClass(d: PayrollDisbursement): SettlementClass {
  if (d.state === 'Planned' || d.state === 'Cancelled' || d.state === 'Reversed') return 'none';
  if (d.chequeId != null) return d.state === 'Cleared' ? 'paid' : 'pending';
  return d.state === 'Posted' ? 'paid' : 'none';
}

export interface PayablePosition {
  payrollLineId: string;
  approvedNet: number;
  /** Cash and bank paid, plus cheques that have cleared. */
  paid: number;
  /** §29 issued-but-uncleared cheques — a commitment, kept separate from paid. */
  pendingCheques: number;
  /** Approved net less paid less pending; the amount still free to disburse. */
  stillPayable: number;
}

/**
 * §29 the per-line payable position, rebuilt from the approved net and every
 * disbursement. Dashboard-style "still to disburse" and "issued cheques pending
 * clearance" come from here; an uncleared cheque is never called a payment.
 */
export function derivePayablePositions(
  payables: readonly PayrollPayable[],
  disbursements: readonly PayrollDisbursement[],
): PayablePosition[] {
  return payables.map((p) => {
    let paid = 0;
    let pendingCheques = 0;
    for (const d of disbursements) {
      if (d.payrollLineId !== p.payrollLineId) continue;
      const c = disbursementClass(d);
      if (c === 'paid') paid += d.amount;
      else if (c === 'pending') pendingCheques += d.amount;
    }
    return { payrollLineId: p.payrollLineId, approvedNet: p.net, paid, pendingCheques, stillPayable: p.net - paid - pendingCheques };
  });
}

/**
 * §19/§57 the run's disbursement state rolled up from the derived payable
 * positions. The store keeps only this label — a filterable fact — while every
 * amount behind it stays derived (§6.1). An uncleared cheque leaves the run
 * *pending*, never *paid*: money has been committed, not moved (§29).
 */
export function runDisbursementState(positions: readonly PayablePosition[]): RunDisbursementState {
  let paid = 0;
  let pending = 0;
  let still = 0;
  for (const p of positions) { paid += p.paid; pending += p.pendingCheques; still += p.stillPayable; }
  if (paid === 0 && pending === 0) return 'Unpaid';
  if (still > 0) return 'Part paid';
  return pending > 0 ? 'Pending cheque clearance' : 'Paid';
}

// ----------------------------------------------------------------------------
// Gating and never-overpay (§25, §30, §65 t29)
// ----------------------------------------------------------------------------

/** §30 a payout may only run against an approved, frozen run. */
export function payoutRunProblems(run: PayrollRun): string[] {
  const problems: string[] = [];
  if (run.calculationState !== 'Approved') problems.push(`Payouts cannot be made for a ${run.calculationState} run (§30).`);
  if (!run.totals) problems.push('Only a frozen approved run has a payable to disburse (§19).');
  return problems;
}

/** One staff line's slice of a batch. */
export interface AllocationDraft {
  payrollLineId: string;
  amount: number;
}

/**
 * §25 the checks before a batch may be authorized from an approved run: whole
 * positive rupees, and per staff line the batch's planned amount never pushes
 * paid + pending above the approved net (integrity 7, §65 t29).
 */
export function authorizeBatchProblems(input: {
  run: PayrollRun;
  allocations: readonly AllocationDraft[];
  positions: readonly PayablePosition[];
}): string[] {
  const problems = payoutRunProblems(input.run);
  const byLine = new Map(input.positions.map((p) => [p.payrollLineId, p]));
  const planned = new Map<string, number>();
  for (const a of input.allocations) {
    if (!Number.isInteger(a.amount) || a.amount <= 0) problems.push('A payout allocation is a positive whole number of rupees (§10.1).');
    planned.set(a.payrollLineId, (planned.get(a.payrollLineId) ?? 0) + a.amount);
  }
  for (const [lineId, amount] of planned) {
    const pos = byLine.get(lineId);
    if (!pos) {
      problems.push(`Line ${lineId} has no approved payable to disburse (§29).`);
      continue;
    }
    if (amount > pos.stillPayable) {
      problems.push(`Paying ${amount} on a line with ${pos.stillPayable} still payable would exceed the approved net (§25, §65 t29).`);
    }
  }
  return problems;
}

/**
 * §55 the never-overpay check for *planning* a new batch. `authorizeBatchProblems`
 * caps the batch against a line's still-payable, but it sees only paid and
 * pending cheques — not what other live (uncancelled) batches have already
 * claimed. The planner layers those open claims on top, so two batches together
 * can never plan past one line's approved net (integrity 7). A batch that alone
 * exceeds the net is reported once by `authorizeBatchProblems`; this adds the
 * cross-batch sentence only when the other batches' claims are what tips it over.
 */
export function planBatchProblems(input: {
  run: PayrollRun;
  allocations: readonly AllocationDraft[];
  positions: readonly PayablePosition[];
  alreadyPlannedByLine: Readonly<Record<string, number>>;
}): string[] {
  const problems = authorizeBatchProblems(input);
  const byLine = new Map(input.positions.map((p) => [p.payrollLineId, p]));
  const planned = new Map<string, number>();
  for (const a of input.allocations) planned.set(a.payrollLineId, (planned.get(a.payrollLineId) ?? 0) + a.amount);
  for (const [lineId, amount] of planned) {
    const pos = byLine.get(lineId);
    if (!pos) continue;
    const other = input.alreadyPlannedByLine[lineId] ?? 0;
    if (amount <= pos.stillPayable && amount + other > pos.stillPayable) {
      problems.push(`Line ${lineId} already has ${other} planned on other batches; this ${amount} would exceed its ${pos.approvedNet} approved net (§55, §64.7).`);
    }
  }
  return problems;
}

// ----------------------------------------------------------------------------
// Aggregate execution by the Accountant (§27, §65 t28, t30)
// ----------------------------------------------------------------------------

/**
 * §27 the Accountant confirms an aggregate batch and cannot see or change the
 * named allocations. The entered total must equal the authorized total exactly —
 * a differing amount is held for Admin, never split proportionally (§65 t30) — a
 * reference is required, and a repeated execution reference posts nothing twice
 * (§65 t28).
 */
export function aggregateExecutionProblems(input: {
  authorizedTotal: number;
  enteredTotal: number;
  reference: string;
  alreadyExecutedReference?: string;
}): string[] {
  const problems: string[] = [];
  if (input.enteredTotal !== input.authorizedTotal) {
    problems.push('Amount does not match the approved batch. Ask an Admin to revise it or provide an approved partial-execution mapping (§27, §65 t30).');
  }
  if (!input.reference.trim()) problems.push('An external execution needs its reference (§27).');
  if (input.alreadyExecutedReference && input.alreadyExecutedReference === input.reference) {
    problems.push('This execution reference was already posted — no second posting (§65 t28).');
  }
  return problems;
}

// ----------------------------------------------------------------------------
// Mode-specific posting rules (§26, §65 t23, t27)
// ----------------------------------------------------------------------------

/** §26/§65 t23 cash and funded movements may never drive an account negative. */
export function cashPostingProblems(input: { amount: number; accountAvailable: number }): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(input.amount) || input.amount <= 0) problems.push('A payout is a positive whole number of rupees (§10.1).');
  else if (input.amount > input.accountAvailable) problems.push('Cash cannot go negative — top up or choose another account (§26, §65 t23).');
  return problems;
}

/** §26/§65 t27 a post-dated cheque cannot clear before its own date. */
export function chequeClearProblems(input: { chequeDate: string; clearingDate: string }): string[] {
  const problems: string[] = [];
  if (input.clearingDate < input.chequeDate) {
    problems.push(`A cheque cannot clear before its date — ${input.clearingDate} is before ${input.chequeDate} (§26, §65 t27).`);
  }
  return problems;
}

/**
 * §26 cancelling an issued (uncleared) cheque restores the payable and releases
 * the available commitment; it needs a reason. A cheque that already cleared is
 * corrected by a Finance reversal, not a cancel. The cheque number is never
 * reused — that guarantee lives in Finance's cheque book (P14).
 */
export function chequeCancelProblems(input: { reason: string; alreadyCleared: boolean }): string[] {
  const problems: string[] = [];
  if (input.alreadyCleared) problems.push('A cleared cheque is corrected by a linked Finance reversal, not cancelled (§26).');
  else if (!input.reason.trim()) problems.push('Cancelling a payroll cheque needs a reason (§26).');
  return problems;
}
