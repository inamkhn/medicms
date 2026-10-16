// ============================================
// Permission rule set — Feature 1 §3
// The doc is explicit: "All permission checks use ONE shared rule set, applied to
// routes, buttons and data actions. Hiding a button is never the only protection."
// So this is the single table; a route guard and a disabled button must both read
// it, and neither may invent its own rule.
// ============================================

import type { UserRole } from '@/types';

/**
 * Capabilities, named by what they unlock rather than by a screen, so one action
 * maps to one verb whether it is a link in the sidebar or a submit button.
 */
export type Permission =
  // read
  | 'dashboard.view' | 'student.view' | 'ledger.view' | 'reports.view' | 'audit.view'
  // students
  | 'student.admit' | 'student.edit' | 'student.strike' | 'student.bulkStrike'
  // money in
  | 'payment.record' | 'payment.reprint' | 'concession.give' | 'concession.approve'
  // money ops
  | 'ledger.adjust' | 'feeTemplate.manage' | 'expense.add' | 'bank.view'
  // finance core — FINANCE_CORE_DESIGN §3, §58. The verbs the money screens ask;
  // 'finance.pay' is the payment-out write — a voucher and its money entry
  // (§29, §63) — which counter operators never hold, because the matrix gives
  // them no payment out at all. 'finance.reconcile' joins with the
  // reconciliation screen. 'finance.cheque' writes or cancels an issued cheque
  // and 'finance.bills' records or adjusts a cost (§26, §32) — viewing is
  // finance.view. The legacy 'expense.add' and 'bank.view' stay until their
  // screens are replaced.
  | 'finance.view' | 'finance.transfer' | 'finance.cheque' | 'finance.bills' | 'finance.pay' | 'finance.petty'
  // academic setup — BATCHES_ACADEMIC_SETUP_DESIGN §3
  | 'academic.view' | 'academic.manage' | 'academic.relink'
  // Batch state actions an Accountant may also take (§3): admissions, term dates, complete.
  | 'academic.admissions' | 'academic.dates' | 'academic.complete'
  // system
  | 'data.import' | 'batch.manage' | 'settings.manage' | 'user.manage';

const READ: Permission[] = ['dashboard.view', 'student.view', 'ledger.view', 'reports.view'];

// Viewer: read-only, plus the audit trail the doc grants it (§3 table, last
// row). "See account balances: Yes" and reports yes — but no individual pay
// (the verbs above it are what it lacks).
const VIEWER: Permission[] = [...READ, 'audit.view', 'academic.view', 'finance.view'];

// Counter operator: admissions, payments, receipt reprint, student lookup.
// No bank, no approvals, no adjustments, no audit (§3). No finance screens —
// "Counter operators only see the first group" (§58) — but the day close is
// theirs for their own counter (§33.2), and it guards on payment.record.
const COUNTER: Permission[] = [
  ...READ,
  'student.admit', 'student.edit',
  'payment.record', 'payment.reprint', 'concession.give',
];

// Accountant: everything financial and reporting, but NOT users/settings or
// bulk strike-off, which are Admin-only (§3).
const ACCOUNTANT: Permission[] = [
  ...READ,
  'audit.view',
  'student.admit', 'student.edit', 'student.strike',
  'payment.record', 'payment.reprint', 'concession.give', 'concession.approve',
  'ledger.adjust', 'feeTemplate.manage', 'expense.add', 'bank.view',
  // Finance §3: sees the money and the accounts, transfers and deposits, writes
  // or cancels cheques, records or adjusts costs and pays out up to the approval
  // limit — above it an Admin approves with their own password (§32).
  'finance.view', 'finance.transfer', 'finance.cheque', 'finance.bills', 'finance.pay', 'finance.petty',
  'data.import', 'batch.manage',
  // Academic setup §3: an Accountant views the pages and may open/close admissions,
  // edit term dates and mark a batch completed — but never creates/edits a batch,
  // renames, reopens a completed batch, deletes or re-links (those stay Admin-only).
  'academic.view', 'academic.admissions', 'academic.dates', 'academic.complete',
];

// Admin: the union of everything, held as an explicit set so `can()` has one shape.
const ADMIN: Permission[] = [
  ...ACCOUNTANT,
  'student.bulkStrike', 'settings.manage', 'user.manage',
  'academic.manage', 'academic.relink',
];

export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  Admin: new Set(ADMIN),
  Accountant: new Set(ACCOUNTANT),
  Counter: new Set(COUNTER),
  Viewer: new Set(VIEWER),
};

/** The one question every guard asks. Undefined role (logged out) can do nothing. */
export function can(role: UserRole | undefined, perm: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].has(perm);
}

/**
 * "Can this role change student data?" Used by list/edit buttons. It is defined
 * through the matrix (student.edit = Admin/Accountant/Counter, not Viewer) rather
 * than a hardcoded role name, so the write gate can never drift from the route gate.
 */
export function canWrite(role: UserRole | undefined): boolean {
  return can(role, 'student.edit');
}
