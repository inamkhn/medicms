// ============================================
// MediCMS Desktop — Finance core: budgets (§47) tests
// §79.31 the October sample — 385,000 used of 440,000 (88 percent), Rent at 100
// percent is a warning, Utilities and Other are notices — plus the Staff row
// hidden from a non-Admin and the "unpaid counts as committed" rule (§46).
// Run: npm test
// ============================================

import { describe, it } from 'node:test';
import { deepStrictEqual, equal } from 'node:assert/strict';

import { DEFAULT_COST_CATEGORIES } from './categories.ts';
import {
  budgetOf,
  budgetReport,
  budgetUsage,
  copyBudgets,
  previousMonth,
  sameMonthLastYear,
  setBudgetLine,
  spreadYearly,
  type BudgetLine,
} from './budgets.ts';
import type { Bill, BillPayment } from './bills.ts';

function bill(over: Partial<Bill> & Pick<Bill, 'categoryId' | 'amount'>): Bill {
  return {
    id: `b-${over.no ?? '1'}`,
    no: 'B-0001',
    description: 'a cost',
    date: '2026-10-03',
    attachments: [],
    status: 'Unpaid',
    adjustments: [],
    createdBy: 'Saba Noor',
    createdAt: '2026-10-03T10:00:00',
    ...over,
  };
}

const LINES: BudgetLine[] = [
  { categoryId: 'cat-rent', month: '2026-10', amount: 150_000 },
  { categoryId: 'cat-utilities-electric', month: '2026-10', amount: 70_000 },
  { categoryId: 'cat-clinical-training', month: '2026-10', amount: 120_000 },
  { categoryId: 'cat-books-stationery', month: '2026-10', amount: 40_000 },
  { categoryId: 'cat-other', month: '2026-10', amount: 60_000 },
];

const BILLS: Bill[] = [
  bill({ id: 'b-231', no: 'B-0231', categoryId: 'cat-rent', amount: 150_000, status: 'Paid' }),
  bill({ id: 'b-236', no: 'B-0236', categoryId: 'cat-utilities-electric', amount: 62_000, status: 'Paid' }),
  bill({ id: 'b-238', no: 'B-0238', categoryId: 'cat-clinical-training', amount: 90_000, status: 'Unpaid' }),
  bill({ id: 'b-240', no: 'B-0240', categoryId: 'cat-books-stationery', amount: 28_000, status: 'Paid' }),
  bill({ id: 'b-241', no: 'B-0241', categoryId: 'cat-other', amount: 55_000, status: 'Paid' }),
];

const PAYMENTS: BillPayment[] = [
  { billId: 'b-231', amount: 150_000, voucherNo: 'PV-0412' },
  { billId: 'b-236', amount: 62_000, voucherNo: 'PV-0418' },
  { billId: 'b-240', amount: 28_000, voucherNo: 'PV-0421' },
  { billId: 'b-241', amount: 55_000, voucherNo: 'PV-0422' },
];

describe('budgets (§47)', () => {
  it('§79.31: the October sample totals 440,000 budget against 385,000 used (88 percent)', () => {
    const report = budgetReport({
      categories: DEFAULT_COST_CATEGORIES,
      lines: LINES,
      bills: BILLS,
      payments: PAYMENTS,
      month: '2026-10',
      showStaff: true,
    });
    equal(report.total.budget, 440_000);
    equal(report.total.paid, 295_000);
    equal(report.total.unpaid, 90_000);
    equal(report.total.used, 385_000);
    equal(budgetUsage(report.total.used, report.total.budget).pct, 88);

    const rent = report.rows.find((row) => row.categoryId === 'cat-rent');
    deepStrictEqual([rent?.pct, rent?.level], [100, 'warning']);
    const utilities = report.rows.find((row) => row.categoryId === 'cat-utilities-electric');
    deepStrictEqual([utilities?.pct, utilities?.level], [89, 'notice']);
    const clinical = report.rows.find((row) => row.categoryId === 'cat-clinical-training');
    // §46: an unpaid bill counts as committed, so the budget is not "saved".
    deepStrictEqual([clinical?.unpaid, clinical?.level], [90_000, 'ok']);
  });

  it('§47: the Staff row is hidden from a non-Admin, and its figures leave the totals', () => {
    const lines = [...LINES, { categoryId: 'cat-sal-teaching', month: '2026-10', amount: 100_000 }];
    const bills = [...BILLS, bill({ id: 'b-250', no: 'B-0250', categoryId: 'cat-sal-teaching', amount: 90_000 })];
    const forAdmin = budgetReport({ categories: DEFAULT_COST_CATEGORIES, lines, bills, payments: PAYMENTS, month: '2026-10', showStaff: true });
    const forAccountant = budgetReport({ categories: DEFAULT_COST_CATEGORIES, lines, bills, payments: PAYMENTS, month: '2026-10', showStaff: false });
    equal(forAdmin.total.budget, 540_000);
    equal(forAccountant.total.budget, 440_000);
    equal(forAccountant.hiddenStaffRows, 1);
    equal(forAccountant.rows.some((row) => row.group === 'staff'), false);
  });

  it('a month with no cost and no budget shows nothing; another month is untouched', () => {
    const report = budgetReport({
      categories: DEFAULT_COST_CATEGORIES,
      lines: LINES,
      bills: BILLS,
      payments: PAYMENTS,
      month: '2026-11',
      showStaff: true,
    });
    equal(report.rows.length, 0);
    equal(report.total.budget, 0);
  });

  it('writes, clears, copies and spreads the grid', () => {
    let lines: BudgetLine[] = [];
    lines = setBudgetLine(lines, 'cat-rent', '2026-10', 150_000);
    equal(budgetOf(lines, 'cat-rent', '2026-10'), 150_000);
    lines = setBudgetLine(lines, 'cat-rent', '2026-10', 0);
    equal(budgetOf(lines, 'cat-rent', '2026-10'), 0);

    const copied = copyBudgets(LINES, '2026-09', '2026-10');
    deepStrictEqual(copied.length, 0);

    const spread = spreadYearly('cat-rent', 2027, 1_800_000);
    equal(spread.length, 12);
    equal(spread[0].amount, 150_000);
    equal(spread[11].month, '2027-12');
  });

  it('finds the previous month and the same month last year across a year boundary', () => {
    equal(previousMonth('2026-01'), '2025-12');
    equal(previousMonth('2026-10'), '2026-09');
    equal(sameMonthLastYear('2026-10'), '2025-10');
  });
});
