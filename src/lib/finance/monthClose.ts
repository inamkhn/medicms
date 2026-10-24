// ============================================
// MediCMS Desktop — Finance core: month close and the lock (§48, §69)
// A month is Open, In review or Closed. Closing is the Admin's, needs every
// required checklist item (§48.2), and happens in order — "October cannot be
// closed while September is still open" (§48.1). Once closed, the month is in
// `closedMonths` and the posting rules refuse anything dated there (§48.3);
// reopening is an Admin's, with a reason, and flags what arrives afterwards.
// Pure: the facts arrive from the books; nothing is stored here.
// ============================================

import type { MoneyEntry } from './types.ts';
import type { PettyCount } from './pettyCash.ts';

/** §48.1 states. `Open` is implicit: a month with no record is Open. */
export type MonthState = 'Open' | 'In review' | 'Closed';

/** §54/§72.2: the month-end report saved at the moment of closing (§48.3). */
export interface MonthReportSnapshot {
  month: string;
  moneyIn: number;
  moneyOut: number;
  net: number;
  balances: { accountId: string; name: string; balance: number }[];
  payables: number;
  receivables: number;
  heldForOthers: number;
  budgetTotal: number;
  budgetUsed: number;
  /** ISO timestamp of the close. */
  createdAt: string;
}

/** One month's close record — the whole lifecycle, append-only in effect. */
export interface MonthClosure {
  /** `YYYY-MM`. */
  month: string;
  state: MonthState;
  /** §48.1/§69 "review notes". */
  notes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  closedBy?: string;
  closedAt?: string;
  /** §48.3: created and saved at the moment of closing. */
  report?: MonthReportSnapshot;
  /** §48.4: a reopen is an Admin's, with a reason; entries after it are flagged. */
  reopenedBy?: string;
  reopenedAt?: string;
  reopenReason?: string;
}

/** The state a month is in; a month with no record is Open (§48.1). */
export function monthStateOf(month: string, closures: readonly MonthClosure[]): MonthState {
  return closures.find((closure) => closure.month === month)?.state ?? 'Open';
}

export function closureOf(month: string, closures: readonly MonthClosure[]): MonthClosure | undefined {
  return closures.find((closure) => closure.month === month);
}

/** §48.1: months close in order; the earliest month with entries before `month` must be closed. */
export function earlierOpenMonth(
  month: string,
  entryMonths: readonly string[],
  closedMonths: readonly string[],
): string | undefined {
  const candidates = [...new Set(entryMonths)].filter((m) => m < month).sort();
  return candidates.find((m) => !closedMonths.includes(m));
}

/** §69: the facts the checklist reads, gathered by the screen from the books. */
export interface MonthCloseFacts {
  month: string;
  /** Every month that holds a money entry — the order rule reads it (§48.1). */
  entryMonths: readonly string[];
  closedMonths: readonly string[];
  closures: readonly MonthClosure[];
  /** §48.2.1: bank and wallet accounts not reconciled through the end of the month. */
  accountsToReconcile: number;
  /** §48.2.2: days with receipts or vouchers that have no cash count. */
  openDays: number;
  /** §48.2.3: the petty float was counted at month end. */
  pettyCounted: boolean;
  /** §48.2.4: payments above the limit still waiting for an Admin. */
  approvalsPending: number;
  /** §48.2.5: statement lines still unmatched. */
  unresolvedLines: number;
  /** §48.2.6: whether payroll is used at all; `required` only then. */
  payrollUsed: boolean;
  payrollFinalised: boolean;
  /** §48.2.7: uncleared cheques older than the stale period — information only. */
  staleCheques: number;
}

/** One line of the §69 checklist. */
export interface MonthCheckItem {
  id: number;
  label: string;
  done: boolean;
  /** Why it is not done — shown beside the tick (§69). */
  detail?: string;
  /** The screen that fixes it (§69 "a button to fix it"). */
  href?: string;
  required: boolean;
}

/** §48.2.3: the month's last petty cash count, if it has one at all. */
export function pettyCountedInMonth(counts: readonly PettyCount[], month: string): PettyCount | undefined {
  return counts
    .filter((count) => count.date.slice(0, 7) === month)
    .sort((a, b) => a.date.localeCompare(b.date))
    .pop();
}

/** §48.2/§69 — the seven items, in the doc's order, each with its own way out. */
export function monthChecklist(facts: MonthCloseFacts): MonthCheckItem[] {
  return [
    {
      id: 1,
      label: 'Every bank account and wallet is reconciled through the end of the month.',
      done: facts.accountsToReconcile === 0,
      detail: facts.accountsToReconcile > 0 ? `${facts.accountsToReconcile} account(s) not yet reconciled` : undefined,
      href: '/finance/accounts',
      required: true,
    },
    {
      id: 2,
      label: 'Every day with receipts or vouchers has been closed with a cash count.',
      done: facts.openDays === 0,
      detail: facts.openDays > 0 ? `${facts.openDays} day(s) open` : undefined,
      href: '/finance/day-close',
      required: true,
    },
    {
      id: 3,
      label: 'Petty cash has been counted at the end of the month.',
      done: facts.pettyCounted,
      href: '/finance/petty-cash',
      required: true,
    },
    {
      id: 4,
      label: 'No payment above the limit is waiting for approval.',
      done: facts.approvalsPending === 0,
      detail: facts.approvalsPending > 0 ? `${facts.approvalsPending} waiting` : undefined,
      href: '/finance/vouchers',
      required: true,
    },
    {
      id: 5,
      label: 'Every unmatched statement line is resolved.',
      done: facts.unresolvedLines === 0,
      detail: facts.unresolvedLines > 0 ? `${facts.unresolvedLines} left` : undefined,
      href: '/finance/accounts',
      required: true,
    },
    {
      id: 6,
      label: 'Staff pay for the month is finalised.',
      done: !facts.payrollUsed || facts.payrollFinalised,
      href: '/staff/payroll',
      required: facts.payrollUsed,
    },
    {
      id: 7,
      label: 'Issued cheques older than the stale period have been looked at.',
      done: true,
      detail: facts.staleCheques > 0 ? `${facts.staleCheques} stale` : undefined,
      href: '/finance/cheques',
      required: false,
    },
  ];
}

/** §48.2/§49: why Close is disabled, in the doc's own sentences. */
export function closeMonthProblems(facts: MonthCloseFacts): string[] {
  const problems: string[] = [];
  const state = monthStateOf(facts.month, facts.closures);
  if (state === 'Closed') problems.push(`${facts.month} is already closed (§48.1).`);
  const earlier = earlierOpenMonth(facts.month, facts.entryMonths, facts.closedMonths);
  if (earlier) problems.push(`${earlier} is still open. Close it first (§73.1).`);
  for (const item of monthChecklist(facts)) {
    if (item.required && !item.done) problems.push(`Item ${item.id} is not done: ${item.label}`);
  }
  return problems;
}

/** §48.4: reopening needs a reason and a closed month. */
export function reopenMonthProblems(month: string, closures: readonly MonthClosure[], reason: string): string[] {
  const problems: string[] = [];
  if (monthStateOf(month, closures) !== 'Closed') problems.push(`${month} is not closed, so there is nothing to reopen (§48.4).`);
  if (reason.trim().length < 10) problems.push('A reopen needs a reason of at least 10 characters (§48.4).');
  return problems;
}

/**
 * §48.4 — entries dated in a month but created after it was reopened are
 * flagged "Added after close", so the reviewer sees exactly what changed. A
 * month that was never reopened flags nothing.
 */
export function entriesAddedAfterClose(
  entries: readonly MoneyEntry[],
  closures: readonly MonthClosure[],
): Set<string> {
  const out = new Set<string>();
  for (const closure of closures) {
    if (!closure.reopenedAt) continue;
    for (const entry of entries) {
      if (entry.date.slice(0, 7) !== closure.month) continue;
      if (entry.createdAt > closure.reopenedAt) out.add(entry.id);
    }
  }
  return out;
}
