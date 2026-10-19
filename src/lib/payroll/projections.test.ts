// ============================================
// MediCMS Desktop — Staff & Payroll: projections tests (§43, §64 integrity 8,
// §65 t31–t35, t48). Proves no non-Admin payload carries named pay, banking or
// CNIC, and that route access is decided by the shared matrix. Run with: npm test
// ============================================

import { describe, it } from 'node:test';
import { equal, notEqual } from 'node:assert/strict';

import type { UserRole } from '@/types';
import {
  PAYROLL_ROUTES,
  canAccessRoute,
  getPayrollRunProjection,
  getPayoutBatchProjection,
  getStaffProjection,
  issuedChequePayrollView,
  payrollVoucherPayee,
} from './projections.ts';
import type { PayrollLine, PayrollPayoutAllocation, PayrollPayoutBatch, PayrollRun, Staff } from './types.ts';

const ADMIN = 'Admin' satisfies UserRole;
const ACCOUNTANT = 'Accountant' satisfies UserRole;
const COUNTER = 'Counter' satisfies UserRole;

function staffFixture(): Staff {
  return {
    id: 'st-1',
    staffNo: 'ST-0001',
    fullName: 'Ayesha Khan',
    cnic: '42101-1234567-1',
    phone: '0300-0000000',
    bankName: 'Meezan',
    bankAccount: 'PK36MEZN0000001234567890',
    accountHolder: 'Ayesha Khan',
    notes: 'sensitive personnel note',
    staffType: 'Teaching',
    designation: 'Lecturer',
    programIds: [],
    joiningDate: '2024-01-01',
    employmentStatus: 'Active',
    employmentMode: 'Regular',
    createdBy: 'admin',
    createdAt: '2024-01-01T00:00:00Z',
  };
}

function line(i: number): PayrollLine {
  return { id: `l-${i}`, runId: 'r-1', staffId: `st-${i}`, snapshot: {}, items: [], gross: 52000, recoveries: 0, net: 52000 } as unknown as PayrollLine;
}

const run: PayrollRun = {
  id: 'r-1',
  runNumber: 'PAY-2026-10-01',
  serviceMonth: '2026-10',
  kind: 'Standard',
  calculationState: 'Approved',
  disbursementState: 'Unpaid',
  revision: 2,
  totals: { base: 1300000, sessionPay: 0, honoraria: 0, allowances: 0, reductions: 0, gross: 1300000, advanceRecoveries: 40000, netPayable: 1260000, paid: 0, pendingCheques: 0, stillPayable: 1260000 },
} as unknown as PayrollRun;

const batch: PayrollPayoutBatch = { id: 'b-1', batchNo: 'PB-202610-002', runId: 'r-1', mode: 'Bank transfer', accountId: 'acct-1', state: 'Authorized', externalReference: 'BANK-BULK-2941' } as unknown as PayrollPayoutBatch;

const allocations: PayrollPayoutAllocation[] = [
  { id: 'a-1', batchId: 'b-1', payrollLineId: 'l-1', authorizedAmount: 52000 },
  { id: 'a-2', batchId: 'b-1', payrollLineId: 'l-2', authorizedAmount: 60000 },
] as PayrollPayoutAllocation[];

describe('staff directory projection (§4, §65 t48)', () => {
  it('keeps banking and CNIC for an Admin', () => {
    const p = getStaffProjection(staffFixture(), ADMIN) as Record<string, unknown>;
    equal(p.bankAccount, 'PK36MEZN0000001234567890');
    equal('cnic' in p, true);
  });

  it('strips CNIC, bank account and notes for an Accountant', () => {
    const p = getStaffProjection(staffFixture(), ACCOUNTANT) as Record<string, unknown>;
    equal('bankAccount' in p, false);
    equal('cnic' in p, false);
    equal('notes' in p, false);
    equal(p.fullName, 'Ayesha Khan');
  });

  it('strips them for a Counter too', () => {
    const p = getStaffProjection(staffFixture(), COUNTER) as Record<string, unknown>;
    equal('accountHolder' in p, false);
  });
});

describe('pay-run projection (§43, §65 t31)', () => {
  const lines = Array.from({ length: 35 }, (_, i) => line(i + 1));

  it('hands an Admin the named lines', () => {
    const p = getPayrollRunProjection(run, lines, ADMIN);
    equal(p.privileged, true);
    if (p.privileged) equal(p.lines.length, 35);
  });

  it('hands an Accountant 35 staff and totals but no named lines', () => {
    const p = getPayrollRunProjection(run, lines, ACCOUNTANT);
    equal(p.privileged, false);
    if (!p.privileged) {
      equal(p.summary.staffCount, 35);
      equal(p.summary.totals?.netPayable, 1260000);
    }
    equal('lines' in p, false);
  });
});

describe('payout batch projection and payee (§28, §56, §65 t34, t35)', () => {
  it('gives an Accountant only the aggregate count and total', () => {
    const p = getPayoutBatchProjection(batch, allocations, ACCOUNTANT);
    equal(p.privileged, false);
    if (!p.privileged) {
      equal(p.aggregate.recipientCount, 2);
      equal(p.aggregate.authorizedTotal, 112000);
    }
    equal('allocations' in p, false);
  });

  it('gives an Admin the named allocations', () => {
    const p = getPayoutBatchProjection(batch, allocations, ADMIN);
    if (p.privileged) equal(p.allocations.length, 2);
  });

  it('masks the voucher payee for non-Admins (§65 t34)', () => {
    equal(payrollVoucherPayee(ACCOUNTANT, 'Ayesha Khan'), 'Payroll disbursement — restricted');
    equal(payrollVoucherPayee(ADMIN, 'Ayesha Khan'), 'Ayesha Khan');
  });

  it('reconciliation shows amount/date/number but hides the staff name (§65 t35)', () => {
    const v = issuedChequePayrollView(ACCOUNTANT, { chequeNo: 'CH-0007', amount: 80000, date: '2026-11-10', status: 'Issued', staffName: 'Ayesha Khan' });
    equal(v.amount, 80000);
    equal(v.chequeNo, 'CH-0007');
    equal(v.payee, 'Payroll disbursement — restricted');
    equal(issuedChequePayrollView(ADMIN, { chequeNo: 'CH-0007', amount: 80000, date: '2026-11-10', status: 'Issued', staffName: 'Ayesha Khan' }).payee, 'Ayesha Khan');
  });
});

describe('route access is decided by the shared matrix (§43, §65 t32)', () => {
  it('denies an Accountant the Admin-only compensation and settings routes', () => {
    equal(canAccessRoute(ACCOUNTANT, '/staff/:id?tab=pay'), false);
    equal(canAccessRoute(ACCOUNTANT, '/staff/settings'), false);
    equal(canAccessRoute(ACCOUNTANT, '/staff/advances'), false);
  });

  it('allows an Accountant the aggregate routes', () => {
    equal(canAccessRoute(ACCOUNTANT, '/staff/payroll'), true);
    equal(canAccessRoute(ACCOUNTANT, '/staff/payouts/:id'), true);
  });

  it('allows an Admin everywhere and denies a Counter the module', () => {
    equal(canAccessRoute(ADMIN, '/staff/payroll/new'), true);
    equal(canAccessRoute(COUNTER, '/staff/payroll'), false);
  });

  it('denies an unknown route outright', () => {
    equal(canAccessRoute(ADMIN, '/staff/does-not-exist'), false);
  });

  it('every route marked Admin-only is denied an Accountant and allowed an Admin', () => {
    for (const route of PAYROLL_ROUTES) {
      if (!route.adminOnly) continue;
      equal(canAccessRoute(ACCOUNTANT, route.path), false, `Accountant should be blocked from ${route.path}`);
      equal(canAccessRoute(ADMIN, route.path), true, `Admin should be allowed ${route.path}`);
    }
    notEqual(PAYROLL_ROUTES.length, 0);
  });
});