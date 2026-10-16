// ============================================
// MediCMS Desktop — Finance core: entry rules and balance tests (§6, §7, §13)
// §79 cases 1–4 and the acceptance line "the sample in section 13 reproduces
// exactly from the entries", run on the pure functions in src/lib/finance with
// no store, component or clock. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal, ok } from 'node:assert/strict';

import type { MoneyAccount, MoneyAccountType, MoneyEntry, MoneyEntryKind } from './types.ts';
import {
  MONEY_ENTRY_LABELS,
  accountBalance,
  accountClosingProblems,
  accountHasEntries,
  externalTotals,
  kindDirection,
  moneyEntryProblems,
  monthKey,
  nextActionNo,
  nextMoneyEntryNo,
  reversedEntryIds,
  spendCheck,
  summariseAccount,
} from './entries.ts';

const NOW = '2026-10-09T10:00:00';
const DATE = '2026-10-05';

function account(id: string, name: string, type: MoneyAccountType, over: Partial<MoneyAccount> = {}): MoneyAccount {
  return { id, name, type, status: 'Active', ...over };
}

/** An entry with every §7.1 field filled the boring way, plus what the test wants. */
function entry(no: number, over: Partial<MoneyEntry> = {}): MoneyEntry {
  return {
    id: `me-${no}`,
    no,
    date: DATE,
    accountId: 'bank',
    direction: 'In',
    amount: 1000,
    kind: 'OtherReceipt',
    actionId: `a-${no}`,
    createdBy: 'Tester',
    cleared: true,
    reconciled: false,
    createdAt: NOW,
    ...over,
  };
}

const BANK = account('bank', 'Meezan, main', 'bank');
const COUNTER = account('counter', 'Counter cash', 'counterCash');
const PETTY = account('petty', 'Petty cash', 'pettyCash');
const CHEQUES = account('chq', 'Cheques in hand', 'chequesInHand');
const ACCOUNTS = [BANK, COUNTER, PETTY, CHEQUES];

const ctx = (entries: readonly MoneyEntry[], over: { closedMonths?: string[] } = {}) => ({
  accounts: ACCOUNTS,
  entries,
  ...over,
});

describe('account balance (§6.1, §79.1)', () => {
  // §79.1: opening 1,172,000, in 1,380,000, out 1,292,000 → 1,260,000.
  const rows: MoneyEntry[] = [
    entry(1, { kind: 'OpeningBalance', amount: 1_172_000, date: '2026-10-01' }),
    entry(2, { kind: 'StudentPayment', amount: 520_000 }),
    entry(3, { kind: 'StudentPayment', amount: 160_000 }),
    entry(4, { kind: 'ChequeClearedIn', amount: 100_000 }),
    entry(5, { kind: 'TransferIn', amount: 600_000, actionId: 'a-1' }),
    entry(6, { kind: 'PayrollPayment', amount: 1_050_000, direction: 'Out', date: '2026-10-08' }),
    entry(7, { kind: 'BillPayment', amount: 150_000, direction: 'Out', date: '2026-10-08' }),
    entry(8, { kind: 'BillPayment', amount: 62_000, direction: 'Out', date: '2026-10-08' }),
    entry(9, { kind: 'TransferOut', amount: 30_000, direction: 'Out', actionId: 'a-2', date: '2026-10-08' }),
  ];

  it('is opening plus in minus out (§79.1)', () => {
    equal(accountBalance(rows, 'bank'), 1_260_000);
  });

  it('counts cleared entries only (§6.1)', () => {
    const uncleared = [...rows, entry(10, { amount: 5_000, cleared: false })];
    equal(accountBalance(uncleared, 'bank'), 1_260_000);
  });

  it('takes the date for the figure, not the list order (§12)', () => {
    equal(accountBalance(rows, 'bank', '2026-10-04'), 1_172_000);
    equal(accountBalance(rows, 'bank', '2026-10-05'), 1_172_000 + 520_000 + 160_000 + 100_000 + 600_000);
  });

  it('is per account — other accounts do not leak in', () => {
    equal(accountBalance(rows, 'counter'), 0);
  });
});

describe('the October sample (§13)', () => {
  // The full §13 table, built only from entries. Transfers share actions 1 and 2.
  const sample: MoneyEntry[] = [
    entry(1, { accountId: 'bank', kind: 'OpeningBalance', amount: 1_172_000, date: '2026-10-01' }),
    entry(2, { accountId: 'counter', kind: 'OpeningBalance', amount: 352_000, date: '2026-10-01' }),
    entry(3, { accountId: 'petty', kind: 'OpeningBalance', amount: 73_000, date: '2026-10-01' }),
    entry(4, { accountId: 'bank', kind: 'StudentPayment', amount: 520_000 }),
    entry(5, { accountId: 'bank', kind: 'StudentPayment', amount: 160_000 }),
    entry(6, { accountId: 'bank', kind: 'ChequeClearedIn', amount: 100_000 }),
    entry(7, { accountId: 'chq', kind: 'StudentPayment', amount: 38_000 }), // held, §18
    entry(8, { accountId: 'counter', kind: 'StudentPayment', amount: 640_000 }),
    entry(9, { accountId: 'bank', kind: 'PayrollPayment', amount: 1_050_000, direction: 'Out' }),
    entry(10, { accountId: 'bank', kind: 'BillPayment', amount: 150_000, direction: 'Out', payee: 'Aslam Properties' }),
    entry(11, { accountId: 'bank', kind: 'BillPayment', amount: 62_000, direction: 'Out' }),
    entry(12, { accountId: 'counter', kind: 'PayrollPayment', amount: 130_000, direction: 'Out' }),
    entry(13, { accountId: 'counter', kind: 'RefundToStudent', amount: 12_000, direction: 'Out' }),
    entry(14, { accountId: 'petty', kind: 'BillPayment', amount: 28_000, direction: 'Out' }),
    entry(15, { accountId: 'petty', kind: 'BillPayment', amount: 55_000, direction: 'Out' }),
    // Deposit of counter cash to the bank: 600,000, one action, two sides.
    entry(16, { accountId: 'counter', kind: 'TransferOut', amount: 600_000, direction: 'Out', actionId: 'a-1' }),
    entry(17, { accountId: 'bank', kind: 'TransferIn', amount: 600_000, actionId: 'a-1' }),
    // Petty cash top-up from the bank: 30,000.
    entry(18, { accountId: 'bank', kind: 'TransferOut', amount: 30_000, direction: 'Out', actionId: 'a-2' }),
    entry(19, { accountId: 'petty', kind: 'TransferIn', amount: 30_000, actionId: 'a-2' }),
  ];

  it('every account row closes at its §13 figure', () => {
    equal(accountBalance(sample, 'bank'), 1_260_000);
    equal(accountBalance(sample, 'counter'), 250_000);
    equal(accountBalance(sample, 'petty'), 20_000);
  });

  it('the columns of §13 come out of summariseAccount', () => {
    deepStrictEqual(summariseAccount(sample, BANK), {
      opening: 1_172_000, moneyIn: 1_380_000, moneyOut: 1_292_000, closing: 1_260_000,
    });
    deepStrictEqual(summariseAccount(sample, COUNTER), {
      opening: 352_000, moneyIn: 640_000, moneyOut: 742_000, closing: 250_000,
    });
    deepStrictEqual(summariseAccount(sample, PETTY), {
      opening: 73_000, moneyIn: 30_000, moneyOut: 83_000, closing: 20_000,
    });
  });

  it('the transfers cancel out and the totals prove themselves (§13)', () => {
    const t = externalTotals(sample, ACCOUNTS);
    deepStrictEqual(t, {
      openingTotal: 1_597_000,
      moneyIn: 1_420_000,
      moneyOut: 1_487_000,
      net: -67_000,
      closingTotal: 1_530_000,
    });
    equal(t.openingTotal + t.net, t.closingTotal);
  });
});

describe('entry rules (§6, §7)', () => {
  it('the §7.2 direction column holds for every kind', () => {
    const expected: Record<MoneyEntryKind, 'In' | 'Out' | 'Either'> = {
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
    for (const kind of Object.keys(expected) as MoneyEntryKind[]) {
      equal(kindDirection(kind), expected[kind], kind);
      ok(MONEY_ENTRY_LABELS[kind].length > 0, kind);
    }
  });

  it('refuses a direction that fights its kind (§7.2)', () => {
    const problems = moneyEntryProblems(entry(1, { kind: 'StudentPayment', direction: 'Out' }), ctx([]));
    ok(problems.some((p) => p.includes('always In')));
  });

  it('refuses amounts that are not positive whole rupees (§7.1)', () => {
    ok(moneyEntryProblems(entry(1, { amount: 0 }), ctx([])).length > 0);
    ok(moneyEntryProblems(entry(2, { amount: -500 }), ctx([])).length > 0);
    ok(moneyEntryProblems(entry(3, { amount: 100.5 }), ctx([])).length > 0);
    equal(moneyEntryProblems(entry(4, { amount: 100 }), ctx([])).length, 0);
  });

  it('refuses unknown, Closed and duplicate-account entries (§6)', () => {
    ok(moneyEntryProblems(entry(1, { accountId: 'ghost' }), ctx([])).some((p) => p.includes('does not exist')));
    const shut = account('shut', 'Old counter', 'counterCash', { status: 'Closed' });
    ok(moneyEntryProblems(entry(2, { accountId: 'shut' }), { accounts: [shut], entries: [] }).some((p) => p.includes('Closed')));
  });

  it('reversal entries answer to §34', () => {
    const paid = entry(1, { kind: 'StudentPayment', amount: 5_000 });
    const base = ctx([paid]);
    // A reversal must name its target.
    ok(moneyEntryProblems(entry(2, { kind: 'Reversal', direction: 'Out', amount: 5_000, reason: 'Wrong counter' }), base)
      .some((p) => p.includes('name the entry')));
    // The right shape passes.
    const good = entry(2, { kind: 'Reversal', direction: 'Out', amount: 5_000, reverses: paid.id, reason: 'Wrong counter' });
    equal(moneyEntryProblems(good, base).length, 0);
    // …but not twice, and not a reasonless one, and not a reversal of a reversal.
    const twice = ctx([paid, good]);
    ok(moneyEntryProblems(entry(3, { ...good, id: 'me-3', no: 3 }), twice).some((p) => p.includes('already reversed')));
    // A book that already holds a reversal stays valid when it is re-checked —
    // the entry is not its own second reversal (§34).
    equal(moneyEntryProblems(twice.entries[1], twice).length, 0);
    ok(moneyEntryProblems(entry(4, { ...good, id: 'me-4', no: 4, reason: '' }), base).some((p) => p.includes('needs a reason')));
    ok(moneyEntryProblems(entry(5, { kind: 'Reversal', direction: 'In', amount: 5_000, reverses: good.id, reason: 'Undo the undo' }), twice)
      .some((p) => p.includes('not itself reversed')));
    deepStrictEqual(reversedEntryIds([paid, good]), new Set([paid.id]));
  });

  it('a cash difference needs its note and can go either way (§11)', () => {
    ok(moneyEntryProblems(entry(1, { kind: 'CashDifference', direction: 'Out', amount: 500 }), ctx([]))
      .some((p) => p.includes('needs a reason')));
    equal(moneyEntryProblems(
      entry(2, { kind: 'CashDifference', direction: 'Out', amount: 500, reason: 'Count short by 500' }),
      ctx([]),
    ).length, 0);
  });

  it('the opening balance is entered once, reversal first (§6, §78.1)', () => {
    const open = entry(1, { accountId: 'petty', kind: 'OpeningBalance', amount: 20_000, date: '2026-10-01' });
    ok(moneyEntryProblems(entry(2, { accountId: 'petty', kind: 'OpeningBalance', amount: 25_000 }), ctx([open]))
      .some((p) => p.includes('entered once')));
    const fixed = entry(3, { accountId: 'petty', kind: 'Reversal', direction: 'Out', amount: 20_000, reverses: open.id, reason: 'Counted again' });
    equal(moneyEntryProblems(entry(4, { accountId: 'petty', kind: 'OpeningBalance', amount: 25_000 }), ctx([open, fixed])).length, 0);
  });

  it('closed months refuse dated entries (§9, §34)', () => {
    equal(monthKey(DATE), '2026-10');
    ok(moneyEntryProblems(entry(1), ctx([], { closedMonths: ['2026-10'] })).some((p) => p.includes('closed month')));
    ok(moneyEntryProblems(entry(2), ctx([], { closedMonths: ['2026-09'] })).length === 0);
  });

  it('entry numbers never come back (§7.1)', () => {
    equal(nextMoneyEntryNo([]), 1);
    equal(nextMoneyEntryNo([entry(1), entry(7)]), 8);
    equal(nextActionNo([entry(1, { actionId: 'a-3' }), entry(2, { actionId: 'a-1' })]), 4);
    equal(nextActionNo([entry(1, { actionId: 'free-form' })]), 1);
    ok(moneyEntryProblems(entry(1), ctx([entry(1)])).some((p) => p.includes('numbers only go forward')));
  });
});

describe('cash cannot go negative; a bank may, with a warning (§6.2–§6.3, §79.3–4)', () => {
  const pettyRows = [entry(1, { accountId: 'petty', kind: 'OpeningBalance', amount: 20_000 })];

  it('blocks the 25,000 voucher against 20,000 of petty cash (§79.3)', () => {
    const check = spendCheck(ACCOUNTS, pettyRows, 'petty', 25_000);
    ok(check.problem);
    ok(check.problem!.includes('Not enough cash in Petty cash'));
    ok(check.problem!.includes('Top up first'));
  });

  it('blocks the same for counter cash', () => {
    const rows = [entry(1, { accountId: 'counter', kind: 'OpeningBalance', amount: 10_000 })];
    ok(spendCheck(ACCOUNTS, rows, 'counter', 10_001).problem);
    equal(spendCheck(ACCOUNTS, rows, 'counter', 10_000).problem, undefined);
  });

  it('a bank overdraft is a warning, not a block (§79.4)', () => {
    const rows = [entry(1, { kind: 'OpeningBalance', amount: 10_000 })];
    const check = spendCheck(ACCOUNTS, rows, 'bank', 15_000);
    equal(check.problem, undefined);
    ok(check.warning);
    ok(check.warning!.includes('below zero'));
  });

  it('a wallet warns too (§6.3)', () => {
    const wallet = account('w', 'JazzCash', 'wallet');
    const rows = [entry(1, { accountId: 'w', kind: 'OpeningBalance', amount: 2_000 })];
    const check = spendCheck([wallet], rows, 'w', 3_000);
    equal(check.problem, undefined);
    ok(check.warning);
  });
});

describe('closing accounts (§6.4)', () => {
  const rows = [entry(1, { accountId: 'petty', kind: 'OpeningBalance', amount: 20_000 })];

  it('will not close an account that still holds money', () => {
    ok(accountClosingProblems(rows, PETTY).some((p) => p.includes('zero balance')));
  });

  it('closes at zero', () => {
    const emptied = [...rows, entry(2, { accountId: 'petty', kind: 'BankCharge', direction: 'Out', amount: 20_000 })];
    equal(accountClosingProblems(emptied, PETTY).length, 0);
  });

  it('an account with entries cannot be deleted, an unused one can', () => {
    equal(accountHasEntries(rows, 'petty'), true);
    equal(accountHasEntries(rows, 'counter'), false);
  });
});
