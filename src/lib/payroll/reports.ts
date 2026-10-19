// ============================================
// MediCMS Desktop — Staff & Payroll: overview, health checks & reports (§39, §45–§46, §58)
//
// Everything the Overview and the report screens show is *derived* here from the
// records the store already holds — never stored, never recomputed in JSX (§6.1,
// §64 integrity 9). Money figures reuse the disbursement core so the picture on
// the overview is exactly the payable position (§29). Privilege is decided once,
// by the shared `canSeeIndividualPay` projection, so a report a non-Admin opens
// cannot carry a named rupee through table, export or print (§43, integrity 8).
// Pure: no store, no clock — the caller supplies `currentMonth` for the age and
// "not finalized" checks. Run with `npm test`.
// ============================================

import type { UserRole } from '@/types';
import { canSeeIndividualPay } from './projections.ts';
import { derivePayablePositions, disbursementClass } from './disbursement.ts';
import { resolveEligibility } from './run.ts';
import { advanceSummary } from './advances.ts';
import type {
  Advance,
  AdvanceEvent,
  PayrollCostPosting,
  PayrollDisbursement,
  PayrollLine,
  PayrollPayoutAllocation,
  PayrollPayoutBatch,
  PayrollPayable,
  PayrollRun,
  PayStructure,
  ServiceMonth,
  Staff,
  WorkInput,
} from './types.ts';

/** The payroll records a report or overview reads. All by reference; nothing stored. */
export interface PayrollReportData {
  staff: readonly Staff[];
  payStructures: readonly PayStructure[];
  workInputs: readonly WorkInput[];
  runs: readonly PayrollRun[];
  lines: readonly PayrollLine[];
  payables: readonly PayrollPayable[];
  costPostings: readonly PayrollCostPosting[];
  advances: readonly Advance[];
  advanceEvents: readonly AdvanceEvent[];
  payoutBatches: readonly PayrollPayoutBatch[];
  payoutAllocations: readonly PayrollPayoutAllocation[];
  disbursements: readonly PayrollDisbursement[];
}

/** Optional inclusive service-month window for the report period filters (§58.1). */
export interface ReportPeriod {
  from?: ServiceMonth;
  to?: ServiceMonth;
}

function inPeriod(month: ServiceMonth, period?: ReportPeriod): boolean {
  if (!period) return true;
  if (period.from && month < period.from) return false;
  if (period.to && month > period.to) return false;
  return true;
}

/** Whole calendar months between a service month and "now" — the ageing in §40. */
export function ageMonths(serviceMonth: ServiceMonth, currentMonth: ServiceMonth): number {
  const [sy, sm] = serviceMonth.split('-').map(Number);
  const [cy, cm] = currentMonth.split('-').map(Number);
  return (cy - sy) * 12 + (cm - sm);
}

function staffName(data: PayrollReportData, staffId: string): string {
  return data.staff.find((s) => s.id === staffId)?.fullName ?? staffId;
}

// ----------------------------------------------------------------------------
// Payment position (§41, §46.1) — the rupee picture the overview shows, by mode
// ----------------------------------------------------------------------------

export interface PaymentPosition {
  approvedNet: number;
  bank: number;
  cash: number;
  chequeCleared: number;
  chequePending: number;
  /** Cleared cash + bank + cleared cheques — the money that has actually left (§41). */
  clearedTotal: number;
  /** Approved net less paid less pending cheques — still to disburse (§29). */
  toDisburse: number;
}

/**
 * §41/§46.1 splits an approved run's settlements by payout mode and keeps an
 * uncleared cheque separate from money out. It reuses the disbursement core's
 * classes so "paid" here means exactly what §29 means — a pending cheque is never
 * counted as a payment. Restricted to one run's payables.
 */
export function computePaymentPosition(
  payables: readonly PayrollPayable[],
  disbursements: readonly PayrollDisbursement[],
  batches: readonly PayrollPayoutBatch[],
): PaymentPosition {
  const modeOf = new Map(batches.map((b) => [b.id, b.mode]));
  const position = new Map(derivePayablePositions(payables, disbursements).map((p) => [p.payrollLineId, p]));

  let bank = 0;
  let cash = 0;
  let chequeCleared = 0;
  let chequePending = 0;
  for (const d of disbursements) {
    const cls = disbursementClass(d);
    if (cls === 'none') continue;
    const mode = modeOf.get(d.batchId);
    if (mode === 'Cheque') {
      if (cls === 'paid') chequeCleared += d.amount;
      else chequePending += d.amount;
    } else if (mode === 'Cash') {
      cash += d.amount;
    } else {
      bank += d.amount;
    }
  }

  let approvedNet = 0;
  let toDisburse = 0;
  for (const p of payables) {
    approvedNet += p.net;
    toDisburse += position.get(p.payrollLineId)?.stillPayable ?? p.net;
  }

  return {
    approvedNet,
    bank,
    cash,
    chequeCleared,
    chequePending,
    clearedTotal: bank + cash + chequeCleared,
    toDisburse,
  };
}

// ----------------------------------------------------------------------------
// Workforce counts and the month's run (§46.1)
// ----------------------------------------------------------------------------

export interface WorkforceCounts {
  active: number;
  onLeave: number;
  /** Staff whose leaving date falls inside the selected service month (§46.1). */
  leftThisMonth: number;
}

export function workforceCounts(staff: readonly Staff[], month: ServiceMonth): WorkforceCounts {
  return {
    active: staff.filter((s) => s.employmentStatus === 'Active').length,
    onLeave: staff.filter((s) => s.employmentStatus === 'On leave').length,
    leftThisMonth: staff.filter((s) => s.leavingDate?.startsWith(month)).length,
  };
}

/**
 * The Standard run that represents a service month on the overview — the Approved
 * one if it exists, else the live Submitted/Draft still in play. Cancelled and
 * Reversed runs are history, never the month's current status (§46.2).
 */
export function runForMonth(runs: readonly PayrollRun[], month: ServiceMonth): PayrollRun | undefined {
  const forMonth = runs.filter(
    (r) => r.serviceMonth === month && r.kind === 'Standard' && r.calculationState !== 'Cancelled' && r.calculationState !== 'Reversed',
  );
  const rank: Record<string, number> = { Approved: 0, Submitted: 1, Draft: 2 };
  return [...forMonth].sort(
    (a, b) => (rank[a.calculationState] ?? 9) - (rank[b.calculationState] ?? 9) || (a.createdAt < b.createdAt ? 1 : -1),
  )[0];
}

// ----------------------------------------------------------------------------
// Health checks (§39)
// ----------------------------------------------------------------------------

export interface HealthCheck {
  id: string;
  /** §42 "every health item opens a screen that can resolve it" — an action route. */
  label: string;
  count: number;
  tone: 'warn' | 'info';
  actionLabel: string;
  actionTo: string;
}

const SIX_MONTHS = 6;

/**
 * §39 the live attention items for the selected month. Only checks that currently
 * apply (count > 0) are returned, each carrying the screen that resolves it. For a
 * non-Admin the caller shows counts and totals only — the labels name no person,
 * so this list is safe to aggregate (§39 closing rule).
 */
export function payrollHealthChecks(data: PayrollReportData, month: ServiceMonth, currentMonth: ServiceMonth): HealthCheck[] {
  const checks: HealthCheck[] = [];
  const eligible = resolveEligibility(data.staff, data.payStructures, month);
  if (eligible.missingStructure.length) {
    checks.push({ id: 'missing-structure', label: `${eligible.missingStructure.length} staff lack a valid pay structure`, count: eligible.missingStructure.length, tone: 'warn', actionLabel: 'Fix rates', actionTo: '/staff/directory' });
  }
  const unverified = data.workInputs.filter((w) => w.serviceMonth === month && w.state === 'Draft').length;
  if (unverified) {
    checks.push({ id: 'inputs-unverified', label: `${unverified} work inputs await verification`, count: unverified, tone: 'warn', actionLabel: 'Open work inputs', actionTo: '/staff/work-inputs' });
  }
  const submitted = data.runs.filter((r) => r.calculationState === 'Submitted').length;
  if (submitted) {
    checks.push({ id: 'draft-awaiting', label: `${submitted} run(s) submitted, waiting for approval`, count: submitted, tone: 'info', actionLabel: 'Review run', actionTo: '/staff/payroll' });
  }
  const unpaidPositions = derivePayablePositions(data.payables, data.disbursements);
  const unpaidLines = unpaidPositions.filter((p) => p.stillPayable > 0).length;
  if (unpaidLines) {
    checks.push({ id: 'approved-unpaid', label: `${unpaidLines} approved line(s) remain unpaid`, count: unpaidLines, tone: 'warn', actionLabel: 'Open payouts', actionTo: '/staff/payouts' });
  }
  const pendingCheques = data.disbursements.filter((d) => disbursementClass(d) === 'pending');
  if (pendingCheques.length) {
    checks.push({ id: 'cheques-pending', label: `${pendingCheques.length} payroll cheque(s) not yet cleared`, count: pendingCheques.length, tone: 'info', actionLabel: 'Issued cheques', actionTo: '/finance/cheques' });
  }
  const stale = pendingCheques.filter((d) => ageMonths(d.actualDate.slice(0, 7), currentMonth) >= SIX_MONTHS).length;
  if (stale) {
    checks.push({ id: 'stale-cheque', label: `${stale} payroll cheque(s) older than six months`, count: stale, tone: 'warn', actionLabel: 'Investigate', actionTo: '/finance/cheques' });
  }
  const recoveryDue = data.advances.filter((a) => {
    if (a.status !== 'Active') return false;
    const bal = advanceSummary(data.advanceEvents.filter((e) => e.advanceId === a.id)).balance;
    return bal > 0 && a.startRecoveryMonth <= month;
  }).length;
  if (recoveryDue) {
    checks.push({ id: 'recovery-due', label: `${recoveryDue} advance(s) scheduled for recovery`, count: recoveryDue, tone: 'info', actionLabel: 'Check pay run', actionTo: '/staff/advances' });
  }
  const leftOwing = data.advances.filter((a) => {
    const person = data.staff.find((s) => s.id === a.staffId);
    if (person?.employmentStatus !== 'Left') return false;
    return advanceSummary(data.advanceEvents.filter((e) => e.advanceId === a.id)).balance > 0;
  }).length;
  if (leftOwing) {
    checks.push({ id: 'advance-after-leaving', label: `${leftOwing} departed staff member(s) still owe an advance`, count: leftOwing, tone: 'warn', actionLabel: 'Review advance', actionTo: '/staff/advances' });
  }
  const monthRun = runForMonth(data.runs, month);
  const finalized = (monthRun?.calculationState === 'Approved') || data.runs.some((r) => r.serviceMonth === month && r.noPayrollReason?.trim());
  if (!finalized) {
    checks.push({ id: 'not-finalized', label: `${month} payroll is not finalized`, count: 1, tone: 'info', actionLabel: 'Open pay run', actionTo: '/staff/payroll' });
  }
  return checks;
}

// ----------------------------------------------------------------------------
// The report registry (§58.1, §40)
// ----------------------------------------------------------------------------

export type PayrollReportName =
  | 'payroll-summary'
  | 'payout-register'
  | 'unpaid-payables'
  | 'staff-earnings'
  | 'advances-recovery'
  | 'cost-by-category'
  | 'pay-structure-history';

export interface PayrollReportDescriptor {
  name: PayrollReportName;
  title: string;
  description: string;
  /** `admin` reports name individual compensation — Admin-only through and through (§40, §58). */
  audience: 'aggregate' | 'admin';
}

/** §58.1 the index. Aggregate first, then the Admin-only block. */
export const PAYROLL_REPORTS: readonly PayrollReportDescriptor[] = [
  { name: 'payroll-summary', title: 'Payroll summary', description: 'Monthly gross, recovery, net and payments.', audience: 'aggregate' },
  { name: 'payout-register', title: 'Payout register', description: 'Batch totals, methods and accounts.', audience: 'aggregate' },
  { name: 'unpaid-payables', title: 'Unpaid salary payable', description: 'Amounts owed and their age.', audience: 'aggregate' },
  { name: 'staff-earnings', title: 'Staff earnings statement', description: 'Named month-by-month history.', audience: 'admin' },
  { name: 'advances-recovery', title: 'Advances and recoveries', description: 'Balances and the recovery schedule.', audience: 'admin' },
  { name: 'cost-by-category', title: 'Cost by staff category', description: 'Private cost breakdown by category.', audience: 'admin' },
  { name: 'pay-structure-history', title: 'Pay structure history', description: 'Rates, effective periods and reasons.', audience: 'admin' },
];

export function payrollReportByName(name: string): PayrollReportDescriptor | undefined {
  return PAYROLL_REPORTS.find((r) => r.name === name);
}

export interface ReportColumn {
  key: string;
  label: string;
  num?: boolean;
}

export type ReportRow = Record<string, string | number>;

export interface ReportTable {
  name: PayrollReportName;
  title: string;
  adminOnly: boolean;
  /** §43 the viewer was handed the rows; false means they were masked. */
  privileged: boolean;
  columns: ReportColumn[];
  rows: ReportRow[];
  note?: string;
}

function approvedRunsWithTotals(runs: readonly PayrollRun[]): PayrollRun[] {
  return runs.filter((r) => r.calculationState === 'Approved' && r.totals);
}

function aggregateBy<T, K extends string>(items: readonly T[], key: (t: T) => K, sum: (t: T) => number): Map<K, number> {
  const map = new Map<K, number>();
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + sum(item));
  return map;
}

// —— individual report builders ————————————————————————————————————————————

function buildPayrollSummary(data: PayrollReportData, period?: ReportPeriod): Pick<ReportTable, 'columns' | 'rows'> {
  const months = new Map<ServiceMonth, { gross: number; recoveries: number; net: number; paid: number; pending: number; outstanding: number }>();
  for (const run of approvedRunsWithTotals(data.runs)) {
    if (!inPeriod(run.serviceMonth, period)) continue;
    const runPayables = data.payables.filter((p) => p.runId === run.id);
    const pos = computePaymentPosition(runPayables, data.disbursements, data.payoutBatches);
    const t = run.totals!;
    const acc = months.get(run.serviceMonth) ?? { gross: 0, recoveries: 0, net: 0, paid: 0, pending: 0, outstanding: 0 };
    acc.gross += t.gross;
    acc.recoveries += t.advanceRecoveries;
    acc.net += t.netPayable;
    acc.paid += pos.clearedTotal;
    acc.pending += pos.chequePending;
    acc.outstanding += pos.toDisburse;
    months.set(run.serviceMonth, acc);
  }
  return {
    columns: [
      { key: 'month', label: 'Service month' },
      { key: 'gross', label: 'Gross', num: true },
      { key: 'recoveries', label: 'Recoveries', num: true },
      { key: 'net', label: 'Net payable', num: true },
      { key: 'paid', label: 'Cleared money out', num: true },
      { key: 'pending', label: 'Pending cheque', num: true },
      { key: 'outstanding', label: 'Outstanding', num: true },
    ],
    rows: [...months.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([month, v]) => ({ month, ...v })),
  };
}

function buildPayoutRegister(data: PayrollReportData, period?: ReportPeriod): Pick<ReportTable, 'columns' | 'rows'> {
  const runMap = new Map(data.runs.map((r) => [r.id, r]));
  const rows = data.payoutBatches
    .map((batch) => {
      const run = runMap.get(batch.runId);
      const allocs = data.payoutAllocations.filter((a) => a.batchId === batch.id);
      return {
        batchNo: batch.batchNo,
        month: run?.serviceMonth ?? '—',
        mode: batch.mode,
        account: batch.accountId,
        recipients: allocs.length,
        total: allocs.reduce((sum, a) => sum + a.authorizedAmount, 0),
        state: batch.state,
      };
    })
    .filter((r) => inPeriod(r.month, period))
    .sort((a, b) => (a.batchNo < b.batchNo ? 1 : -1));
  return {
    columns: [
      { key: 'batchNo', label: 'Batch' },
      { key: 'month', label: 'Service month' },
      { key: 'mode', label: 'Mode' },
      { key: 'account', label: 'Account' },
      { key: 'recipients', label: 'Recipients', num: true },
      { key: 'total', label: 'Authorized total', num: true },
      { key: 'state', label: 'State' },
    ],
    rows,
  };
}

function buildUnpaidPayables(data: PayrollReportData, period: ReportPeriod | undefined, currentMonth: ServiceMonth, privileged: boolean): Pick<ReportTable, 'columns' | 'rows' | 'note'> {
  const positions = new Map(derivePayablePositions(data.payables, data.disbursements).map((p) => [p.payrollLineId, p]));
  const runMap = new Map(data.runs.map((r) => [r.id, r]));
  const owed = data.payables
    .map((p) => ({ p, month: runMap.get(p.runId)?.serviceMonth ?? '—', still: positions.get(p.payrollLineId)?.stillPayable ?? p.net }))
    .filter((x) => x.still > 0 && inPeriod(x.month, period));

  if (!privileged) {
    const byMonth = aggregateBy(owed, (x) => x.month, (x) => x.still);
    return {
      columns: [{ key: 'month', label: 'Service month' }, { key: 'outstanding', label: 'Outstanding', num: true }],
      rows: [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([month, outstanding]) => ({ month, outstanding })),
      note: 'Totals only — the named payables are Admin-only (§40).',
    };
  }
  return {
    columns: [
      { key: 'staff', label: 'Staff' },
      { key: 'month', label: 'Service month' },
      { key: 'outstanding', label: 'Outstanding', num: true },
      { key: 'age', label: 'Age (months)', num: true },
    ],
    rows: owed
      .map((x) => ({ staff: staffName(data, x.p.staffId), month: x.month, outstanding: x.still, age: ageMonths(x.month, currentMonth) }))
      .sort((a, b) => String(b.month).localeCompare(String(a.month)) || (b.outstanding as number) - (a.outstanding as number)),
  };
}

function buildStaffEarnings(data: PayrollReportData, period?: ReportPeriod): Pick<ReportTable, 'columns' | 'rows'> {
  const runMap = new Map(data.runs.map((r) => [r.id, r]));
  const rows = data.lines
    .filter((l) => runMap.get(l.runId)?.calculationState === 'Approved' && inPeriod(runMap.get(l.runId)!.serviceMonth, period))
    .map((l) => ({
      staff: staffName(data, l.staffId),
      month: runMap.get(l.runId)!.serviceMonth,
      gross: l.gross,
      recoveries: l.recoveries,
      net: l.net,
    }))
    .sort((a, b) => String(a.staff).localeCompare(String(b.staff)) || String(b.month).localeCompare(String(a.month)));
  return {
    columns: [
      { key: 'staff', label: 'Staff' },
      { key: 'month', label: 'Service month' },
      { key: 'gross', label: 'Gross', num: true },
      { key: 'recoveries', label: 'Recoveries', num: true },
      { key: 'net', label: 'Net', num: true },
    ],
    rows,
  };
}

function buildAdvancesRecovery(data: PayrollReportData): Pick<ReportTable, 'columns' | 'rows'> {
  const rows = data.advances
    .filter((a) => a.status !== 'Draft')
    .map((a) => {
      const summary = advanceSummary(data.advanceEvents.filter((e) => e.advanceId === a.id));
      return {
        advanceNo: a.advanceNo,
        staff: staffName(data, a.staffId),
        disbursed: summary.disbursed,
        recovered: summary.recovered,
        balance: summary.balance,
        startMonth: a.startRecoveryMonth,
        status: a.status,
      };
    })
    .sort((a, b) => String(a.advanceNo).localeCompare(String(b.advanceNo)));
  return {
    columns: [
      { key: 'advanceNo', label: 'Advance' },
      { key: 'staff', label: 'Staff' },
      { key: 'disbursed', label: 'Disbursed', num: true },
      { key: 'recovered', label: 'Recovered', num: true },
      { key: 'balance', label: 'Outstanding', num: true },
      { key: 'startMonth', label: 'Recovery from' },
      { key: 'status', label: 'Status' },
    ],
    rows,
  };
}

function buildCostByCategory(data: PayrollReportData, period?: ReportPeriod): Pick<ReportTable, 'columns' | 'rows'> {
  const live = data.costPostings.filter((c) => inPeriod(c.serviceMonth, period));
  const totals = aggregateBy(live, (c) => c.category, (c) => c.amount);
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount }));
  return {
    columns: [{ key: 'category', label: 'Cost category' }, { key: 'amount', label: 'Approved gross cost', num: true }],
    rows,
  };
}

function buildPayStructureHistory(data: PayrollReportData): Pick<ReportTable, 'columns' | 'rows'> {
  const rows = [...data.payStructures]
    .sort((a, b) => String(a.staffId).localeCompare(String(b.staffId)) || a.effectiveFrom.localeCompare(b.effectiveFrom))
    .map((p) => ({
      staff: staffName(data, p.staffId),
      type: p.type,
      rate: p.monthlyBase ?? p.honorariumFixed ?? p.ratePerSession ?? 0,
      effectiveFrom: p.effectiveFrom,
      effectiveTo: p.effectiveTo ?? 'current',
      reason: p.reason ?? '—',
    }));
  return {
    columns: [
      { key: 'staff', label: 'Staff' },
      { key: 'type', label: 'Type' },
      { key: 'rate', label: 'Base / rate', num: true },
      { key: 'effectiveFrom', label: 'From' },
      { key: 'effectiveTo', label: 'To' },
      { key: 'reason', label: 'Reason' },
    ],
    rows,
  };
}

/**
 * §58 build one report for the requesting role. An Admin-only report asked for by
 * a non-Admin returns an empty, masked table (the route guard is the first wall;
 * this is the data wall, so an export or print built from it cannot leak §64
 * integrity 8). All figures are derived, never stored.
 */
export function buildPayrollReport(
  name: PayrollReportName,
  data: PayrollReportData,
  role: UserRole | undefined,
  options: { period?: ReportPeriod; currentMonth: ServiceMonth },
): ReportTable {
  const descriptor = payrollReportByName(name)!;
  const privileged = canSeeIndividualPay(role);
  const base = { name, title: descriptor.title, adminOnly: descriptor.audience === 'admin' };

  if (descriptor.audience === 'admin' && !privileged) {
    return { ...base, privileged: false, columns: [], rows: [], note: 'This report names individual compensation and is Admin-only (§58, §43).' };
  }

  let built: Pick<ReportTable, 'columns' | 'rows' | 'note'>;
  switch (name) {
    case 'payroll-summary':
      built = buildPayrollSummary(data, options.period);
      break;
    case 'payout-register':
      built = buildPayoutRegister(data, options.period);
      break;
    case 'unpaid-payables':
      built = buildUnpaidPayables(data, options.period, options.currentMonth, privileged);
      break;
    case 'staff-earnings':
      built = buildStaffEarnings(data, options.period);
      break;
    case 'advances-recovery':
      built = buildAdvancesRecovery(data);
      break;
    case 'cost-by-category':
      built = buildCostByCategory(data, options.period);
      break;
    case 'pay-structure-history':
      built = buildPayStructureHistory(data);
      break;
  }
  return { ...base, privileged: true, ...built };
}
