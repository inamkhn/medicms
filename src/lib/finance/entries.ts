// ============================================
// MediCMS Desktop — Finance core: entry rules and the balance calculation
// (§6, §7). `accountBalance` is the only place a balance is worked out, so the
// overview, the account page, the reports and the dashboard can never disagree
// (§6.6). Pure: no clock, no store — dates come in from the caller.
// ============================================

import type {
  MoneyAccount,
  MoneyDirection,
  MoneyEntry,
  MoneyEntryKind,
} from './types.ts';

/** The words §7.2 prints, kept in one place so books and reports agree. */
export const MONEY_ENTRY_LABELS: Record<MoneyEntryKind, string> = {
  OpeningBalance: 'Opening balance',
  StudentPayment: 'Student payment',
  StudentPaymentReversal: 'Student payment reversal',
  ChequeClearedIn: 'Cheque cleared, incoming',
  RefundToStudent: 'Refund to student',
  BillPayment: 'Bill payment',
  PayrollPayment: 'Payroll payment',
  ChequeClearedOut: 'Cheque cleared, issued',
  TransferOut: 'Transfer out',
  TransferIn: 'Transfer in',
  CashDifference: 'Cash difference',
  BankCharge: 'Bank charge',
  OtherReceipt: 'Other receipt',
  OwnerWithdrawal: 'Owner withdrawal',
  Reversal: 'Reversal',
};

export const ACCOUNT_TYPE_LABELS: Record<MoneyAccount['type'], string> = {
  counterCash: 'Counter cash',
  pettyCash: 'Petty cash',
  bank: 'Bank account',
  wallet: 'Mobile wallet',
  chequesInHand: 'Cheques in hand',
  issuedCheques: 'Issued cheques',
};

/** §7.2 "Direction" column. `Either` covers Cash difference (in or out by the
 *  count) and Reversal (the opposite of what it reverses). */
const KIND_DIRECTION: Record<MoneyEntryKind, MoneyDirection | 'Either'> = {
  OpeningBalance: 'In',
  StudentPayment: 'In',
  StudentPaymentReversal: 'Out',
  ChequeClearedIn: 'In',
  RefundToStudent: 'Out',
  BillPayment: 'Out',
  PayrollPayment: 'Out',
  ChequeClearedOut: 'Out',
  TransferOut: 'Out',
  TransferIn: 'In',
  CashDifference: 'Either',
  BankCharge: 'Out',
  OtherReceipt: 'In',
  OwnerWithdrawal: 'Out',
  Reversal: 'Either',
};

export function kindDirection(kind: MoneyEntryKind): MoneyDirection | 'Either' {
  return KIND_DIRECTION[kind];
}

/** §34: every reversal needs a reason. §11: a count difference needs a note. */
const REASON_REQUIRED: readonly MoneyEntryKind[] = ['Reversal', 'StudentPaymentReversal', 'CashDifference'];

/** §5: system accounts have "no hand entries" — transfers must never touch them. */
export function isSystemAccount(account: MoneyAccount): boolean {
  return account.type === 'chequesInHand' || account.type === 'issuedCheques';
}

/** §6.2: counter cash and petty cash cannot go below zero. */
export function isCashLike(account: MoneyAccount): boolean {
  return account.type === 'counterCash' || account.type === 'pettyCash';
}

/** Entry numbers start at 1 and never come back (§7.1: "Unique and never reused"). */
export function moneyEntryId(no: number): string {
  return `me-${no}`;
}

export function nextMoneyEntryNo(entries: readonly MoneyEntry[]): number {
  let max = 0;
  for (const e of entries) if (e.no > max) max = e.no;
  return max + 1;
}

/** Action numbers count up from 1 in the same never-reused spirit (§7.1). */
export function actionId(no: number): string {
  return `a-${no}`;
}

export function nextActionNo(entries: readonly MoneyEntry[]): number {
  let max = 0;
  for (const e of entries) {
    const parsed = /^a-(\d+)$/.exec(e.actionId);
    if (parsed && Number(parsed[1]) > max) max = Number(parsed[1]);
  }
  return max + 1;
}

/** The `YYYY-MM` a dated entry belongs to — the unit of month close (§51). */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export interface EntryContext {
  accounts: readonly MoneyAccount[];
  entries: readonly MoneyEntry[];
  /** `YYYY-MM` keys of closed months (§9, §34). */
  closedMonths?: readonly string[];
}

/** Ids of entries that some other entry already reverses (§34). */
export function reversedEntryIds(entries: readonly MoneyEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) if (e.reverses) out.add(e.reverses);
  return out;
}

/**
 * Every §6 / §7 check one posted entry must pass, as plain sentences.
 * An empty array means the entry may be appended.
 */
export function moneyEntryProblems(entry: MoneyEntry, ctx: EntryContext): string[] {
  const problems: string[] = [];
  const account = ctx.accounts.find((a) => a.id === entry.accountId);

  if (!account) {
    problems.push(`Money entry refers to account ${entry.accountId}, which does not exist (§6).`);
  } else if (account.status === 'Closed') {
    problems.push(`Account ${account.name} is Closed and takes no entries (§6.4).`);
  }

  if (!Number.isInteger(entry.amount) || entry.amount <= 0) {
    problems.push('A money amount is in whole rupees and always positive (§7.1).');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
    problems.push('A money entry carries a local date (YYYY-MM-DD) (§7.1).');
  }

  const want = kindDirection(entry.kind);
  if (want !== 'Either' && want !== entry.direction) {
    problems.push(`${MONEY_ENTRY_LABELS[entry.kind]} is always ${want} (§7.2).`);
  }

  if (REASON_REQUIRED.includes(entry.kind) && !entry.reason?.trim()) {
    problems.push(`${MONEY_ENTRY_LABELS[entry.kind]} needs a reason (§34, §11).`);
  }

  // §34 reverses by both reversal kinds: the generic one and the automatic
  // student-payment reversal that a void or a bounce produces (§8).
  const namesTarget = entry.kind === 'Reversal' || entry.kind === 'StudentPaymentReversal';
  if (namesTarget) {
    const target = entry.reverses ? ctx.entries.find((e) => e.id === entry.reverses) : undefined;
    if (!entry.reverses || !target) {
      problems.push('A reversal must name the entry it reverses (§34).');
    } else {
      if (target.kind === 'Reversal') {
        problems.push('A reversal is not itself reversed — post a fresh correct entry (§34).');
      }
      if (target.accountId !== entry.accountId || target.amount !== entry.amount) {
        problems.push('A reversal sits in the same account for the same amount (§34).');
      }
      // A second reversal of the same entry is the mistake; the entry that is
      // already in the book beside its own target is not (§34).
      if (ctx.entries.some((e) => e !== entry && e.reverses === target.id)) {
        problems.push(`Entry ${target.id} is already reversed (§34).`);
      }
    }
  } else if (entry.reverses) {
    problems.push('Only a Reversal or a Student payment reversal may name an entry it reverses (§34).');
  }

  // §6: the opening balance is entered once at go-live. A later change goes
  // through a reversal first, so "already open" means an un-reversed one.
  if (entry.kind === 'OpeningBalance') {
    const reversed = reversedEntryIds(ctx.entries);
    const existing = ctx.entries.filter(
      (e) => e.kind === 'OpeningBalance' && e.accountId === entry.accountId && !reversed.has(e.id),
    );
    if (existing.length) {
      problems.push('The opening balance is entered once at the go-live date (§6). Reverse the existing one first (§78.1).');
    }
  }

  if (ctx.closedMonths?.includes(monthKey(entry.date))) {
    problems.push(`${monthKey(entry.date)} is a closed month. An Admin must reopen it before anything is dated there (§9, §34).`);
  }

  if (ctx.entries.some((e) => e.id === entry.id && e !== entry)) {
    problems.push(`Entry ${entry.id} is already in the books — numbers only go forward (§7.1).`);
  }

  return problems;
}

/**
 * §6.1 — the only balance function in the app: opening plus money in minus
 * money out, counting cleared entries only. Pass `asOf` for a past date (§12
 * running balance); without it, "at any moment" (§4).
 */
export function accountBalance(
  entries: readonly MoneyEntry[],
  accountId: string,
  asOf?: string,
): number {
  let balance = 0;
  for (const e of entries) {
    if (e.accountId !== accountId || !e.cleared) continue;
    if (asOf !== undefined && e.date > asOf) continue;
    balance += e.direction === 'In' ? e.amount : -e.amount;
  }
  return balance;
}

export interface AccountSummary {
  opening: number;
  moneyIn: number;
  moneyOut: number;
  closing: number;
}

/** The §13 row for one account: opening counted separately from money in/out. */
export function summariseAccount(
  entries: readonly MoneyEntry[],
  account: MoneyAccount,
  from?: string,
  to?: string,
): AccountSummary {
  let opening = 0;
  let moneyIn = 0;
  let moneyOut = 0;
  for (const e of entries) {
    if (e.accountId !== account.id || !e.cleared) continue;
    if (from !== undefined && e.date < from) continue;
    if (to !== undefined && e.date > to) continue;
    if (e.kind === 'OpeningBalance') {
      opening += e.direction === 'In' ? e.amount : -e.amount;
    } else if (e.direction === 'In') {
      moneyIn += e.amount;
    } else {
      moneyOut += e.amount;
    }
  }
  return { opening, moneyIn, moneyOut, closing: opening + moneyIn - moneyOut };
}

export interface ExternalTotals {
  openingTotal: number;
  moneyIn: number;
  moneyOut: number;
  net: number;
  closingTotal: number;
}

/**
 * The §13 proof: totals across the institute's own accounts with the transfers
 * taken out — "the two transfers appear on both sides, so they cancel out".
 * System accounts (§5) hold money that is not the institute's balance, so they
 * are excluded, as are both transfer kinds.
 */
export function externalTotals(
  entries: readonly MoneyEntry[],
  accounts: readonly MoneyAccount[],
): ExternalTotals {
  const own = new Set(accounts.filter((a) => !isSystemAccount(a)).map((a) => a.id));
  let openingTotal = 0;
  let moneyIn = 0;
  let moneyOut = 0;
  for (const e of entries) {
    if (!e.cleared || !own.has(e.accountId)) continue;
    if (e.kind === 'TransferOut' || e.kind === 'TransferIn') continue;
    if (e.kind === 'OpeningBalance') {
      openingTotal += e.direction === 'In' ? e.amount : -e.amount;
    } else if (e.direction === 'In') {
      moneyIn += e.amount;
    } else {
      moneyOut += e.amount;
    }
  }
  const net = moneyIn - moneyOut;
  return { openingTotal, moneyIn, moneyOut, net, closingTotal: openingTotal + net };
}

export interface SpendCheck {
  /** A hard block: §6.2, cash and petty cash cannot go below zero. */
  problem?: string;
  /** A soft warning: §6.3, bank and wallet overdrafts exist. */
  warning?: string;
}

/**
 * What paying `amount` out of `accountId` would do to its balance. The screens
 * and the posting functions both ask this, so "Not enough cash … Top up first"
 * is phrased in exactly one place.
 */
export function spendCheck(
  accounts: readonly MoneyAccount[],
  entries: readonly MoneyEntry[],
  accountId: string,
  amount: number,
): SpendCheck {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return { problem: `Account ${accountId} does not exist (§6).` };
  const after = accountBalance(entries, accountId) - amount;
  if (after >= 0) return {};
  if (isCashLike(account)) {
    return { problem: `Not enough cash in ${account.name}. Top up first (§6.2).` };
  }
  return { warning: `${account.name} would go below zero — an overdraft warning, not a block (§6.3).` };
}

/** §6.4 — an account closes when its balance is zero. */
export function accountClosingProblems(
  entries: readonly MoneyEntry[],
  account: MoneyAccount,
): string[] {
  const problems: string[] = [];
  if (accountBalance(entries, account.id) !== 0) {
    problems.push(`Account ${account.name} must reach a zero balance before it is closed (§6.4).`);
  }
  return problems;
}

/** §6.4 — an account with entries cannot be deleted, however small the balance. */
export function accountHasEntries(entries: readonly MoneyEntry[], accountId: string): boolean {
  return entries.some((e) => e.accountId === accountId);
}

/** One line of the §12 cash book or bank book: the entry and the running
 *  balance that follows it, worked out from the start of the account. */
export interface CashBookRow {
  entry: MoneyEntry;
  runningBalance: number;
}

/**
 * §12 — every entry of one account in date order with a running balance.
 * The balance is calculated from the start, so the screens filter the ROWS
 * for display and "searching or filtering a cash book or bank book does not
 * change its balance" (§14): line n always carries the same figure.
 */
export function cashBookRows(entries: readonly MoneyEntry[], accountId: string): CashBookRow[] {
  const own = entries
    .filter((e) => e.accountId === accountId)
    .slice()
    .sort((a, b) => (a.date === b.date ? a.no - b.no : a.date < b.date ? -1 : 1));
  let balance = 0;
  return own.map((entry) => {
    // §6.1: only cleared entries move the balance; uncleared ones still show,
    // carrying the last cleared figure.
    if (entry.cleared) balance += entry.direction === 'In' ? entry.amount : -entry.amount;
    return { entry, runningBalance: balance };
  });
}
