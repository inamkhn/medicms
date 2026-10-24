// ============================================
// MediCMS Desktop — Finance core: petty cash (§10, §66)
// The float, the suggested top-up, the below-25% flag, the counted-difference
// posting and the derived voucher register. A petty purchase itself is a
// payment voucher and rides `createPaymentVoucher` (mode Cash on the petty
// account, capped by §77); nothing here stores a balance — the float is a
// setting on the account (§10) and every figure is calculated from the entries
// (§6.1). Pure: no clock, no store; the numbers and the timestamp come in.
// ============================================

import type { MoneyAccount, MoneyEntry } from './types.ts';
import type { FinanceLimits } from './limits.ts';
import { accountBalance, moneyEntryProblems, monthKey, reversedEntryIds } from './entries.ts';
import { dayCloseDifference, type EntrySeries } from './flows.ts';

/** §10: the fixed amount the float is kept at; 0 when none is set. */
export function pettyFloat(account: MoneyAccount | undefined): number {
  return account?.float ?? 0;
}

/**
 * §10/§66: a top-up brings the cash back to the float. The suggested amount is
 * the float less what is on hand now, and never below zero.
 */
export function suggestedTopUp(float: number, balance: number): number {
  return Math.max(0, float - balance);
}

/** §66/§77: the float reads low once cash drops under `lowPercent` of it — the
 *  screen passes its §77 setting; the default is that setting's own default. */
export function isLowOnFloat(balance: number, float: number, lowPercent = 25): boolean {
  return float > 0 && balance < float * (lowPercent / 100);
}

/**
 * §10/§77: the money the per-voucher limit and the no-negative rule leave the
 * Accountant. The voucher itself is built by `createPaymentVoucher`, which
 * refuses the same two things; this is the plain-language check the short form
 * runs first so it can say "Top up first" before the full voucher machinery.
 */
export function pettyVoucherProblems(
  draft: { amount: number; balance: number },
  limits: FinanceLimits,
): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(draft.amount) || draft.amount <= 0) {
    problems.push('A petty voucher pays a whole number of rupees, always positive (§10, §29).');
  } else if (draft.amount > limits.pettyVoucherLimit) {
    problems.push(`A petty cash voucher is limited to ${limits.pettyVoucherLimit} (§10, §77).`);
  }
  if (Number.isInteger(draft.amount) && draft.amount > 0 && draft.amount > draft.balance) {
    problems.push('Not enough cash. Top up first (§10, §6.2).');
  }
  return problems;
}

/** One row of the §66 voucher register — a petty purchase and whether it was reversed. */
export interface PettyVoucherRow {
  entry: MoneyEntry;
  /** §34: a later Reversal stands against this voucher's money-out entry. */
  reversed: boolean;
}

/**
 * §66: the petty voucher register, derived from the books and never stored —
 * every petty cash payment (a BillPayment that left a petty account), newest
 * first. The voucher number is the entry's linked document, its category and
 * payee ride the entry.
 */
export function pettyVoucherRows(
  entries: readonly MoneyEntry[],
  pettyAccountIds: readonly string[],
): PettyVoucherRow[] {
  const ids = new Set(pettyAccountIds);
  const reversed = reversedEntryIds(entries);
  return entries
    .filter((e) => e.kind === 'BillPayment' && e.direction === 'Out' && ids.has(e.accountId))
    .map((entry) => ({ entry, reversed: reversed.has(entry.id) }))
    .sort((a, b) => (a.entry.date === b.entry.date ? b.entry.no - a.entry.no : a.entry.date < b.entry.date ? 1 : -1));
}

export interface PettyCountDraft {
  accountId: string;
  /** What was counted (§10). */
  counted: number;
  /** §10: a difference needs a note. */
  note?: string;
  date: string;
  createdBy: string;
}

export interface PettyCountPosting {
  errors: string[];
  /** The petty account's cleared balance — what the drawer should hold. */
  expected: number;
  /** Counted minus expected (§10). */
  difference: number;
  /** The §10 Cash difference entry — empty when the count is even. */
  entries: MoneyEntry[];
}

/**
 * §48.2.3/§69 item 3: the record a count leaves behind. An even count posts no
 * entry, so the month close could never see it in the books; the record is kept
 * beside them, exactly as a day closing is (§11).
 */
export interface PettyCount {
  /** Local date `YYYY-MM-DD` of the count. */
  date: string;
  accountId: string;
  expected: number;
  counted: number;
  difference: number;
  note?: string;
  countedBy: string;
  /** ISO timestamp; the caller's clock, the core never reads one. */
  at: string;
}

/**
 * §10: a count compares the counted cash with the expected balance and, when
 * they differ, creates the Cash difference entry that makes the account equal
 * the count — a shortage money out, an excess money in. Refused for a non-petty
 * or Closed account, a future or closed-month date, a negative count, or a
 * difference with no note. The screen posts `entries` through the money store.
 */
export function pettyCountPosting(
  input: {
    accounts: readonly MoneyAccount[];
    entries: readonly MoneyEntry[];
    closedMonths?: readonly string[];
    today: string;
  },
  draft: PettyCountDraft,
  series: EntrySeries,
): PettyCountPosting {
  const account = input.accounts.find((a) => a.id === draft.accountId);
  const errors: string[] = [];
  if (!account) {
    errors.push(`Account ${draft.accountId} does not exist (§6).`);
  } else if (account.type !== 'pettyCash') {
    errors.push('A count compares the petty cash float (§10).');
  } else if (account.status === 'Closed') {
    errors.push(`${account.name} is Closed and takes no entries (§6.4).`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
    errors.push('A count carries a local date (YYYY-MM-DD) (§10).');
  } else {
    if (draft.date > input.today) errors.push(`A count cannot be dated into the future: ${draft.date} is after ${input.today} (§10).`);
    if (input.closedMonths?.includes(monthKey(draft.date))) {
      errors.push(`${monthKey(draft.date)} is a closed month. An Admin must reopen it before a count is dated there (§34).`);
    }
  }
  if (!Number.isInteger(draft.counted) || draft.counted < 0) {
    errors.push('The counted cash is in whole rupees and cannot be negative (§10).');
  }

  const expected = account ? accountBalance(input.entries, account.id) : 0;
  const difference = draft.counted - expected;
  if (difference !== 0 && !draft.note?.trim()) {
    errors.push('A difference needs a note (§10).');
  }

  const entries = errors.length
    ? []
    : dayCloseDifference(
        {
          accountId: draft.accountId,
          expected,
          counted: draft.counted,
          note: draft.note?.trim() ?? '',
          date: draft.date,
          createdBy: draft.createdBy,
          reference: `Petty count ${draft.date}`,
        },
        series,
      );
  if (!errors.length && entries.length) {
    errors.push(...moneyEntryProblems(entries[0], {
      accounts: input.accounts,
      entries: [...input.entries, ...entries],
      closedMonths: input.closedMonths,
    }));
  }
  return { errors, expected, difference, entries };
}
