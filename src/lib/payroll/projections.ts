// ============================================
// MediCMS Desktop — Staff & Payroll: role-scoped projections (§43, §64 integrity 8,
// §65 t31–t35, t48)
//
// "Hiding a button is never the only protection" (§ permissions rule). The route
// table and every export/print/reconciliation view read the ONE shared `can()`
// set; this module turns that into the actual payloads each role is handed. The
// rule it enforces is integrity 8: no non-Admin projection carries a bank
// account number, a named pay value, a staff-line id tied to an amount, or a
// named payout line. Privilege is decided by the Admin-only `payroll.
// compensation.view` verb — never by a role-name string hard-coded here — so the
// data gate and the route gate can never drift apart. Pure; no store, no clock.
// ============================================

import type { UserRole } from '@/types';
import { can } from '../permissions.ts';
import type { Permission } from '../permissions.ts';
import type {
  PayrollLine,
  PayrollPayoutAllocation,
  PayrollPayoutBatch,
  PayrollRun,
  RunTotals,
  Staff,
} from './types.ts';

/**
 * §43/§64 integrity 8 the single question that unlocks named compensation. It
 * reads the matrix, so an Admin who lacks the verb (never in this build) would
 * still be denied — the projection can't outrun the permission set.
 */
export function canSeeIndividualPay(role: UserRole | undefined): boolean {
  return can(role, 'payroll.compensation.view');
}

// ----------------------------------------------------------------------------
// Staff directory projection (§4, §65 t48)
// ----------------------------------------------------------------------------

/** The directory-safe shape: identity and employment, with the banking/CNIC/notes strip removed. */
export type PublicStaff = Omit<Staff, 'cnic' | 'bankName' | 'bankAccount' | 'accountHolder' | 'notes'>;

const RESTRICTED_STAFF_FIELDS = ['cnic', 'bankName', 'bankAccount', 'accountHolder', 'notes'] as const;

/**
 * §4 a non-Admin sees who works here and their employment status, but never a
 * CNIC, a bank account, the account holder or sensitive notes — the keys are
 * removed from the object, not blanked, so an export or print built from it
 * cannot leak them (§65 t48).
 */
export function getStaffProjection(staff: Staff, role: UserRole | undefined): Staff | PublicStaff {
  if (canSeeIndividualPay(role)) return staff;
  const safe: Partial<Staff> = { ...staff };
  for (const key of RESTRICTED_STAFF_FIELDS) delete safe[key];
  return safe as PublicStaff;
}

// ----------------------------------------------------------------------------
// Pay-run projection (§43, §52, §65 t31)
// ----------------------------------------------------------------------------

export interface PayrollRunSummary {
  runNumber: string;
  serviceMonth: PayrollRun['serviceMonth'];
  kind: PayrollRun['kind'];
  calculationState: PayrollRun['calculationState'];
  disbursementState: PayrollRun['disbursementState'];
  /** §65 t31 the count is safe; the named earning lines are not. */
  staffCount: number;
  totals?: RunTotals;
}

export type PayrollRunProjection =
  | { privileged: true; run: PayrollRun; lines: readonly PayrollLine[] }
  | { privileged: false; summary: PayrollRunSummary };

/**
 * §43 `/staff/payroll/:id` — Admin sees the run and its named lines; everyone
 * else gets the aggregate register view: month, states, staff count and frozen
 * totals, with the lines (staff ids bound to amounts) dropped entirely (§65 t31).
 */
export function getPayrollRunProjection(
  run: PayrollRun,
  lines: readonly PayrollLine[],
  role: UserRole | undefined,
): PayrollRunProjection {
  if (canSeeIndividualPay(role)) return { privileged: true, run, lines };
  return {
    privileged: false,
    summary: {
      runNumber: run.runNumber,
      serviceMonth: run.serviceMonth,
      kind: run.kind,
      calculationState: run.calculationState,
      disbursementState: run.disbursementState,
      staffCount: lines.length,
      totals: run.totals,
    },
  };
}

// ----------------------------------------------------------------------------
// Payout batch projection (§43, §56, §65 t34)
// ----------------------------------------------------------------------------

export interface PayoutBatchAggregate {
  batchNo: string;
  runId: string;
  mode: PayrollPayoutBatch['mode'];
  accountId: string;
  state: PayrollPayoutBatch['state'];
  externalReference?: string;
  /** §65 t34 the Accountant sees how many and how much, not who. */
  recipientCount: number;
  authorizedTotal: number;
}

export type PayoutBatchProjection =
  | { privileged: true; batch: PayrollPayoutBatch; allocations: readonly PayrollPayoutAllocation[] }
  | { privileged: false; aggregate: PayoutBatchAggregate };

/** §56 the batch as an aggregate execution reference for non-Admins; full allocations for Admin. */
export function getPayoutBatchProjection(
  batch: PayrollPayoutBatch,
  allocations: readonly PayrollPayoutAllocation[],
  role: UserRole | undefined,
): PayoutBatchProjection {
  if (canSeeIndividualPay(role)) return { privileged: true, batch, allocations };
  return {
    privileged: false,
    aggregate: {
      batchNo: batch.batchNo,
      runId: batch.runId,
      mode: batch.mode,
      accountId: batch.accountId,
      state: batch.state,
      externalReference: batch.externalReference,
      recipientCount: allocations.length,
      authorizedTotal: allocations.reduce((sum, a) => sum + a.authorizedAmount, 0),
    },
  };
}

/** §28 the payee string a Finance voucher shows for a payroll payout. */
export const RESTRICTED_PAYEE_LABEL = 'Payroll disbursement — restricted';

/** §28/§65 t34 non-Admins see the restricted label; Admin sees the real payee. */
export function payrollVoucherPayee(role: UserRole | undefined, staffName?: string): string {
  return canSeeIndividualPay(role) ? staffName ?? 'Payroll disbursement' : RESTRICTED_PAYEE_LABEL;
}

// ----------------------------------------------------------------------------
// Cheque / reconciliation privacy (§28, §65 t35)
// ----------------------------------------------------------------------------

export interface IssuedChequePayrollView {
  chequeNo: string;
  amount: number;
  date: string;
  status: string;
  payee: string;
}

/**
 * §28/§65 t35 bank reconciliation for an Accountant matches on amount, date and
 * cheque number — never the staff name. Admin sees the named payee; others see
 * the restricted label while the matching figures stay intact.
 */
export function issuedChequePayrollView(
  role: UserRole | undefined,
  cheque: { chequeNo: string; amount: number; date: string; status: string; staffName: string },
): IssuedChequePayrollView {
  return {
    chequeNo: cheque.chequeNo,
    amount: cheque.amount,
    date: cheque.date,
    status: cheque.status,
    payee: payrollVoucherPayee(role, cheque.staffName),
  };
}

// ----------------------------------------------------------------------------
// Route table (§43)
// ----------------------------------------------------------------------------

export interface PayrollRoute {
  path: string;
  permission: Permission;
  /** §43 the Admin-only rows; derived from the matrix by `can()` at check time. */
  adminOnly: boolean;
}

/** §43 navigation and routes. The table is data; the guard reads `can()`. */
export const PAYROLL_ROUTES: readonly PayrollRoute[] = [
  { path: '/staff', permission: 'staff.view', adminOnly: false },
  { path: '/staff/directory', permission: 'staff.directory.view', adminOnly: false },
  { path: '/staff/:id', permission: 'staff.directory.view', adminOnly: false },
  { path: '/staff/:id?tab=pay', permission: 'payroll.compensation.view', adminOnly: true },
  { path: '/staff/:id?tab=advances', permission: 'payroll.advances.view', adminOnly: true },
  { path: '/staff/work-inputs', permission: 'payroll.inputs.manage', adminOnly: true },
  { path: '/staff/advances', permission: 'payroll.advances.view', adminOnly: true },
  { path: '/staff/payroll', permission: 'payroll.summary.view', adminOnly: false },
  { path: '/staff/payroll/new', permission: 'payroll.run.manage', adminOnly: true },
  { path: '/staff/payroll/:id', permission: 'payroll.summary.view', adminOnly: false },
  { path: '/staff/payroll/:id/payouts', permission: 'payroll.payout.manage', adminOnly: true },
  { path: '/staff/payouts', permission: 'payroll.payout.summary', adminOnly: false },
  { path: '/staff/payouts/:id', permission: 'payroll.payout.summary', adminOnly: false },
  { path: '/staff/reports', permission: 'payroll.reports.view', adminOnly: false },
  { path: '/staff/settings', permission: 'payroll.settings.manage', adminOnly: true },
];

/**
 * §43 "routes never confer access by themselves" — resolve the route's permission
 * and ask the shared matrix. An unknown path is denied, and a direct URL typed by
 * an Accountant to an Admin-only tab fails exactly like the hidden button would
 * (§65 t32).
 */
export function canAccessRoute(role: UserRole | undefined, path: string): boolean {
  const route = PAYROLL_ROUTES.find((r) => r.path === path);
  if (!route) return false;
  return can(role, route.permission);
}
