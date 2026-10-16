// ============================================
// MediCMS Desktop — Finance core: petty cash tests (§10, §66)
// The float figures, the derived voucher register and the counted-difference
// posting. Pure, no store, no clock. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { equal } from 'node:assert/strict';

import type { MoneyAccount, MoneyEntry } from './types.ts';
import { accountBalance } from './entries.ts';
import { DEFAULT_FINANCE_LIMITS } from './limits.ts';
import type { EntrySeries } from './flows.ts';
import {
  isLowOnFloat,
  pettyCountPosting,
  pettyFloat,
  pettyVoucherProblems,
  pettyVoucherRows,
  suggestedTopUp,
} from './pettyCash.ts';

const NOW = '2026-10-09T10:00:00';
const SERIES: EntrySeries = { entryNo: 10, actionNo: 6, now: NOW };

function account(id: string, name: string, type: MoneyAccount['type'], over: Partial<MoneyAccount> = {}): MoneyAccount {
  return { id, name, type, status: 'Active', ...over };
}
const BANK = account('acc-bank', 'Meezan, main', 'bank');
const PETTY = account('acc-petty', 'Petty cash', 'pettyCash', { float: 75_000 });
const COUNTER = account('acc-counter', 'Counter cash', 'counterCash');
const ACCOUNTS = [BANK, PETTY, COUNTER];

function opening(no: number, accountId: string, amount: number): MoneyEntry {
  return {
    id: `me-${no}`, no, date: '2026-10-01', accountId, direction: 'In', amount,
    kind: 'OpeningBalance', actionId: `a-${no}`, createdBy: 'Setup',
    cleared: true, reconciled: false, createdAt: NOW,
  };
}
function pettyVoucher(no: number, amount: number, date: string, voucherNo: string, over: Partial<MoneyEntry> = {}): MoneyEntry {
  return {
    id: `me-${no}`, no, date, accountId: 'acc-petty', direction: 'Out', amount,
    kind: 'BillPayment', category: 'Food and hospitality', payee: 'Tea and snacks',
    reference: voucherNo, linkedDoc: voucherNo, actionId: `a-${no}`, createdBy: 'Accountant',
    cleared: true, reconciled: false, createdAt: NOW, ...over,
  };
}
function reversal(no: number, target: MoneyEntry, over: Partial<MoneyEntry> = {}): MoneyEntry {
  return {
    id: `me-${no}`, no, date: target.date, accountId: target.accountId, direction: 'In', amount: target.amount,
    kind: 'Reversal', reverses: target.id, reason: 'mistake', actionId: `a-${no}`, createdBy: 'Admin',
    cleared: true, reconciled: false, createdAt: NOW, ...over,
  };
}

const OPENINGS = [opening(1, 'acc-bank', 1_172_000), opening(2, 'acc-petty', 73_000), opening(3, 'acc-counter', 352_000)];

describe('the petty float figures (§10, §66)', () => {
  it('reads the float off the account, 0 when none is set', () => {
    equal(pettyFloat(PETTY), 75_000);
    equal(pettyFloat(account('acc-x', 'X', 'pettyCash')), 0);
    equal(pettyFloat(undefined), 0);
  });

  it('suggests the top-up that returns the cash to the float, never below zero', () => {
    equal(suggestedTopUp(75_000, 20_000), 55_000);
    equal(suggestedTopUp(75_000, 75_000), 0);
    equal(suggestedTopUp(75_000, 80_000), 0);
  });

  it('flags the float once cash drops under a quarter of it (§66)', () => {
    equal(isLowOnFloat(18_000, 75_000), true);   // 75,000 * 25% = 18,750
    equal(isLowOnFloat(18_750, 75_000), false);
    equal(isLowOnFloat(20_000, 75_000), false);
    equal(isLowOnFloat(0, 0), false);            // no float set → never low
  });

  it('honours the §77 low-warning percent the screen passes', () => {
    equal(isLowOnFloat(18_000, 75_000, 20), false);  // 20% of 75,000 = 15,000
    equal(isLowOnFloat(14_000, 75_000, 20), true);
    equal(isLowOnFloat(20_000, 75_000, 30), true);   // 30% of 75,000 = 22,500
  });
});

describe('the petty voucher checks (§10, §77)', () => {
  it('takes any whole amount up to the limit when the cash is there', () => {
    equal(pettyVoucherProblems({ amount: 4_200, balance: 73_000 }, DEFAULT_FINANCE_LIMITS).length, 0);
    equal(pettyVoucherProblems({ amount: 5_000, balance: 73_000 }, DEFAULT_FINANCE_LIMITS).length, 0); // exactly the limit
  });

  it('refuses a voucher above the per-voucher limit (§77)', () => {
    const problems = pettyVoucherProblems({ amount: 5_001, balance: 73_000 }, DEFAULT_FINANCE_LIMITS);
    equal(problems.length, 1);
    equal(/limited to 5000/.test(problems[0]), true);
  });

  it('refuses to take petty cash below zero (§10, §6.2)', () => {
    const problems = pettyVoucherProblems({ amount: 4_200, balance: 3_000 }, DEFAULT_FINANCE_LIMITS);
    equal(problems.length, 1);
    equal(/Top up first/.test(problems[0]), true);
  });

  it('refuses a non-positive or fractional amount (§29)', () => {
    equal(pettyVoucherProblems({ amount: 0, balance: 73_000 }, DEFAULT_FINANCE_LIMITS).length, 1);
    equal(pettyVoucherProblems({ amount: -5, balance: 73_000 }, DEFAULT_FINANCE_LIMITS).length, 1);
    equal(pettyVoucherProblems({ amount: 10.5, balance: 73_000 }, DEFAULT_FINANCE_LIMITS).length, 1);
  });
});

describe('the voucher register is derived from the books (§66)', () => {
  const pv1 = pettyVoucher(4, 2_800, '2026-10-06', 'PV-0421');
  const pv2 = pettyVoucher(5, 4_200, '2026-10-08', 'PV-0422');
  const bankPayment = pettyVoucher(6, 9_000, '2026-10-07', 'PV-0423', { accountId: 'acc-bank' });
  const entries = [...OPENINGS, pv1, pv2, bankPayment];

  it('shows only petty cash payments, newest first', () => {
    const rows = pettyVoucherRows(entries, ['acc-petty']);
    equal(rows.length, 2);
    equal(rows[0].entry.linkedDoc, 'PV-0422');
    equal(rows[1].entry.linkedDoc, 'PV-0421');
    equal(rows[0].reversed, false);
  });

  it('marks a voucher whose money-out has been reversed (§34)', () => {
    const voided = reversal(7, pv1);
    const rows = pettyVoucherRows([...entries, voided], ['acc-petty']);
    const struck = rows.find((r) => r.entry.linkedDoc === 'PV-0421');
    equal(struck?.reversed, true);
  });
});

describe('a count makes the account equal the cash (§10)', () => {
  const base = { accounts: ACCOUNTS, entries: OPENINGS, today: '2026-10-09' };

  it('an even count creates nothing', () => {
    const result = pettyCountPosting(base, { accountId: 'acc-petty', counted: 73_000, date: '2026-10-09', createdBy: 'Accountant' }, SERIES);
    equal(result.errors.length, 0);
    equal(result.expected, 73_000);
    equal(result.difference, 0);
    equal(result.entries.length, 0);
  });

  it('a shortage is money out and needs a note', () => {
    const noNote = pettyCountPosting(base, { accountId: 'acc-petty', counted: 72_500, date: '2026-10-09', createdBy: 'Accountant' }, SERIES);
    equal(/difference needs a note/.test(noNote.errors[0]), true);

    const result = pettyCountPosting(base, { accountId: 'acc-petty', counted: 72_500, note: 'Spill not vouchered', date: '2026-10-09', createdBy: 'Accountant' }, SERIES);
    equal(result.errors.length, 0);
    equal(result.difference, -500);
    equal(result.entries.length, 1);
    equal(result.entries[0].kind, 'CashDifference');
    equal(result.entries[0].direction, 'Out');
    equal(result.entries[0].amount, 500);
    equal(result.entries[0].reference, 'Petty count 2026-10-09');
    // The entry it would post brings the account to the counted figure.
    equal(accountBalance([...OPENINGS, result.entries[0]], 'acc-petty'), 72_500);
  });

  it('an excess is money in', () => {
    const result = pettyCountPosting(base, { accountId: 'acc-petty', counted: 73_400, note: 'Found float', date: '2026-10-09', createdBy: 'Accountant' }, SERIES);
    equal(result.errors.length, 0);
    equal(result.entries[0].direction, 'In');
    equal(result.entries[0].amount, 400);
  });

  it('refuses a non-petty account, a negative count and a closed month', () => {
    equal(/petty cash float/.test(pettyCountPosting(base, { accountId: 'acc-counter', counted: 0, date: '2026-10-09', createdBy: 'x' }, SERIES).errors[0]), true);
    equal(/negative/.test(pettyCountPosting(base, { accountId: 'acc-petty', counted: -1, date: '2026-10-09', createdBy: 'x' }, SERIES).errors[0]), true);
    const closed = pettyCountPosting({ ...base, closedMonths: ['2026-10'] }, { accountId: 'acc-petty', counted: 73_000, date: '2026-10-09', createdBy: 'x' }, SERIES);
    equal(/closed month/.test(closed.errors[0]), true);
  });

  it('refuses a Closed petty account (§6.4)', () => {
    const closedPetty = { ...base, accounts: [...ACCOUNTS, account('acc-old', 'Old petty', 'pettyCash', { status: 'Closed' })] };
    const result = pettyCountPosting(closedPetty, { accountId: 'acc-old', counted: 0, date: '2026-10-09', createdBy: 'x' }, SERIES);
    equal(/Closed/.test(result.errors[0]), true);
  });
});
