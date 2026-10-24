// ============================================
// MediCMS Desktop — Dashboard metrics tests (Feature 2 §13, §14)
// The Fees card's overdue figure and the defaulter ranking must equal the
// directory's Overdue tab, so both are pinned to the same ageing core here.
// Run with: npm run test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';

import type { LedgerEntry, StudentWithBalance } from '@/types';
import type { MetricsInput } from './dashboardMetrics.ts';
import { computeDashboardMetrics } from './dashboardMetrics.ts';

const TODAY = '2026-10-09';

function student(sno: number, over: Partial<StudentWithBalance> = {}): StudentWithBalance {
  return {
    sno,
    name: `Student ${sno}`,
    fatherName: 'Father',
    contact: null,
    address: null,
    cnic: null,
    regDate: '2026-04-01',
    course: 'Paramedics',
    program: 'Health',
    batch: 'Batch-A',
    session: 2026,
    semester: '2nd',
    struckOff: false,
    isTestRecord: false,
    synced: true,
    computedBalance: 0,
    badge: 'active',
    ...over,
  };
}

function entry(no: number, sno: number, over: Partial<LedgerEntry> = {}): LedgerEntry {
  const type = over.type ?? 'FeeCharge';
  return {
    id: `e-${sno}-${no}`,
    studentSno: sno,
    entryNo: no,
    date: '2026-04-01',
    type,
    amount: 1000,
    description: `${type} ${no}`,
    createdBy: 'Tester',
    createdAt: '2026-04-01T09:00:00',
    balanceAfter: 0,
    ...over,
  };
}

const charge = (no: number, sno: number, amount: number, dueDate: string) =>
  entry(no, sno, { type: 'FeeCharge', term: 1, amount, dueDate, description: 'Term 1 fee charge' });

const cashPayment = (no: number, sno: number, amount: number, date: string) =>
  entry(no, sno, { type: 'Payment', amount, date, reference: `R-${no}`, paymentMode: 'Cash' });

function run(students: StudentWithBalance[], ledger: LedgerEntry[]) {
  const input: MetricsInput = {
    seesOwnOnly: false,
    seesMoney: true,
    userName: 'Tester',
    today: TODAY,
    students,
    ledger,
    bank: [],
    expenses: [],
    budgets: [],
    books: [],
    batches: [],
    templates: [],
  };
  return computeDashboardMetrics(input);
}

describe('Fees card overdue figures (§14)', () => {
  // Student 1: 50,000 charged 1 Aug, 10,000 paid — 40,000 overdue (69 days).
  // Student 2: 20,000 charged 1 Nov — not due yet. Student 3 is struck off.
  const ledger = [
    charge(1, 1, 50_000, '2026-08-01'),
    cashPayment(2, 1, 10_000, '2026-09-10'),
    charge(1, 2, 20_000, '2026-11-01'),
  ];
  const students = [
    student(1, { computedBalance: 40_000 }),
    student(2, { computedBalance: 20_000 }),
    student(3, { computedBalance: 15_000, struckOff: true }),
  ];
  const m = run(students, ledger);

  it('splits the active dues into total and overdue', () => {
    equal(m.outstandingDues, 60_000);
    equal(m.overdueDues, 40_000);
  });

  it('reports struck-off dues separately, never as overdue', () => {
    equal(m.struckOffDues, 15_000);
  });

  it('ranks defaulters by overdue and names the days overdue', () => {
    deepStrictEqual(
      m.topDefaulters.map((r) => [r.sno, r.overdue, r.daysOverdue]),
      [[1, 40_000, 69]],
    );
  });
});

describe('defaulter ranking (§13)', () => {
  const ledger = [
    charge(1, 1, 30_000, '2026-09-01'),
    charge(1, 2, 90_000, '2026-05-01'),
  ];
  const students = [
    student(1, { computedBalance: 30_000 }),
    student(2, { computedBalance: 90_000 }),
  ];
  const m = run(students, ledger);

  it('puts the biggest overdue first', () => {
    deepStrictEqual(m.topDefaulters.map((r) => r.sno), [2, 1]);
  });

  it('carries the total balance for context beside the overdue figure', () => {
    deepStrictEqual(
      m.topDefaulters.map((r) => [r.overdue, r.balance]),
      [[90_000, 90_000], [30_000, 30_000]],
    );
  });
});

describe('due-date boundary (§24.1)', () => {
  const ledger = [charge(1, 1, 5_000, TODAY)];
  const m = run([student(1, { computedBalance: 5_000 })], ledger);

  it('a charge due today is not yet overdue, and the list stays empty', () => {
    equal(m.overdueDues, 0);
    deepStrictEqual(m.topDefaulters, []);
  });
});

describe('active counts and lifecycle (§26.5)', () => {
  it('takes completed and on-leave students out of the active counts and dues', () => {
    const ledger = [
      charge(1, 1, 10_000, '2026-08-01'),
      charge(2, 2, 10_000, '2026-08-01'),
      charge(3, 3, 10_000, '2026-08-01'),
      charge(4, 4, 10_000, '2026-08-01'),
    ];
    const students = [
      student(1, { computedBalance: 10_000 }),
      student(2, { computedBalance: 10_000, completed: true }),
      student(3, { computedBalance: 10_000, onLeave: true }),
      student(4, { computedBalance: 10_000, struckOff: true }),
    ];
    const m = run(students, ledger);
    equal(m.activeCount, 1);
    equal(m.outstandingDues, 10_000);
    deepStrictEqual(m.topDefaulters.map((r) => r.sno), [1]);
  });
});
