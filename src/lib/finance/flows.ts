// ============================================
// MediCMS Desktop — Finance core: the flows that come by themselves (§8)
// "Nothing from the fee side is typed again." These generators turn a Payments
// event into the money entry §8 says it deserves — a receipt into money in by
// mode, a void into a reversal in the same account, a cheque clearing into the
// bank, a counted day into a Cash difference, a refund into money out. They
// create entries; they never write to a store, and the screen validates what
// comes back with moneyEntryProblems before anything is posted.
// ============================================

import type { MoneyAccount, MoneyEntry } from './types.ts';
import type { FinanceLimits } from './limits.ts';
import {
  actionId,
  isSystemAccount,
  MONEY_ENTRY_LABELS,
  moneyEntryId,
  moneyEntryProblems,
  monthKey,
} from './entries.ts';

/** The four payment modes of the ledger (§14 there, §8 here). */
export type PaymentFlowMode = 'Cash' | 'Bank' | 'Online' | 'Cheque';

/** Where the caller took the entry and action numbers from, and the clock it lives under. */
export interface EntrySeries {
  entryNo: number;
  actionNo: number;
  /** ISO timestamp; the pure core never reads a clock. */
  now: string;
}

interface SeriesBase {
  date: string;
  createdBy: string;
  approvedBy?: string;
}

/** The §7.1 fields every generated entry carries before the flow overrides any. */
function shell(
  series: EntrySeries,
  base: SeriesBase,
  over: Partial<MoneyEntry> & Pick<MoneyEntry, 'accountId'>,
): MoneyEntry {
  const stamped: MoneyEntry = {
    id: moneyEntryId(series.entryNo),
    no: series.entryNo,
    date: base.date,
    accountId: over.accountId,
    direction: 'In',
    amount: 0,
    kind: 'OtherReceipt',
    actionId: actionId(series.actionNo),
    createdBy: base.createdBy,
    approvedBy: base.approvedBy,
    cleared: true,
    reconciled: false,
    createdAt: series.now,
  };
  return { ...stamped, ...over };
}

/**
 * §8, the account the money goes to: cash to a counter's cash, bank and online
 * to the bank account (a wallet when there is no bank), a cheque to the
 * cheques-in-hand system account — "Held, not counted in any balance" (§5);
 * its own bank entry arrives when it clears. Undefined means §78.1 has not
 * happened yet: no account of that kind exists.
 */
export function resolvePaymentAccount(
  accounts: readonly MoneyAccount[],
  mode: PaymentFlowMode,
): MoneyAccount | undefined {
  const active = accounts.filter((a) => a.status === 'Active');
  if (mode === 'Cash') return active.find((a) => a.type === 'counterCash');
  if (mode === 'Cheque') return active.find((a) => a.type === 'chequesInHand');
  return active.find((a) => a.type === 'bank') ?? active.find((a) => a.type === 'wallet');
}

export interface PaymentFlowInput extends SeriesBase {
  accountId: string;
  amount: number;
  mode: PaymentFlowMode;
  /** "Ali Raza (SNO 42)" — who paid (§7.1 Payee). */
  payee: string;
  receiptNo: string;
  /** Cheque number for Cheque mode; bank/UTR reference otherwise. */
  moneyRef?: string;
}

/** §8: money in — to the counter, the bank or the wallet, or a cheque held. */
export function paymentMoneyEntry(input: PaymentFlowInput, series: EntrySeries): MoneyEntry {
  const { accountId, amount, payee, receiptNo, moneyRef } = input;
  return shell(series, input, {
    accountId,
    direction: 'In',
    amount,
    kind: 'StudentPayment',
    payee,
    // §17: the route is kept, so the money-flow report can split fees by mode.
    mode: input.mode,
    reference: moneyRef || receiptNo,
    linkedDoc: receiptNo,
  });
}

/** The kinds a void or a bounce may stand against. */
const PAYABLE_KINDS: ReadonlySet<MoneyEntry['kind']> = new Set([
  'StudentPayment',
  'ChequeClearedIn',
]);

export interface VoidFlowInput extends SeriesBase {
  /** Why the receipt went out — every reversal needs a reason (§34). */
  reason: string;
  /** The voiding receipt, where the book gave one (§7.1 Linked document). */
  voidReceiptNo?: string;
}

/**
 * §8: "A receipt is voided → The same account → Money out (reversal)" (§79.6),
 * and a bounced cheque the same way against the entry it produced — the held
 * cheque when it never cleared, the bank entry when it did. The generator
 * takes the money entry to stand against, so the screen picks the right one.
 */
export function voidPaymentEntry(
  original: MoneyEntry,
  input: VoidFlowInput,
  series: EntrySeries,
): MoneyEntry {
  return shell(series, input, {
    accountId: original.accountId,
    direction: 'Out',
    amount: original.amount,
    kind: 'StudentPaymentReversal',
    payee: original.payee,
    reference: input.voidReceiptNo ?? original.reference,
    linkedDoc: input.voidReceiptNo ?? original.linkedDoc,
    reverses: original.id,
    reason: input.reason,
  });
}

/** `voidPaymentEntry` guards: only money in of a payment route is voidable. */
export function voidablePaymentEntry(original: MoneyEntry | undefined): original is MoneyEntry {
  return original !== undefined && original.direction === 'In' && PAYABLE_KINDS.has(original.kind);
}

export interface ChequeClearedInput extends SeriesBase {
  /** The bank the cleared money lands in (§8). */
  bankAccountId: string;
  /** The statement or clearing reference (§7.1). */
  reference?: string;
}

/** §8: "When it clears, the bank account gets the money." The held entry in
 *  the cheques-in-hand account stays; the cheque's own record carries the
 *  status (the lifecycle comes with the cheque screens). */
export function chequeClearedEntry(
  held: MoneyEntry,
  input: ChequeClearedInput,
  series: EntrySeries,
): MoneyEntry {
  return shell(series, input, {
    accountId: input.bankAccountId,
    direction: 'In',
    amount: held.amount,
    kind: 'ChequeClearedIn',
    payee: held.payee,
    reference: input.reference ?? held.reference,
    linkedDoc: held.linkedDoc,
  });
}

/**
 * §34: the five states a cheque passes through. Received and Deposited are both
 * still "in hand" — neither is money in any account — until it Clears; a Bounced
 * or Returned cheque has had its payment reversed (§35).
 */
export type IncomingChequeStatus =
  | 'Received'
  | 'Deposited'
  | 'Cleared'
  | 'Bounced'
  | 'Returned';

/** §34/§58: a Received cheque sent to the bank for clearing. No money moves until
 *  it clears (§35); the record only remembers the bank and the deposit date. */
export interface ChequeDeposit {
  /** The held money-in entry this deposit belongs to. */
  heldId: string;
  /** The bank account the cheque was paid into (§34). */
  bankAccountId: string;
  /** The day it was handed to the bank, local `YYYY-MM-DD`. */
  date: string;
  /** The deposit slip or batch reference, where the counter notes one. */
  reference?: string;
}

export interface IncomingChequeRow {
  /** The money-in entry on the cheques-in-hand account (§8). */
  held: MoneyEntry;
  /** The bank entry that took the money, once it cleared (§8, §17). */
  cleared?: MoneyEntry;
  /** The reversal standing against the hold (§8, §34). */
  reversed?: MoneyEntry;
  /** The deposit that sent this cheque to the bank, if it has been deposited (§34). */
  deposit?: ChequeDeposit;
  status: IncomingChequeStatus;
}

/**
 * §18 "Incoming cheques in hand", built from the books and never stored: every
 * student payment that landed in a cheques-in-hand account, with what became of
 * it. A clearing entry is found by the document it names (`linkedDoc`, the
 * receipt number `chequeClearedEntry` carries over); a bounce or a return is
 * found by the entry it reverses — and a reversal outranks it, so totals net out
 * (§17). The deposit record, where there is one, turns Received into Deposited
 * (§34); nothing about it is money until the cheque clears.
 */
export function incomingChequeRows(
  accounts: readonly MoneyAccount[],
  entries: readonly MoneyEntry[],
  deposits: readonly ChequeDeposit[] = [],
): IncomingChequeRow[] {
  const holdIds = new Set(
    accounts.filter((a) => a.type === 'chequesInHand').map((a) => a.id),
  );
  const reversalFor = new Map<string, MoneyEntry>();
  for (const e of entries) {
    if (e.reverses && !reversalFor.has(e.reverses)) reversalFor.set(e.reverses, e);
  }
  const clearedFor = new Map<string, MoneyEntry>();
  for (const e of entries) {
    if (e.kind === 'ChequeClearedIn' && e.linkedDoc && !clearedFor.has(e.linkedDoc)) {
      clearedFor.set(e.linkedDoc, e);
    }
  }
  const depositFor = new Map<string, ChequeDeposit>();
  for (const d of deposits) {
    if (!depositFor.has(d.heldId)) depositFor.set(d.heldId, d);
  }

  const rows: IncomingChequeRow[] = [];
  for (const held of entries) {
    if (held.kind !== 'StudentPayment' || held.direction !== 'In' || !holdIds.has(held.accountId)) continue;
    const reversed = reversalFor.get(held.id);
    const cleared = reversed ? undefined : (held.linkedDoc ? clearedFor.get(held.linkedDoc) : undefined);
    const deposit = depositFor.get(held.id);
    // A reversal outranks a clearing; its `outcome` tells a bounce from a return (§34).
    const status: IncomingChequeStatus = reversed
      ? reversed.outcome === 'Returned' ? 'Returned' : 'Bounced'
      : cleared ? 'Cleared'
      : deposit ? 'Deposited'
      : 'Received';
    rows.push({ held, cleared, reversed, deposit, status });
  }
  return rows.sort((a, b) => (a.held.date < b.held.date ? -1 : a.held.date > b.held.date ? 1 : a.held.no - b.held.no));
}

/** §18: the figure the overview and the held-money report show — §79.24's "not
 *  counted as money in" until each cheque reaches a bank account. Both Received
 *  and Deposited cheques are still in hand (§34). */
export function chequesInHandTotal(rows: readonly IncomingChequeRow[]): number {
  return rows
    .filter((r) => r.status === 'Received' || r.status === 'Deposited')
    .reduce((sum, r) => sum + r.held.amount, 0);
}

/** §58: the register's "Cleared this month" figure — cheques the bank honoured in
 *  `month` (`YYYY-MM`), by their clearing date. */
export function clearedChequesThisMonth(
  rows: readonly IncomingChequeRow[],
  month: string,
): { count: number; amount: number } {
  let count = 0;
  let amount = 0;
  for (const r of rows) {
    if (r.status !== 'Cleared' || !r.cleared) continue;
    if (r.cleared.date.slice(0, 7) !== month) continue;
    count += 1;
    amount += r.held.amount;
  }
  return { count, amount };
}

export interface DayCloseFlowInput extends SeriesBase {
  accountId: string;
  /** What the ledger says the drawer should hold. */
  expected: number;
  /** What was actually counted (§11). */
  counted: number;
  /** §11: a difference needs a note. */
  note: string;
  /** The document line the entry names; a petty count says so instead of "Day close" (§10, §11). */
  reference?: string;
}

/**
 * §11: a count difference creates one Cash difference entry so the account
 * always equals the physical count. A shortage of 500 becomes money out of
 * 500 (§79.8); an excess becomes money in; an equal count makes nothing.
 */
export function dayCloseDifference(input: DayCloseFlowInput, series: EntrySeries): MoneyEntry[] {
  if (input.counted === input.expected) return [];
  return [
    shell(series, input, {
      accountId: input.accountId,
      direction: input.counted < input.expected ? 'Out' : 'In',
      amount: Math.abs(input.counted - input.expected),
      kind: 'CashDifference',
      reference: input.reference ?? `Day close ${input.date}`,
      reason: input.note,
    }),
  ];
}

export interface RefundFlowInput extends SeriesBase {
  accountId: string;
  amount: number;
  /** "Ali Raza (SNO 42)" (§7.1). */
  payee: string;
  /** The refund's own document number (§7.1 Linked document). */
  refundNo?: string;
}

/**
 * §8: "A refund is paid → The chosen account → Money out, with a payment
 * voucher. Category 'Student refunds'". The voucher number and the approval
 * limits arrive with the voucher screens; the money side is complete here.
 */
export function refundMoneyEntry(input: RefundFlowInput, series: EntrySeries): MoneyEntry {
  return shell(series, input, {
    accountId: input.accountId,
    direction: 'Out',
    amount: input.amount,
    kind: 'RefundToStudent',
    payee: input.payee,
    category: 'Student refunds',
    reference: input.refundNo,
    linkedDoc: input.refundNo,
  });
}

/**
 * Refund numbers are documents, not money-entry numbers, but they follow the
 * same never-reused rule (§7.1): the next is one past the highest `RF-<n>` the
 * books already carry. The refund screen stamps it on the entry it posts.
 */
export function nextRefundNo(entries: readonly MoneyEntry[]): string {
  let max = 0;
  for (const e of entries) {
    if (e.kind !== 'RefundToStudent') continue;
    const parsed = /^RF-(\d+)$/.exec(e.linkedDoc ?? '');
    if (parsed && Number(parsed[1]) > max) max = Number(parsed[1]);
  }
  return `RF-${String(max + 1).padStart(3, '0')}`;
}

/** §18/§79.7: the refunds the money books hold, newest first — the register. */
export function refundRows(entries: readonly MoneyEntry[]): MoneyEntry[] {
  return entries
    .filter((e) => e.kind === 'RefundToStudent')
    .slice()
    .sort((a, b) => (a.date === b.date ? b.no - a.no : a.date < b.date ? 1 : -1));
}

// -------------------------------------------
// Hand entries at the bank (§20, §33, §60.2, §71)
// -------------------------------------------

/** The four §20 kinds an other receipt may carry. Reports show them on their
 *  own line, outside student fee income. */
export const OTHER_RECEIPT_KINDS = ['Bank profit', 'Vendor refund', 'Owner funds', 'Other'] as const;
export type OtherReceiptKind = (typeof OTHER_RECEIPT_KINDS)[number];

/** §60.2's four hand-entry kinds minus the transfer (which rides the transfer
 *  screen): the only money a person types at the bank. */
export type HandEntryKind = 'BankCharge' | 'OtherReceipt' | 'OwnerWithdrawal';

export interface BankChargeInput extends SeriesBase {
  accountId: string;
  amount: number;
  note?: string;
}

/** §71: a bank charge takes money out of the account, category "Bank charges". */
export function bankChargeEntry(input: BankChargeInput, series: EntrySeries): MoneyEntry {
  return shell(series, input, {
    accountId: input.accountId,
    direction: 'Out',
    amount: input.amount,
    kind: 'BankCharge',
    category: 'Bank charges',
    note: input.note,
  });
}

export interface OtherReceiptInput extends SeriesBase {
  accountId: string;
  amount: number;
  receiptKind: OtherReceiptKind;
  /** §20: every other receipt carries a reason. */
  reason: string;
}

/** §20: a rare deposit — bank profit, a vendor refund — money in, kept out of
 *  fee income by its own category. */
export function otherReceiptEntry(input: OtherReceiptInput, series: EntrySeries): MoneyEntry {
  return shell(series, input, {
    accountId: input.accountId,
    direction: 'In',
    amount: input.amount,
    kind: 'OtherReceipt',
    category: input.receiptKind,
    reason: input.reason,
  });
}

export interface OwnerWithdrawalInput extends SeriesBase {
  accountId: string;
  amount: number;
  /** §33: an Admin records why money left for personal use. */
  reason: string;
}

/** §33: the owner takes money out. Not a cost, so it carries no expense
 *  category — reports give it its own line. */
export function ownerWithdrawalEntry(input: OwnerWithdrawalInput, series: EntrySeries): MoneyEntry {
  return shell(series, input, {
    accountId: input.accountId,
    direction: 'Out',
    amount: input.amount,
    kind: 'OwnerWithdrawal',
    reason: input.reason,
  });
}

/**
 * §3/§20/§33/§60.2/§77: who may post which hand entry, as plain sentences. A
 * bank charge or other receipt is an Accountant's up to
 * `accountantOtherEntryLimit` and an Admin's at any amount; an owner withdrawal
 * is Admin only. Other receipts and withdrawals need a reason. `role` stays a
 * plain string, as in the voucher limits, so this core imports nothing from the
 * app.
 */
export function handEntryProblems(
  entry: { kind: HandEntryKind; role: string; amount: number; reason?: string },
  limits: FinanceLimits,
): string[] {
  const problems: string[] = [];
  if (entry.kind === 'OwnerWithdrawal') {
    if (entry.role !== 'Admin') problems.push('An owner withdrawal is posted by an Admin (§33, §60.2).');
    if (!entry.reason?.trim()) problems.push('An owner withdrawal needs a reason (§33).');
    return problems;
  }
  if (entry.kind === 'OtherReceipt' && !entry.reason?.trim()) {
    problems.push('An other receipt needs a reason (§20).');
  }
  if (entry.role === 'Accountant' && entry.amount > limits.accountantOtherEntryLimit) {
    problems.push(
      `${MONEY_ENTRY_LABELS[entry.kind]} of ${entry.amount} is above your limit of ${limits.accountantOtherEntryLimit} — an Admin posts it (§3, §77).`,
    );
  }
  return problems;
}

// -------------------------------------------
// Day closing (§11) — the record the deposit screen needs (§9)
// -------------------------------------------

/**
 * §33.5 of the day book document: "A closing record keeps: date, counter,
 * expected, counted, difference, note, who closed it and when." Held beside
 * the money books, not inside them — the entries it creates are the books.
 */
export interface DayClosing {
  /** Local date `YYYY-MM-DD` of the day being closed. */
  date: string;
  /** The counter cash account whose drawer was counted (§11). */
  accountId: string;
  expected: number;
  counted: number;
  /** Counted minus expected (§33.3). */
  difference: number;
  /** Required when the difference is not zero (§11, §33.6). */
  note?: string;
  closedBy: string;
  /** ISO timestamp; the caller's clock, the pure core never reads one. */
  closedAt: string;
  /** §9: the deposit slip numbers that deposited this day; empty while the
   *  counted cash is still lying in the counter. */
  depositRefs?: string[];
}

export interface DayCloseDraft {
  accountId: string;
  date: string;
  counted: number;
  note?: string;
  createdBy: string;
}

export interface DayClosePosting {
  errors: string[];
  /** What the ledger says the drawer should hold on `date`. */
  expected: number;
  closing: DayClosing;
  /** The §11 Cash difference entry, empty when the count is even. */
  entries: MoneyEntry[];
}

/**
 * §11 + §33: closing a day needs the day's expected cash (the account's
 * cleared balance up to that date), refuses a second closing of the same day
 * and a date in a closed month, requires a note for any difference, and
 * creates the Cash difference entry that makes the account equal the count.
 * The screen posts `entries` through the money store; the record itself is
 * saved beside the books.
 */
export function postDayClose(
  input: {
    accounts: readonly MoneyAccount[];
    entries: readonly MoneyEntry[];
    closings: readonly DayClosing[];
    closedMonths?: readonly string[];
    today: string;
  },
  draft: DayCloseDraft,
  series: EntrySeries,
): DayClosePosting {
  const account = input.accounts.find((a) => a.id === draft.accountId);
  const errors: string[] = [];
  if (!account) {
    errors.push(`Account ${draft.accountId} does not exist (§6).`);
  } else if (account.type !== 'counterCash') {
    errors.push("A day close counts a counter's cash drawer (§11).");
  } else if (isSystemAccount(account)) {
    errors.push(`${account.name} is a system account — it is never closed by hand (§5).`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
    errors.push('A day close carries a local date (YYYY-MM-DD) (§33).');
  } else {
    if (draft.date > input.today) errors.push(`The day being closed cannot be in the future: ${draft.date} is after ${input.today} (§33).`);
    if (input.closedMonths?.includes(monthKey(draft.date))) {
      errors.push(`${monthKey(draft.date)} is a closed month. An Admin must reopen it before a day in it can be closed again (§34).`);
    }
  }
  if (!Number.isInteger(draft.counted) || draft.counted < 0) {
    errors.push('The counted cash is in whole rupees and cannot be negative (§33).');
  }
  if (input.closings.some((d) => d.date === draft.date && d.accountId === draft.accountId)) {
    errors.push(`${draft.date} is already closed for ${account?.name ?? draft.accountId}. An Admin reopens the day first (§33.5).`);
  }

  // Expected is only meaningful once the account and date check out.
  // §33: the drawer holds the day's receipts, counted before the next
  // morning's money moves — so the balance runs through the day BEFORE `date`.
  const expected = account && /^\d{4}-\d{2}-\d{2}$/.test(draft.date)
    ? balanceThrough(input.entries, account.id, dayBefore(draft.date))
    : 0;
  const difference = draft.counted - expected;
  if (difference !== 0 && !draft.note?.trim()) {
    errors.push('A difference cannot be saved without a note (§33.6).');
  }

  const closing: DayClosing = {
    date: draft.date,
    accountId: draft.accountId,
    expected,
    counted: draft.counted,
    difference,
    note: draft.note?.trim() || undefined,
    closedBy: draft.createdBy,
    closedAt: series.now,
  };
  // A refused close creates nothing; numbers only grow on a accepted posting.
  const entries = errors.length
    ? []
    : dayCloseDifference(
        { accountId: draft.accountId, expected, counted: draft.counted, note: draft.note?.trim() ?? '', date: draft.date, createdBy: draft.createdBy },
        series,
      );
  if (!errors.length && entries.length) {
    errors.push(...moneyEntryProblems(entries[0], { accounts: input.accounts, entries: [...input.entries, ...entries], closedMonths: input.closedMonths }));
  }
  return { errors, expected, closing, entries };
}

/** The cleared balance of one account at the end of `date` (§6.1, §33.3). */
function balanceThrough(entries: readonly MoneyEntry[], accountId: string, date: string): number {
  let balance = 0;
  for (const e of entries) {
    if (e.accountId !== accountId || !e.cleared || e.date > date) continue;
    balance += e.direction === 'In' ? e.amount : -e.amount;
  }
  return balance;
}

/** `YYYY-MM-DD` minus one day, calendar-safe (UTC middle-of-day). */
function dayBefore(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * §9 "Cash deposit": the screen lists undeposited cash — each closed day
 * with its counted amount, not yet deposited. The deposit screen marks the
 * ticked days with the slip number it posted, so a day counts as deposited
 * once its record carries one.
 */
export function undepositedDayClosings(closings: readonly DayClosing[]): DayClosing[] {
  return closings.filter((d) => !(d.depositRefs ?? []).length);
}
