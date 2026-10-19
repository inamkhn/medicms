// ============================================
// MediCMS Desktop — Staff & Payroll: overview/report tests (§39, §41, §45–§46, §58, §64.8)
// Proves the payment position splits by mode and never calls a pending cheque a
// payment, the health checks only fire on live items, and — the load-bearing one —
// an Admin-only report hands a non-Admin an empty masked table so no export or
// print built from it can leak a named rupee. Pure; no clock. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { equal, notEqual, ok } from 'node:assert/strict';

import {
  ageMonths,
  buildPayrollReport,
  computePaymentPosition,
  payrollHealthChecks,
  runForMonth,
  workforceCounts,
} from './reports.ts';
import type { PayrollReportData } from './reports.ts';
import type {
  PayrollDisbursement,
  PayrollLine,
  PayrollPayoutBatch,
  PayrollPayable,
  PayrollRun,
  Staff,
} from './types.ts';

const ADMIN = 'Admin';
const ACCOUNTANT = 'Accountant';

function payable(lineId: string, net: number, staffId = 'st-1'): PayrollPayable {
  return { id: `${lineId}~payable`, payrollLineId: lineId, runId: 'r-1', staffId, net } as PayrollPayable;
}

function disb(batchId: string, amount: number, state: PayrollDisbursement['state'], chequeId?: string): PayrollDisbursement {
  return { id: `d-${batchId}-${amount}-${state}`, batchId, payrollLineId: 'l-1', direction: 'Out', amount, actualDate: '2026-11-06', state, chequeId } as PayrollDisbursement;
}

const batches: PayrollPayoutBatch[] = [
  { id: 'b-bank', mode: 'Bank transfer' } as PayrollPayoutBatch,
  { id: 'b-cash', mode: 'Cash' } as PayrollPayoutBatch,
  { id: 'b-cheque', mode: 'Cheque' } as PayrollPayoutBatch,
];

function emptyData(overrides: Partial<PayrollReportData> = {}): PayrollReportData {
  return {
    staff: [], payStructures: [], workInputs: [], runs: [], lines: [], payables: [],
    costPostings: [], advances: [], advanceEvents: [], payoutBatches: [], payoutAllocations: [], disbursements: [],
    ...overrides,
  };
}

describe('the payment position is derived and split by mode (§41, §46.1)', () => {
  it('keeps a pending cheque out of cleared money out (§41)', () => {
    const pos = computePaymentPosition(
      [payable('l-1', 1260000)],
      [disb('b-bank', 1050000, 'Posted'), disb('b-cash', 130000, 'Posted'), disb('b-cheque', 80000, 'Posted', 'ch-1')],
      batches,
    );
    equal(pos.bank, 1050000);
    equal(pos.cash, 130000);
    equal(pos.chequePending, 80000);
    equal(pos.chequeCleared, 0);
    equal(pos.clearedTotal, 1180000);
    equal(pos.toDisburse, 0);
  });

  it('clearing the cheque moves it into money out (§41)', () => {
    const pos = computePaymentPosition(
      [payable('l-1', 1260000)],
      [disb('b-bank', 1050000, 'Posted'), disb('b-cash', 130000, 'Posted'), disb('b-cheque', 80000, 'Cleared', 'ch-1')],
      batches,
    );
    equal(pos.chequeCleared, 80000);
    equal(pos.chequePending, 0);
    equal(pos.clearedTotal, 1260000);
  });

  it('an unpaid approved run shows its whole net as still to disburse (§29)', () => {
    const pos = computePaymentPosition([payable('l-1', 1260000)], [], batches);
    equal(pos.toDisburse, 1260000);
    equal(pos.clearedTotal, 0);
  });
});

describe('workforce and the month run (§46.1)', () => {
  it('counts by status and left-in-month', () => {
    const staff = [
      { employmentStatus: 'Active' } as Staff,
      { employmentStatus: 'On leave' } as Staff,
      { employmentStatus: 'Left', leavingDate: '2026-10-15' } as Staff,
      { employmentStatus: 'Left', leavingDate: '2026-09-01' } as Staff,
    ];
    const counts = workforceCounts(staff, '2026-10');
    equal(counts.active, 1);
    equal(counts.onLeave, 1);
    equal(counts.leftThisMonth, 1);
  });

  it('prefers the approved standard run for a month (§46.2)', () => {
    const runs = [
      { id: 'r-d', serviceMonth: '2026-10', kind: 'Standard', calculationState: 'Draft', createdAt: '2026-10-01' } as PayrollRun,
      { id: 'r-a', serviceMonth: '2026-10', kind: 'Standard', calculationState: 'Approved', createdAt: '2026-10-05' } as PayrollRun,
      { id: 'r-s', serviceMonth: '2026-10', kind: 'Supplemental', calculationState: 'Approved', createdAt: '2026-10-06' } as PayrollRun,
    ];
    equal(runForMonth(runs, '2026-10')?.id, 'r-a');
  });
});

describe('health checks fire only on live items (§39, §42)', () => {
  it('surfaces a missing pay structure and the unfinalized month', () => {
    const data = emptyData({
      staff: [{ id: 'st-9', joiningDate: '2020-01-01', employmentStatus: 'Active' } as unknown as Staff],
      payStructures: [],
    });
    const checks = payrollHealthChecks(data, '2026-10', '2026-11');
    ok(checks.some((c) => c.id === 'missing-structure'));
    ok(checks.some((c) => c.id === 'not-finalized'));
  });

  it('reports an unpaid approved line and a stale pending cheque', () => {
    const data = emptyData({
      runs: [{ id: 'r-1', serviceMonth: '2026-10', kind: 'Standard', calculationState: 'Approved', totals: { netPayable: 52000 } } as unknown as PayrollRun],
      payables: [payable('l-1', 52000)],
      disbursements: [disb('b-cheque', 52000, 'Posted', 'ch-1')],
      payoutBatches: batches,
    });
    data.disbursements[0].actualDate = '2025-01-06';
    const checks = payrollHealthChecks(data, '2026-10', '2026-11');
    ok(checks.some((c) => c.id === 'cheques-pending'));
    ok(checks.some((c) => c.id === 'stale-cheque'));
    // A pending cheque commits the payable (stillPayable 0), so it is not counted
    // as still-unpaid — §29 treats an issued cheque as already owed-and-covered.
    ok(!checks.some((c) => c.id === 'approved-unpaid'));
  });

  it('flags an approved line with no settlement at all (§39)', () => {
    const data = emptyData({
      runs: [{ id: 'r-1', serviceMonth: '2026-10', kind: 'Standard', calculationState: 'Approved', totals: { netPayable: 52000 } } as unknown as PayrollRun],
      payables: [payable('l-1', 52000)],
    });
    const checks = payrollHealthChecks(data, '2026-10', '2026-11');
    ok(checks.some((c) => c.id === 'approved-unpaid'));
  });
});

describe('reports honour the role projection (§43, §58, integrity 8)', () => {
  const approvedRun = { id: 'r-1', serviceMonth: '2026-10', kind: 'Standard', calculationState: 'Approved', totals: { gross: 1300000, advanceRecoveries: 40000, netPayable: 1260000 } } as unknown as PayrollRun;

  it('payroll summary aggregates monthly (§58.2)', () => {
    const table = buildPayrollReport('payroll-summary', emptyData({ runs: [approvedRun], payables: [payable('l-1', 1260000)] }), ACCOUNTANT, { currentMonth: '2026-11' });
    equal(table.privileged, true);
    const row = table.rows.find((r) => r.month === '2026-10');
    notEqual(row, undefined);
    equal(row!.gross, 1300000);
    equal(row!.net, 1260000);
  });

  it('an Admin-only report hands a non-Admin an empty masked table (§58)', () => {
    const table = buildPayrollReport('staff-earnings', emptyData(), ACCOUNTANT, { currentMonth: '2026-11' });
    equal(table.adminOnly, true);
    equal(table.privileged, false);
    equal(table.rows.length, 0);
    ok(table.note && /Admin-only/.test(table.note));
  });

  it('the same report is populated for an Admin (§40)', () => {
    const lines = [{ id: 'l-1', runId: 'r-1', staffId: 'st-1', gross: 62000, recoveries: 10000, net: 52000 } as unknown as PayrollLine];
    const table = buildPayrollReport('staff-earnings', emptyData({ runs: [approvedRun], lines, staff: [{ id: 'st-1', fullName: 'Sara Ahmed' } as unknown as Staff] }), ADMIN, { currentMonth: '2026-11' });
    equal(table.privileged, true);
    equal(table.rows[0].staff, 'Sara Ahmed');
    equal(table.rows[0].net, 52000);
  });

  it('unpaid payables show names to Admin, totals only to the Accountant (§40)', () => {
    const data = emptyData({ runs: [approvedRun], payables: [payable('l-1', 52000, 'st-1')], staff: [{ id: 'st-1', fullName: 'Sara Ahmed' } as unknown as Staff] });
    const admin = buildPayrollReport('unpaid-payables', data, ADMIN, { currentMonth: '2026-11' });
    equal(admin.rows[0].staff, 'Sara Ahmed');
    const acct = buildPayrollReport('unpaid-payables', data, ACCOUNTANT, { currentMonth: '2026-11' });
    equal(acct.rows[0].staff, undefined);
    equal(acct.rows.find((r) => r.month === '2026-10')!.outstanding, 52000);
  });
});

describe('ageing uses whole calendar months (§40)', () => {
  it('difference across a year boundary', () => {
    equal(ageMonths('2026-10', '2027-02'), 4);
    equal(ageMonths('2026-11', '2026-11'), 0);
  });
});
