// ============================================
// MediCMS Desktop — Student statement tests (§9.1, §55)
// §9.1's sample for Bilal Ahmed, 1 January to 9 October 2026: brought forward
// 47,000, a 61,000 charge, 55,000 of payments, closing 53,000 due, one unpaid
// charge 81 days overdue in the 61–90 bucket.
// Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';

import type { LedgerEntry } from '../ledger/types.ts';
import { studentStatement } from './statement.ts';

const TODAY = '2026-10-09';

function charge(entryNo: number, amount: number, date: string, dueDate: string, term: number): LedgerEntry {
  return {
    id: `e-987-${entryNo}`,
    studentSno: 987,
    entryNo,
    date,
    type: 'FeeCharge',
    amount,
    description: `Term ${term} fee charge`,
    term,
    dueDate,
    lines: [{ name: 'Tuition', amount }],
    createdBy: 'Admin',
    createdAt: `${date}T09:00:00`,
    balanceAfter: 0,
  };
}

function payment(entryNo: number, amount: number, date: string, reference: string): LedgerEntry {
  return {
    id: `e-987-${entryNo}`,
    studentSno: 987,
    entryNo,
    date,
    type: 'Payment',
    amount,
    description: 'Payment',
    reference,
    paymentMode: 'Cash',
    createdBy: 'Kamran Ali',
    createdAt: `${date}T11:00:00`,
    balanceAfter: 0,
  };
}

/** §9.1: a 47,000 charge carried in from 2025, then the 2026 rows. */
function bilal(): LedgerEntry[] {
  return [
    charge(1, 47_000, '2025-12-31', '2026-01-14', 2),
    charge(2, 61_000, '2026-07-05', '2026-07-20', 3),
    payment(3, 30_000, '2026-08-12', 'R-0388'),
    payment(4, 25_000, '2026-10-09', 'R-1043'),
  ];
}

describe('student statement — §9.1 sample', () => {
  const statement = studentStatement(bilal(), { from: '2026-01-01', to: '2026-10-09', today: TODAY });

  it('brings the pre-period charge forward as one figure', () => {
    equal(statement.broughtForward, 47_000);
  });

  it('lists the period entries with a running balance', () => {
    deepStrictEqual(
      statement.rows.map((row) => [row.entry.entryNo, row.charges, row.credits, row.balance]),
      [
        [2, 61_000, 0, 108_000],
        [3, 0, 30_000, 78_000],
        [4, 0, 25_000, 53_000],
      ],
    );
  });

  it('summarises brought forward, charges, concessions, payments and balance', () => {
    deepStrictEqual(statement.summary, {
      broughtForward: 47_000,
      charges: 61_000,
      concessions: 0,
      payments: 55_000,
      credits: 55_000,
      balance: 53_000,
    });
  });

  it('lists the unpaid charge with its due date and days overdue', () => {
    deepStrictEqual(statement.unpaid.map((row) => [row.label, row.unpaid, row.dueDate, row.daysOverdue]), [
      ['Term 3', 53_000, '2026-07-20', 81],
    ]);
    equal(statement.unpaidTotal, 53_000);
  });

  it('puts the arrears in the 61–90 day bucket — 20 July to 9 October is 81 days', () => {
    equal(statement.ageing.rows.find((row) => row.term === 3)?.daysOverdue, 81);
    equal(statement.ageing.oldestDays, 81);
  });
});

describe('student statement — variants and edges', () => {
  it('dues only prints the summary and the unpaid charges, not the rows', () => {
    const statement = studentStatement(bilal(), {
      from: '2026-01-01',
      to: '2026-10-09',
      today: TODAY,
      layout: 'DuesOnly',
    });
    deepStrictEqual(statement.rows, []);
    equal(statement.summary.balance, 53_000);
    equal(statement.unpaidTotal, 53_000);
  });

  it('a period that starts after everything still shows the balance as brought forward', () => {
    const statement = studentStatement(bilal(), { from: '2026-10-10', to: '2026-10-31', today: TODAY });
    equal(statement.rows.length, 0);
    equal(statement.broughtForward, 53_000);
    equal(statement.summary.charges, 0);
    equal(statement.summary.balance, 53_000);
  });

  it('a student with nothing owed has no unpaid charges and a clean ageing line', () => {
    const statement = studentStatement([], { from: '2026-01-01', to: '2026-10-09', today: TODAY });
    deepStrictEqual(statement.rows, []);
    deepStrictEqual(statement.unpaid, []);
    equal(statement.summary.balance, 0);
    equal(statement.ageing.overdueTotal, 0);
  });
});
