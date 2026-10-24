// ============================================
// MediCMS Desktop — Finance core: month close (§48) tests
// §79.32 an unreconciled account blocks the close, §79.33 October cannot close
// while September is open, §79.34 reopening needs a reason and flags what came
// after, and the checklist stays the doc's seven items in the doc's order.
// Run: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';

import {
  closeMonthProblems,
  earlierOpenMonth,
  entriesAddedAfterClose,
  monthChecklist,
  monthStateOf,
  pettyCountedInMonth,
  reopenMonthProblems,
  type MonthClosure,
  type MonthCloseFacts,
} from './monthClose.ts';
import type { MoneyEntry } from './types.ts';
import type { PettyCount } from './pettyCash.ts';

function facts(over: Partial<MonthCloseFacts> = {}): MonthCloseFacts {
  return {
    month: '2026-10',
    entryMonths: ['2026-10'],
    closedMonths: [],
    closures: [],
    accountsToReconcile: 0,
    openDays: 0,
    pettyCounted: true,
    approvalsPending: 0,
    unresolvedLines: 0,
    payrollUsed: false,
    payrollFinalised: true,
    staleCheques: 0,
    ...over,
  };
}

function entry(over: Partial<MoneyEntry> = {}): MoneyEntry {
  return {
    id: 'me-1',
    no: 1,
    date: '2026-09-30',
    accountId: 'acc-bank',
    direction: 'In',
    amount: 40_000,
    kind: 'TransferIn',
    actionId: 'a-1',
    createdBy: 'Saba Noor',
    cleared: true,
    reconciled: false,
    createdAt: '2026-09-30T10:00:00',
    ...over,
  };
}

describe('month close (§48)', () => {
  it('the checklist is the doc’s seven items, and a clean month closes', () => {
    const items = monthChecklist(facts());
    deepStrictEqual(items.map((item) => item.id), [1, 2, 3, 4, 5, 6, 7]);
    equal(items.filter((item) => item.required).length, 5);
    equal(items[6].required, false);
    deepStrictEqual(closeMonthProblems(facts()), []);
  });

  it('§79.32: one unreconciled account blocks the close', () => {
    const problems = closeMonthProblems(facts({ accountsToReconcile: 1 }));
    equal(problems.length, 1);
    equal(problems[0], 'Item 1 is not done: Every bank account and wallet is reconciled through the end of the month.');
  });

  it('§79.33: October cannot close while September is open', () => {
    const problems = closeMonthProblems(facts({ entryMonths: ['2026-09', '2026-10'] }));
    equal(problems[0], '2026-09 is still open. Close it first (§73.1).');
    equal(earlierOpenMonth('2026-10', ['2026-08', '2026-09', '2026-10'], ['2026-09']), '2026-08');
    equal(earlierOpenMonth('2026-10', ['2026-09'], ['2026-09']), undefined);
  });

  it('payroll item 6 is required only when payroll is used, and item 7 never blocks', () => {
    const withPayroll = monthChecklist(facts({ payrollUsed: true, payrollFinalised: false }));
    deepStrictEqual([withPayroll[5].required, withPayroll[5].done], [true, false]);
    const stale = monthChecklist(facts({ staleCheques: 2 }));
    deepStrictEqual([stale[6].done, stale[6].detail], [true, '2 stale']);
    deepStrictEqual(closeMonthProblems(facts({ staleCheques: 2 })), []);
  });

  it('§79.34: reopening needs a closed month and a reason, and flags later entries', () => {
    const closures: MonthClosure[] = [
      {
        month: '2026-09',
        state: 'Closed',
        closedBy: 'Dr. Imran Shah',
        closedAt: '2026-10-06T09:00:00',
        reopenedBy: 'Dr. Imran Shah',
        reopenedAt: '2026-10-08T09:00:00',
        reopenReason: 'Bank charge arrived late',
      },
    ];
    equal(monthStateOf('2026-09', closures), 'Closed');
    deepStrictEqual(reopenMonthProblems('2026-09', closures, 'a reason of long enough'), []);
    equal(reopenMonthProblems('2026-10', closures, 'a reason of long enough')[0], '2026-10 is not closed, so there is nothing to reopen (§48.4).');
    equal(reopenMonthProblems('2026-09', closures, 'too short')[0], 'A reopen needs a reason of at least 10 characters (§48.4).');

    const flagged = entriesAddedAfterClose(
      [
        entry({ id: 'me-1', createdAt: '2026-10-07T10:00:00' }),
        entry({ id: 'me-2', no: 2, createdAt: '2026-10-09T10:00:00' }),
        entry({ id: 'me-3', no: 3, date: '2026-10-02', createdAt: '2026-10-09T10:00:00' }),
      ],
      closures,
    );
    deepStrictEqual([...flagged], ['me-2']);
  });
});

// --- Item 3: the petty cash count (§48.2.3) ----------------------------------

describe('pettyCountedInMonth (§48.2.3)', () => {
  const count = (date: string, over: Partial<PettyCount> = {}): PettyCount => ({
    date,
    accountId: 'acc-petty',
    expected: 73_000,
    counted: 73_000,
    difference: 0,
    countedBy: 'Saba Noor',
    at: `${date}T18:00:00`,
    ...over,
  });

  it('finds the count that closes the month, even when it is an even count that posted no entry', () => {
    const found = pettyCountedInMonth([count('2026-10-31')], '2026-10');
    equal(found?.counted, 73_000);
  });

  it('the last count of the month is the one reported', () => {
    const found = pettyCountedInMonth([count('2026-10-05'), count('2026-10-31', { counted: 70_000, difference: -3_000 })], '2026-10');
    equal(found?.date, '2026-10-31');
  });

  it('a count from another month does not close this one', () => {
    equal(pettyCountedInMonth([count('2026-09-30')], '2026-10'), undefined);
  });
});
