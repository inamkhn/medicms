// ============================================
// MediCMS Desktop — Finance core: issued cheques (§31)
// A cheque the institute writes pays the bill at once but leaves the bank
// balance unchanged until the bank clears it (§31.2). So issuing is a register
// record, not a money entry; only a cleared cheque posts money out of the bank.
// "Available balance = bank balance − issued cheques that have not cleared"
// (§31.3) is worked out here, in one place, so the overview, the bank page and
// this register can never disagree. Pure: no clock, no store — `today` and the
// timestamp come from the caller, entry numbers from an `EntrySeries`.
// ============================================

import type { MoneyAccount, MoneyEntry } from './types.ts';
import {
  actionId,
  accountBalance,
  moneyEntryId,
  moneyEntryProblems,
  monthKey,
  spendCheck,
} from './entries.ts';
import type { EntrySeries } from './flows.ts';
import type { PostingResult } from './transfer.ts';

/** §31.1 — a chequebook is a range of numbers drawn on one bank account. */
export interface Chequebook {
  id: string;
  /** The bank account its cheques draw on (§31.1). */
  bankAccountId: string;
  /** "For example 004850 to 004899" — kept as strings so leading zeros survive. */
  fromNo: string;
  toNo: string;
  status: 'Active' | 'Full' | 'Closed';
}

/** The lifecycle §31.2 stores. Post-dated and Stale are states read off an
 *  `Issued` cheque by its dates; Spoiled is a skipped number, not a cheque. */
export type IssuedChequeStatus = 'Issued' | 'Cleared' | 'Cancelled';

/** The badge the screen shows — the stored status widened by the derived ones. */
export type ChequeDisplayStatus =
  | 'Issued'
  | 'Post-dated'
  | 'Stale'
  | 'Cleared'
  | 'Cancelled';

/** §31.2 — one cheque the institute has written. */
export interface IssuedCheque {
  id: string;
  chequebookId: string;
  /** Denormalised from the book so the register groups by bank without a join. */
  bankAccountId: string;
  chequeNo: string;
  payee: string;
  /** Whole rupees, always positive — the direction of a cleared cheque is Out. */
  amount: number;
  /** The day it was written and handed over (§31.2). */
  issueDate: string;
  /** The date on the cheque; after `today` it is post-dated (§31.2, §79.18). */
  chequeDate: string;
  /** "A/C payee only" (§30). */
  acPayee: boolean;
  status: IssuedChequeStatus;
  /** §31.2: a cleared cheque carries the clearing date and the bank entry it made. */
  clearedDate?: string;
  clearedEntryId?: string;
  /** §31.2: a cancelled cheque keeps its reason; the number is never reused. */
  cancelledReason?: string;
  /** The voucher or bill it pays, where one exists (§7.1 Linked document). */
  linkedDoc?: string;
  createdBy: string;
  createdAt: string;
}

/** What every cheque rule reads: the books, the register and the caller's clock. */
export interface ChequeContext {
  accounts: readonly MoneyAccount[];
  entries: readonly MoneyEntry[];
  chequebooks: readonly Chequebook[];
  cheques: readonly IssuedCheque[];
  closedMonths?: readonly string[];
  /** Local `YYYY-MM-DD`; the pure core never reads a clock. */
  today: string;
  /** ISO timestamp for the record's `createdAt`. */
  now: string;
}

/** §31.2: a cheque is stale once it has been outstanding longer than this. */
export const STALE_AFTER_MONTHS = 6;

function parseNo(value: string): number {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : Number.NaN;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** `YYYY-MM-DD` advanced by whole months, calendar-safe at UTC midday. */
function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  return dt.toISOString().slice(0, 10);
}

/** Ids count up from 1 and never come back, like money entries (§7.1 spirit). */
export function nextChequeId(cheques: readonly IssuedCheque[]): string {
  let max = 0;
  for (const c of cheques) {
    const parsed = /^chq-(\d+)$/.exec(c.id);
    if (parsed && Number(parsed[1]) > max) max = Number(parsed[1]);
  }
  return `chq-${max + 1}`;
}

export function nextChequebookId(books: readonly Chequebook[]): string {
  let max = 0;
  for (const b of books) {
    const parsed = /^ckb-(\d+)$/.exec(b.id);
    if (parsed && Number(parsed[1]) > max) max = Number(parsed[1]);
  }
  return `ckb-${max + 1}`;
}

function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 <= b2 && b1 <= a2;
}

/**
 * §31.1: a chequebook names a live bank account and a numeric range; the range
 * cannot overlap another book on the same bank — a number is never reused.
 */
export function chequebookProblems(
  book: Chequebook,
  existing: readonly Chequebook[],
  accounts: readonly MoneyAccount[],
): string[] {
  const problems: string[] = [];
  const bank = accounts.find((a) => a.id === book.bankAccountId);
  if (!bank) {
    problems.push('A chequebook draws on a bank account (§31.1).');
  } else if (bank.type !== 'bank') {
    problems.push('A chequebook draws on a bank account — not a cash, wallet or system account (§31.1).');
  } else if (bank.status === 'Closed') {
    problems.push(`${bank.name} is Closed and its cheques cannot draw (§6.4).`);
  }
  const from = parseNo(book.fromNo);
  const to = parseNo(book.toNo);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    problems.push('A chequebook carries a numeric from and to number (§31.1).');
  } else if (to < from) {
    problems.push('The to number cannot be before the from number (§31.1).');
  } else {
    for (const other of existing) {
      if (other.id === book.id || other.bankAccountId !== book.bankAccountId) continue;
      const of = parseNo(other.fromNo);
      const ot = parseNo(other.toNo);
      if (Number.isFinite(of) && Number.isFinite(ot) && rangesOverlap(from, to, of, ot)) {
        problems.push(`The range ${book.fromNo}–${book.toNo} overlaps the book ${other.fromNo}–${other.toNo} on the same bank — ranges cannot overlap (§31.1).`);
      }
    }
  }
  return problems;
}

/**
 * §31.1: the next unused number in the book, or undefined once it is full.
 * Cancelled and cleared numbers stay counted, so none is ever reused.
 */
export function nextChequeNo(book: Chequebook, cheques: readonly IssuedCheque[]): string | undefined {
  const from = parseNo(book.fromNo);
  const to = parseNo(book.toNo);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return undefined;
  const used = new Set(
    cheques.filter((c) => c.chequebookId === book.id).map((c) => parseNo(c.chequeNo)),
  );
  const width = book.fromNo.length;
  for (let n = from; n <= to; n += 1) {
    if (!used.has(n)) return String(n).padStart(width, '0');
  }
  return undefined;
}

/** §31.2: issued with a date still in the future. */
export function isPostDated(cheque: IssuedCheque, today: string): boolean {
  return cheque.status === 'Issued' && cheque.chequeDate > today;
}

/**
 * §31.2: outstanding longer than `STALE_AFTER_MONTHS` after its own date. A
 * cheque exactly six months old is not yet stale; a day later it is (§79.17).
 */
export function isStale(cheque: IssuedCheque, today: string, staleMonths = STALE_AFTER_MONTHS): boolean {
  if (cheque.status !== 'Issued') return false;
  return today > addMonths(cheque.chequeDate, staleMonths);
}

/** The badge the register shows — the stored status widened by the derived ones.
 *  `staleMonths` is the §77 setting; the default is STALE_AFTER_MONTHS. */
export function chequeDisplayStatus(cheque: IssuedCheque, today: string, staleMonths = STALE_AFTER_MONTHS): ChequeDisplayStatus {
  if (cheque.status === 'Cleared') return 'Cleared';
  if (cheque.status === 'Cancelled') return 'Cancelled';
  if (isPostDated(cheque, today)) return 'Post-dated';
  if (isStale(cheque, today, staleMonths)) return 'Stale';
  return 'Issued';
}

/** §18: the total of a bank's cheques written but not yet cleared. Post-dated
 *  and stale cheques count — the money is already committed (§31.3). */
export function unclearedIssuedTotal(
  cheques: readonly IssuedCheque[],
  bankAccountId?: string,
): number {
  return cheques
    .filter((c) => c.status === 'Issued' && (bankAccountId === undefined || c.bankAccountId === bankAccountId))
    .reduce((sum, c) => sum + c.amount, 0);
}

/** §31.3 — the only available-balance function: bank balance minus committed. */
export function availableBalance(
  entries: readonly MoneyEntry[],
  cheques: readonly IssuedCheque[],
  bankAccountId: string,
  asOf?: string,
): number {
  return accountBalance(entries, bankAccountId, asOf) - unclearedIssuedTotal(cheques, bankAccountId);
}

export interface ChequeIssueDraft {
  chequebookId: string;
  chequeNo: string;
  payee: string;
  amount: number;
  chequeDate: string;
  issueDate: string;
  acPayee?: boolean;
  linkedDoc?: string;
  createdBy: string;
}

export type ChequeIssueResult =
  | { ok: true; cheque: IssuedCheque }
  | { ok: false; errors: string[] };

/**
 * §31.2: writing a cheque records it and pays the bill, but posts no money —
 * the bank balance is unchanged and only the available balance falls. Nothing
 * here touches the money books; the register carries the commitment.
 */
export function issueCheque(ctx: ChequeContext, draft: ChequeIssueDraft): ChequeIssueResult {
  const errors: string[] = [];
  const book = ctx.chequebooks.find((b) => b.id === draft.chequebookId);
  if (!book) {
    errors.push('A cheque is written from a chequebook (§31.1).');
  } else if (book.status !== 'Active') {
    errors.push(`Chequebook ${book.fromNo}–${book.toNo} is ${book.status} — no more cheques come from it (§31.1).`);
  }
  const bank = book && ctx.accounts.find((a) => a.id === book.bankAccountId);
  if (book && bank && bank.status === 'Closed') {
    errors.push(`${bank.name} is Closed and its cheques cannot draw (§6.4).`);
  }

  if (!Number.isInteger(draft.amount) || draft.amount <= 0) {
    errors.push('A cheque is written in whole rupees, always positive (§7.1).');
  }
  if (!draft.payee.trim()) errors.push('A cheque names its payee (§30).');
  if (!isValidDate(draft.issueDate)) errors.push('The issue date is a local date (YYYY-MM-DD) (§31.2).');
  else if (draft.issueDate > ctx.today) errors.push(`A cheque is not dated into the future: ${draft.issueDate} is after ${ctx.today} (§31.2).`);
  if (!isValidDate(draft.chequeDate)) errors.push('The cheque carries a date (YYYY-MM-DD) (§31.2).');

  if (book) {
    const from = parseNo(book.fromNo);
    const to = parseNo(book.toNo);
    const no = parseNo(draft.chequeNo);
    if (!Number.isFinite(no)) {
      errors.push('A cheque carries its printed number (§31.1).');
    } else {
      if (Number.isFinite(from) && Number.isFinite(to) && (no < from || no > to)) {
        errors.push(`Cheque ${draft.chequeNo} is outside the book ${book.fromNo}–${book.toNo} (§31.1).`);
      }
      // A number is never reused — cleared, cancelled or live, it is taken (§31.2).
      if (ctx.cheques.some((c) => c.bankAccountId === book.bankAccountId && parseNo(c.chequeNo) === no)) {
        errors.push(`Cheque ${draft.chequeNo} has already been written on this bank — numbers are never reused (§31.2).`);
      }
    }
  }

  if (errors.length) return { ok: false, errors };

  const cheque: IssuedCheque = {
    id: nextChequeId(ctx.cheques),
    chequebookId: book!.id,
    bankAccountId: book!.bankAccountId,
    chequeNo: draft.chequeNo,
    payee: draft.payee.trim(),
    amount: draft.amount,
    issueDate: draft.issueDate,
    chequeDate: draft.chequeDate,
    acPayee: draft.acPayee ?? false,
    status: 'Issued',
    linkedDoc: draft.linkedDoc?.trim() || undefined,
    createdBy: draft.createdBy,
    createdAt: ctx.now,
  };
  return { ok: true, cheque };
}

export interface ChequeClearDraft {
  chequeId: string;
  /** The date the bank paid it — the money out is dated this day (§31.2). */
  clearDate: string;
  reference?: string;
  createdBy: string;
}

/**
 * §31.2 / §79.15: clearing an issued cheque is the moment money leaves the bank.
 * It posts one `Cheque cleared, issued` money-out entry on the bank, dated the
 * clearing day. A post-dated cheque cannot be cleared before its date (§79.18),
 * and a cancelled or already-cleared cheque cannot be cleared again. An
 * overdraft is a warning, not a block (§6.3).
 */
export function clearCheque(ctx: ChequeContext, draft: ChequeClearDraft, series: EntrySeries): PostingResult {
  const errors: string[] = [];
  const cheque = ctx.cheques.find((c) => c.id === draft.chequeId);
  if (!cheque) return { ok: false, errors: [`Cheque ${draft.chequeId} does not exist (§31.2).`] };
  if (cheque.status === 'Cancelled') {
    return { ok: false, errors: [`Cheque ${cheque.chequeNo} is Cancelled — it cannot be cleared (§31.2).`] };
  }
  if (cheque.status === 'Cleared') {
    return { ok: false, errors: [`Cheque ${cheque.chequeNo} is already cleared (§31.2).`] };
  }

  const bank = ctx.accounts.find((a) => a.id === cheque.bankAccountId);
  if (!bank) errors.push(`Bank account ${cheque.bankAccountId} does not exist (§6).`);
  else if (bank.status === 'Closed') errors.push(`${bank.name} is Closed and takes no entries (§6.4).`);

  if (!isValidDate(draft.clearDate)) {
    errors.push('The clearing date is a local date (YYYY-MM-DD) (§31.2).');
  } else {
    if (draft.clearDate > ctx.today) errors.push(`A cheque is not cleared on a future date: ${draft.clearDate} is after ${ctx.today} (§31.2).`);
    // §79.18: a post-dated cheque cannot be presented before its own date.
    if (draft.clearDate < cheque.chequeDate) {
      errors.push(`Cheque ${cheque.chequeNo} is dated ${cheque.chequeDate}; it cannot be cleared before then (§31.2).`);
    }
    if (ctx.closedMonths?.includes(monthKey(draft.clearDate))) {
      errors.push(`${monthKey(draft.clearDate)} is a closed month. An Admin must reopen it before this cheque is cleared (§34).`);
    }
  }
  if (errors.length) return { ok: false, errors };

  const entry: MoneyEntry = {
    id: moneyEntryId(series.entryNo),
    no: series.entryNo,
    date: draft.clearDate,
    accountId: cheque.bankAccountId,
    direction: 'Out',
    amount: cheque.amount,
    kind: 'ChequeClearedOut',
    payee: cheque.payee,
    reference: draft.reference?.trim() || cheque.chequeNo,
    linkedDoc: cheque.linkedDoc,
    actionId: actionId(series.actionNo),
    createdBy: draft.createdBy,
    cleared: true,
    reconciled: false,
    createdAt: series.now,
  };

  const structural = moneyEntryProblems(entry, {
    accounts: ctx.accounts,
    entries: [...ctx.entries, entry],
    closedMonths: ctx.closedMonths,
  });
  if (structural.length) return { ok: false, errors: structural };

  const spend = spendCheck(ctx.accounts, ctx.entries, cheque.bankAccountId, cheque.amount);
  if (spend.problem) return { ok: false, errors: [spend.problem] };
  return { ok: true, entries: [entry], warnings: spend.warning ? [spend.warning] : [] };
}

export interface ChequeCancelDraft {
  chequeId: string;
  /** §31.2 / §34: cancelling needs a reason. */
  reason: string;
}

export type ChequeCancelResult =
  | { ok: true; cheque: IssuedCheque }
  | { ok: false; errors: string[] };

/**
 * §31.2 / §79.16: a cancelled cheque has not been presented, so no money moved;
 * it leaves the uncleared set (the available balance rises back) and its number
 * stays in the register, never reused. A cleared cheque has already paid — it is
 * corrected by reversing the bank entry, not by cancelling the cheque (§34).
 * Reversing the voucher and returning the bill to unpaid is the voucher screen's (§29, §34).
 */
export function cancelCheque(ctx: ChequeContext, draft: ChequeCancelDraft): ChequeCancelResult {
  const errors: string[] = [];
  const cheque = ctx.cheques.find((c) => c.id === draft.chequeId);
  if (!cheque) return { ok: false, errors: [`Cheque ${draft.chequeId} does not exist (§31.2).`] };
  if (cheque.status === 'Cleared') {
    errors.push(`Cheque ${cheque.chequeNo} has cleared — reverse its bank entry instead (§34).`);
  }
  if (cheque.status === 'Cancelled') {
    errors.push(`Cheque ${cheque.chequeNo} is already cancelled.`);
  }
  if (!draft.reason.trim()) errors.push('Cancelling a cheque needs a reason (§31.2, §34).');
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    cheque: { ...cheque, status: 'Cancelled', cancelledReason: draft.reason.trim() },
  };
}
